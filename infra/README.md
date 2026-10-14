# infra

Infraestructura del proyecto:

- `docker/backend.Dockerfile`: imagen del backend para staging y producción. Se construye desde la raíz del repo: `docker build -f infra/docker/backend.Dockerfile -t cursus-backend .`. El `docker-compose.yml` de desarrollo local (PostgreSQL) vive en la raíz del repo; ver "Setup local" en el README principal.
- `aws/`: infraestructura de los entornos en AWS (staging y production). Ver "Entornos en AWS" en el README principal. Todos los scripts reciben el entorno como primer argumento.
  - `cursus.yml`: plantilla de CloudFormation de un entorno (ECR, ECS Fargate, Cloud Map, API Gateway, RDS, secretos, apagado nocturno y acceso de GitHub), con el parámetro `Entorno`.
  - `stack.sh`: crea o actualiza el stack de un entorno; con `--dry-run` solo muestra qué cambiaría.
  - `start.sh`, `stop.sh` y `status.sh`: encienden, apagan y consultan un entorno.
  - `deploy.sh`: despliega una imagen (migraciones, actualización y verificación). Lo usan el workflow de deploy y `start.sh`.
  - `common.sh`: funciones compartidas por los scripts.
- Migraciones de base de datos: viven en `backend/src/database/migrations/` (TypeORM), para que se tipen, se revisen con lint y se compilen con el backend. Ver "Migraciones" en el README principal.
