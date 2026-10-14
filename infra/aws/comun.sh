#!/usr/bin/env bash
# Funciones compartidas por los scripts de staging. Se cargan con `source`.
# Requieren AWS CLI v2 y jq (vienen instalados en CloudShell y en GitHub Actions).
set -euo pipefail

STACK=cursus-staging
REPOSITORIO=cursus-backend
export AWS_REGION=${AWS_REGION:-us-east-2}
export AWS_DEFAULT_REGION=$AWS_REGION

info() { echo "==> $*"; }
error() {
  echo "ERROR: $*" >&2
  exit 1
}

# Valor de una salida del stack (vacío si no existe).
salida() {
  local valor
  valor=$(aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text)
  [ "$valor" = None ] && valor=''
  echo "$valor"
}

# Etiqueta de la imagen más reciente en ECR (vacía si no hay imágenes).
ultima_imagen() {
  local tag
  tag=$(aws ecr describe-images --repository-name "$REPOSITORIO" \
    --query 'sort_by(imageDetails,&imagePushedAt)[-1].imageTags[0]' \
    --output text 2>/dev/null || true)
  [ "$tag" = None ] && tag=''
  echo "$tag"
}

# Etiqueta de la imagen que usa hoy el servicio (vacía si no existe).
imagen_del_servicio() {
  local definicion
  definicion=$(aws ecs describe-services --cluster "$STACK" --services backend \
    --query "services[?status=='ACTIVE'].taskDefinition | [0]" --output text 2>/dev/null || true)
  if [ -z "$definicion" ] || [ "$definicion" = None ]; then
    return
  fi
  aws ecs describe-task-definition --task-definition "$definicion" \
    --query 'taskDefinition.containerDefinitions[0].image' --output text | sed 's/.*://'
}

# Imprime "encendido" si el backend tiene tareas deseadas y la base está
# disponible; "apagado" en cualquier otro caso (incluido si aún no existe).
estado_staging() {
  local tareas base
  tareas=$(aws ecs describe-services --cluster "$STACK" --services backend \
    --query "services[?status=='ACTIVE'].desiredCount | [0]" --output text 2>/dev/null || true)
  base=$(aws rds describe-db-instances --db-instance-identifier "$STACK" \
    --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || true)
  if [ -n "$tareas" ] && [ "$tareas" != None ] && [ "$tareas" -gt 0 ] && [ "$base" = available ]; then
    echo encendido
  else
    echo apagado
  fi
}
