#!/usr/bin/env bash
# Enciende staging: inicia la base de datos y despliega la imagen más reciente
# de ECR (o la indicada), con sus migraciones. Tarda entre 5 y 20 minutos.
#
#   bash infra/aws/staging-encender.sh [tag]
#
# Quien enciende, apaga al terminar (staging-apagar.sh).
source "$(dirname "$0")/comun.sh"

BASE=$(salida BaseDeDatos)
ESTADO=$(aws rds describe-db-instances --db-instance-identifier "$BASE" \
  --query 'DBInstances[0].DBInstanceStatus' --output text)
case "$ESTADO" in
  stopped)
    info "Iniciando la base de datos"
    aws rds start-db-instance --db-instance-identifier "$BASE" >/dev/null
    ;;
  stopping)
    error "La base de datos se está deteniendo. Espera unos minutos y vuelve a intentar."
    ;;
esac
info "Esperando la base de datos (puede tardar 5 a 15 minutos)"
aws rds wait db-instance-available --db-instance-identifier "$BASE"

TAG=${1:-$(ultima_imagen)}
[ -n "$TAG" ] || error "No hay imágenes en ECR. Haz un merge a develop o corre el workflow de deploy."
bash "$(dirname "$0")/desplegar.sh" "$TAG" --encender
