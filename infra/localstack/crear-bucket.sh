#!/usr/bin/env bash
# LocalStack lo corre al quedar listo (docker-compose.yml): crea el bucket
# local de archivos (MAT-01). LocalStack no guarda datos entre reinicios, así
# que el bucket y sus archivos se crean de nuevo cada vez.
set -euo pipefail
awslocal s3 mb "s3://${S3_BUCKET:-cursus-archivos}"
