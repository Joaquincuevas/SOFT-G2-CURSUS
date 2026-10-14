#!/usr/bin/env bash
# Imprime "encendido" o "apagado". Lo usa el workflow para omitir el deploy
# cuando staging está apagado.
#
#   bash infra/aws/staging-estado.sh
source "$(dirname "$0")/comun.sh"
estado_staging
