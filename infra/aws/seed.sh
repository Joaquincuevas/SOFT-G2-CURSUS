#!/usr/bin/env bash
# Carga los datos simulados del seed (INFRA-08) en la base de staging. Corre como
# una tarea aparte de ECS con la imagen que usa el servicio. Se puede repetir: el
# seed actualiza los datos existentes en vez de duplicarlos.
#
#   bash infra/aws/seed.sh staging
#
# Requiere staging encendido (start.sh staging). La contraseña de los usuarios de
# prueba está en Secrets Manager: cursus-staging/seed-password.
source "$(dirname "$0")/common.sh"
use_environment "${1:-}"

[ "$ENVIRONMENT" = staging ] || fail "El seed solo se carga en staging, nunca en $ENVIRONMENT."
[ "$(environment_status)" = encendido ] ||
  fail "staging está apagado. Enciéndelo con: bash infra/aws/start.sh staging"

CLUSTER=$(stack_output Cluster)
SERVICE=$(stack_output Servicio)
DEFINITION=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].taskDefinition' --output text)

# La contraseña llega a la tarea como secreto (SEED_PASSWORD), definido en
# cursus.yml solo para staging.
HAS_PASSWORD=$(aws ecs describe-task-definition --task-definition "$DEFINITION" \
  --query "length(taskDefinition.containerDefinitions[0].secrets[?name=='SEED_PASSWORD'])" \
  --output text)
[ "$HAS_PASSWORD" = 1 ] ||
  fail "La tarea no tiene SEED_PASSWORD. Aplica la plantilla con: bash infra/aws/stack.sh staging"

info "Cargando el seed en staging"
TASK=$(aws ecs run-task --cluster "$CLUSTER" --task-definition "$DEFINITION" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$(stack_output Subredes)],securityGroups=[$(stack_output GrupoTareas)],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"backend","command":["npm","run","seed:prod"],"environment":[{"name":"SEED_ALLOW","value":"true"}]}]}' \
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
  fail "El seed falló (código $EXIT_CODE)."
fi
info "Seed cargado. Contraseña de los usuarios: aws secretsmanager get-secret-value --secret-id cursus-staging/seed-password --query SecretString --output text"
