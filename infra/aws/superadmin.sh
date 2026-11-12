#!/usr/bin/env bash
# Crea el superadmin (MT-04) en la base del entorno. Es la única forma de crear
# uno: la API no puede. Corre como una tarea aparte de ECS con la imagen que usa
# el servicio, igual que seed.sh.
#
#   bash infra/aws/superadmin.sh production <correo> "<nombre>"
#
# Requiere el entorno encendido (start.sh <entorno>). La contraseña provisoria es
# el secreto cursus-<entorno>/superadmin-password: nunca pasa por la línea de
# comandos ni por los logs, y el superadmin la cambia en su primer ingreso
# (PER-03). Falla sin cambiar nada si el correo ya existe o es del dominio de una
# universidad.
source "$(dirname "$0")/common.sh"
use_environment "${1:-}"
CORREO=${2:-}
NOMBRE=${3:-}
[ -n "$CORREO" ] && [ -n "$NOMBRE" ] ||
  fail "Uso: bash infra/aws/superadmin.sh $ENVIRONMENT <correo> \"<nombre>\""
[ "$(environment_status)" = encendido ] ||
  fail "$ENVIRONMENT está apagado. Enciéndelo con: bash infra/aws/start.sh $ENVIRONMENT"

CLUSTER=$(stack_output Cluster)
SERVICE=$(stack_output Servicio)
DEFINITION=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].taskDefinition' --output text)

# La contraseña llega a la tarea como secreto (SUPERADMIN_PASSWORD), definido en
# cursus.yml.
HAS_PASSWORD=$(aws ecs describe-task-definition --task-definition "$DEFINITION" \
  --query "length(taskDefinition.containerDefinitions[0].secrets[?name=='SUPERADMIN_PASSWORD'])" \
  --output text)
[ "$HAS_PASSWORD" = 1 ] ||
  fail "La tarea no tiene SUPERADMIN_PASSWORD. Aplica la plantilla con: bash infra/aws/stack.sh $ENVIRONMENT"

# jq arma el JSON: así un nombre con comillas o tildes no rompe los overrides.
OVERRIDES=$(jq -n --arg correo "$CORREO" --arg nombre "$NOMBRE" '{
  containerOverrides: [{
    name: "backend",
    command: ["npm", "run", "superadmin:prod"],
    environment: [
      { name: "SUPERADMIN_CORREO", value: $correo },
      { name: "SUPERADMIN_NOMBRE", value: $nombre }
    ]
  }]
}')

info "Creando el superadmin $CORREO en $ENVIRONMENT"
TASK=$(aws ecs run-task --cluster "$CLUSTER" --task-definition "$DEFINITION" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$(stack_output Subredes)],securityGroups=[$(stack_output GrupoTareas)],assignPublicIp=ENABLED}" \
  --overrides "$OVERRIDES" \
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
  fail "No se creó el superadmin (código $EXIT_CODE)."
fi
info "Superadmin creado. Contraseña provisoria: aws secretsmanager get-secret-value --secret-id cursus-$ENVIRONMENT/superadmin-password --query SecretString --output text"
