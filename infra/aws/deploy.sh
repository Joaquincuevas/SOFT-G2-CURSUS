#!/usr/bin/env bash
# Despliega una imagen de ECR en un entorno. Lo usan el workflow de deploy y
# start.sh; la base de datos debe estar disponible.
#
#   bash infra/aws/deploy.sh <staging|production> <tag> [--start]
#
# 1. Registra una revisión de la definición de tarea con la imagen nueva.
# 2. Corre las migraciones como una tarea aparte; si fallan, no cambia nada.
# 3. Actualiza el servicio (--start además lo deja en 1 tarea) y espera.
#    Si la versión nueva no pasa el health check, ECS vuelve a la anterior.
# 4. Verifica /api/health/db en la URL pública.
source "$(dirname "$0")/common.sh"
use_environment "${1:-}"

TAG=${2:?Uso: deploy.sh <staging|production> <tag> [--start]}
START=${3:-}

CLUSTER=$(stack_output Cluster)
SERVICE=$(stack_output Servicio)
[ -n "$SERVICE" ] || fail "El servicio de ECS aún no existe. Corre stack.sh $ENVIRONMENT."
aws ecr describe-images --repository-name "$(repository_name)" --image-ids "imageTag=$TAG" >/dev/null ||
  fail "La imagen $TAG no existe en ECR."

info "Registrando la definición de tarea con la imagen $TAG"
CURRENT=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].taskDefinition' --output text)
DEFINITION=$(mktemp)
trap 'rm -f "$DEFINITION"' EXIT
aws ecs describe-task-definition --task-definition "$CURRENT" --query taskDefinition |
  jq --arg image "$(stack_output RepositorioUri):$TAG" '
    .containerDefinitions[0].image = $image
    | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
          .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)' >"$DEFINITION"
NEW=$(aws ecs register-task-definition --cli-input-json "file://$DEFINITION" \
  --query 'taskDefinition.taskDefinitionArn' --output text)

info "Corriendo las migraciones"
TASK=$(aws ecs run-task --cluster "$CLUSTER" --task-definition "$NEW" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$(stack_output Subredes)],securityGroups=[$(stack_output GrupoTareas)],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"backend","command":["npm","run","migration:run:prod"]}]}' \
  --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK"
aws logs get-log-events --log-group-name "$(stack_output GrupoLogs)" \
  --log-stream-name "backend/backend/${TASK##*/}" \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' || true
EXIT_CODE=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" \
  --query 'tasks[0].containers[0].exitCode' --output text)
if [ "$EXIT_CODE" != 0 ]; then
  aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" \
    --query 'tasks[0].stoppedReason' --output text >&2
  fail "Las migraciones fallaron (código $EXIT_CODE). $ENVIRONMENT sigue con la versión anterior."
fi

info "Actualizando el servicio"
ARGUMENTS=(--cluster "$CLUSTER" --service "$SERVICE" --task-definition "$NEW")
[ "$START" = --start ] && ARGUMENTS+=(--desired-count 1)
aws ecs update-service "${ARGUMENTS[@]}" >/dev/null
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE" ||
  fail "El servicio no quedó estable a tiempo. Revisa los eventos del servicio en la consola de ECS."
IN_USE=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].taskDefinition' --output text)
[ "$IN_USE" = "$NEW" ] ||
  fail "La versión nueva no pasó el health check y ECS volvió a la anterior."

info "Verificando /api/health/db"
SECRET=$(aws secretsmanager get-secret-value --secret-id "$(stack_output SecretoOrigenArn)" \
  --query SecretString --output text)
# En GitHub Actions, el valor no aparece en los logs.
[ "${GITHUB_ACTIONS:-}" = true ] && echo "::add-mask::$SECRET"
URL="$(stack_output ApiUrl)/api/health/db"
# Cloud Map tarda unos segundos en anunciar la tarea nueva.
for _ in $(seq 1 24); do
  RESPONSE=$(curl -s -o /dev/null -w '%{http_code}' -H "x-origin-secret: $SECRET" "$URL" || true)
  if [ "$RESPONSE" = 200 ]; then
    info "$ENVIRONMENT responde en $URL con la imagen $TAG"
    exit 0
  fi
  sleep 5
done
fail "$URL respondió $RESPONSE en vez de 200."
