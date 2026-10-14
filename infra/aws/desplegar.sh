#!/usr/bin/env bash
# Despliega una imagen de ECR en staging. Lo usan el workflow de deploy y
# staging-encender.sh; la base de datos debe estar disponible.
#
#   bash infra/aws/desplegar.sh <tag> [--encender]
#
# 1. Registra una revisión de la definición de tarea con la imagen nueva.
# 2. Corre las migraciones como una tarea aparte; si fallan, no cambia nada.
# 3. Actualiza el servicio (--encender además lo deja en 1 tarea) y espera.
#    Si la versión nueva no pasa el health check, ECS vuelve a la anterior.
# 4. Verifica /api/health/db en la URL pública.
source "$(dirname "$0")/comun.sh"

TAG=${1:?Uso: desplegar.sh <tag> [--encender]}
ENCENDER=${2:-}

CLUSTER=$(salida Cluster)
SERVICIO=$(salida Servicio)
[ -n "$SERVICIO" ] || error "El servicio de ECS aún no existe. Corre staging-infra.sh."
aws ecr describe-images --repository-name "$REPOSITORIO" --image-ids "imageTag=$TAG" >/dev/null ||
  error "La imagen $TAG no existe en ECR."

info "Registrando la definición de tarea con la imagen $TAG"
ACTUAL=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICIO" \
  --query 'services[0].taskDefinition' --output text)
DEFINICION=$(mktemp)
trap 'rm -f "$DEFINICION"' EXIT
aws ecs describe-task-definition --task-definition "$ACTUAL" --query taskDefinition |
  jq --arg imagen "$(salida RepositorioUri):$TAG" '
    .containerDefinitions[0].image = $imagen
    | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
          .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)' >"$DEFINICION"
NUEVA=$(aws ecs register-task-definition --cli-input-json "file://$DEFINICION" \
  --query 'taskDefinition.taskDefinitionArn' --output text)

info "Corriendo las migraciones"
TAREA=$(aws ecs run-task --cluster "$CLUSTER" --task-definition "$NUEVA" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$(salida Subredes)],securityGroups=[$(salida GrupoTareas)],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"backend","command":["npm","run","migration:run:prod"]}]}' \
  --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TAREA"
aws logs get-log-events --log-group-name "$(salida GrupoLogs)" \
  --log-stream-name "backend/backend/${TAREA##*/}" \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' || true
CODIGO=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TAREA" \
  --query 'tasks[0].containers[0].exitCode' --output text)
if [ "$CODIGO" != 0 ]; then
  aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TAREA" \
    --query 'tasks[0].stoppedReason' --output text >&2
  error "Las migraciones fallaron (código $CODIGO). Staging sigue con la versión anterior."
fi

info "Actualizando el servicio"
ARGUMENTOS=(--cluster "$CLUSTER" --service "$SERVICIO" --task-definition "$NUEVA")
[ "$ENCENDER" = --encender ] && ARGUMENTOS+=(--desired-count 1)
aws ecs update-service "${ARGUMENTOS[@]}" >/dev/null
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICIO" ||
  error "El servicio no quedó estable a tiempo. Revisa los eventos del servicio en la consola de ECS."
EN_USO=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICIO" \
  --query 'services[0].taskDefinition' --output text)
[ "$EN_USO" = "$NUEVA" ] ||
  error "La versión nueva no pasó el health check y ECS volvió a la anterior."

info "Verificando /api/health/db"
SECRETO=$(aws secretsmanager get-secret-value --secret-id "$(salida SecretoOrigenArn)" \
  --query SecretString --output text)
# En GitHub Actions, el valor no aparece en los logs.
[ "${GITHUB_ACTIONS:-}" = true ] && echo "::add-mask::$SECRETO"
URL="$(salida ApiUrl)/api/health/db"
# Cloud Map tarda unos segundos en anunciar la tarea nueva.
for _ in $(seq 1 24); do
  RESPUESTA=$(curl -s -o /dev/null -w '%{http_code}' -H "x-origin-secret: $SECRETO" "$URL" || true)
  if [ "$RESPUESTA" = 200 ]; then
    info "Staging responde en $URL con la imagen $TAG"
    exit 0
  fi
  sleep 5
done
error "$URL respondió $RESPUESTA en vez de 200."
