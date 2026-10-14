#!/usr/bin/env bash
# Funciones compartidas por los scripts de infra/aws. Se cargan con `source` y
# cada script fija su entorno con use_environment.
# Requieren AWS CLI v2 y jq (vienen instalados en CloudShell y en GitHub Actions).
set -euo pipefail

export AWS_REGION=${AWS_REGION:-us-east-2}
export AWS_DEFAULT_REGION=$AWS_REGION

info() { echo "==> $*"; }
fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# Fija el entorno (staging o production) y el nombre de su stack.
use_environment() {
  case "${1:-}" in
    staging | production) ENVIRONMENT=$1 ;;
    *) fail "Indica el entorno: staging o production." ;;
  esac
  STACK="cursus-$ENVIRONMENT"
}

# Repositorio de imágenes del entorno. Mismo criterio que cursus.yml: staging
# conserva el nombre que tenía antes de existir producción.
repository_name() {
  if [ "$ENVIRONMENT" = staging ]; then
    echo cursus-backend
  else
    echo "cursus-backend-$ENVIRONMENT"
  fi
}

# Valor de una salida del stack (vacío si no existe).
stack_output() {
  local value
  value=$(aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text)
  [ "$value" = None ] && value=''
  echo "$value"
}

# Etiqueta de la imagen más reciente en ECR (vacía si no hay imágenes).
latest_image() {
  local tag
  tag=$(aws ecr describe-images --repository-name "$(repository_name)" \
    --query 'sort_by(imageDetails,&imagePushedAt)[-1].imageTags[0]' \
    --output text 2>/dev/null || true)
  [ "$tag" = None ] && tag=''
  echo "$tag"
}

# Etiqueta de la imagen que usa hoy el servicio (vacía si no existe).
service_image() {
  local definition
  definition=$(aws ecs describe-services --cluster "$STACK" --services backend \
    --query "services[?status=='ACTIVE'].taskDefinition | [0]" --output text 2>/dev/null || true)
  if [ -z "$definition" ] || [ "$definition" = None ]; then
    return
  fi
  aws ecs describe-task-definition --task-definition "$definition" \
    --query 'taskDefinition.containerDefinitions[0].image' --output text | sed 's/.*://'
}

# Imprime "encendido" si el backend tiene tareas deseadas y la base está
# disponible; "apagado" en cualquier otro caso (incluido si aún no existe).
environment_status() {
  local tasks instance database
  tasks=$(aws ecs describe-services --cluster "$STACK" --services backend \
    --query "services[?status=='ACTIVE'].desiredCount | [0]" --output text 2>/dev/null || true)
  instance=$(stack_output BaseDeDatos 2>/dev/null || true)
  database=$(aws rds describe-db-instances --db-instance-identifier "$instance" \
    --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || true)
  if [ -n "$tasks" ] && [ "$tasks" != None ] && [ "$tasks" -gt 0 ] && [ "$database" = available ]; then
    echo encendido
  else
    echo apagado
  fi
}
