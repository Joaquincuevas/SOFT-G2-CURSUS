#!/usr/bin/env bash
# Enciende un entorno: inicia la base de datos y despliega la imagen más
# reciente de ECR (o la indicada), con sus migraciones. Tarda entre 5 y 20 minutos.
#
#   bash infra/aws/start.sh <staging|production> [tag]
#
# Quien enciende, apaga al terminar (stop.sh).
source "$(dirname "$0")/common.sh"
use_environment "${1:-}"

DATABASE=$(stack_output BaseDeDatos)
STATUS=$(aws rds describe-db-instances --db-instance-identifier "$DATABASE" \
  --query 'DBInstances[0].DBInstanceStatus' --output text)
case "$STATUS" in
  stopped)
    info "Iniciando la base de datos"
    aws rds start-db-instance --db-instance-identifier "$DATABASE" >/dev/null
    ;;
  stopping)
    fail "La base de datos se está deteniendo. Espera unos minutos y vuelve a intentar."
    ;;
esac
info "Esperando la base de datos (puede tardar 5 a 15 minutos)"
aws rds wait db-instance-available --db-instance-identifier "$DATABASE"

TAG=${2:-$(latest_image)}
[ -n "$TAG" ] || fail "No hay imágenes en ECR. Haz un merge o corre el workflow de deploy."
bash "$(dirname "$0")/deploy.sh" "$ENVIRONMENT" "$TAG" --start
