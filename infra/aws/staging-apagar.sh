#!/usr/bin/env bash
# Apaga staging: deja el backend en 0 tareas y detiene la base de datos.
# Apagado solo se cobra el almacenamiento (unos 3 USD al mes).
#
#   bash infra/aws/staging-apagar.sh
source "$(dirname "$0")/comun.sh"

SERVICIO=$(salida Servicio)
if [ -n "$SERVICIO" ]; then
  info "Bajando el backend a 0 tareas"
  aws ecs update-service --cluster "$(salida Cluster)" --service "$SERVICIO" \
    --desired-count 0 >/dev/null
fi

BASE=$(salida BaseDeDatos)
ESTADO=$(aws rds describe-db-instances --db-instance-identifier "$BASE" \
  --query 'DBInstances[0].DBInstanceStatus' --output text)
if [ "$ESTADO" = available ]; then
  info "Deteniendo la base de datos (termina sola en unos minutos)"
  aws rds stop-db-instance --db-instance-identifier "$BASE" >/dev/null
else
  info "La base de datos está en estado '$ESTADO'; no se detiene."
fi
info "Staging apagado."
