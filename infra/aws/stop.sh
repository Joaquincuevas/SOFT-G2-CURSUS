#!/usr/bin/env bash
# Apaga un entorno: deja el backend en 0 tareas y detiene la base de datos.
# Apagado solo se cobra el almacenamiento (unos 4 USD al mes por entorno).
#
#   bash infra/aws/stop.sh <staging|production>
source "$(dirname "$0")/common.sh"
use_environment "${1:-}"

SERVICE=$(stack_output Servicio)
if [ -n "$SERVICE" ]; then
  info "Bajando el backend a 0 tareas"
  aws ecs update-service --cluster "$(stack_output Cluster)" --service "$SERVICE" \
    --desired-count 0 >/dev/null
fi

DATABASE=$(stack_output BaseDeDatos)
STATUS=$(aws rds describe-db-instances --db-instance-identifier "$DATABASE" \
  --query 'DBInstances[0].DBInstanceStatus' --output text)
if [ "$STATUS" = available ]; then
  info "Deteniendo la base de datos (termina sola en unos minutos)"
  aws rds stop-db-instance --db-instance-identifier "$DATABASE" >/dev/null
else
  info "La base de datos está en estado '$STATUS'; no se detiene."
fi
info "$ENVIRONMENT apagado."
