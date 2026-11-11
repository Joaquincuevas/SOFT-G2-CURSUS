#!/usr/bin/env bash
# LocalStack lo corre al quedar listo (docker-compose.yml): crea el bucket
# local de archivos (MAT-01). LocalStack no guarda datos entre reinicios, así
# que el bucket y sus archivos se crean de nuevo cada vez.
set -euo pipefail
awslocal s3 mb "s3://${S3_BUCKET:-cursus-archivos}"
awslocal s3api put-bucket-versioning --bucket "${S3_BUCKET:-cursus-archivos}" \
  --versioning-configuration Status=Enabled
# Las subidas del navegador van directo al bucket, como en AWS. MAT-09 usa
# el frontend local tanto con localhost como con 127.0.0.1.
awslocal s3api put-bucket-cors --bucket "${S3_BUCKET:-cursus-archivos}" \
  --cors-configuration '{"CORSRules":[{"AllowedOrigins":["http://localhost:5173","http://127.0.0.1:5173"],"AllowedMethods":["GET","HEAD","POST"],"AllowedHeaders":["*"],"MaxAgeSeconds":3600}]}'
