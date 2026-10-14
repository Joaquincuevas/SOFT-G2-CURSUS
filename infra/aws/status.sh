#!/usr/bin/env bash
# Imprime "encendido" o "apagado". Lo usa el workflow para omitir el deploy
# cuando el entorno está apagado.
#
#   bash infra/aws/status.sh <staging|production>
source "$(dirname "$0")/common.sh"
use_environment "${1:-}"
environment_status
