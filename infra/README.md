# infra

Infraestructura del proyecto:

- `docker/backend.Dockerfile`: imagen del backend para staging y producción. Se construye desde la raíz del repo: `docker build -f infra/docker/backend.Dockerfile -t cursus-backend .`. El `docker-compose.yml` de desarrollo local (PostgreSQL) vive en la raíz del repo; ver "Setup local" en el README principal.
- `aws/`: infraestructura de staging en AWS. Ver "Staging (AWS)" en el README principal.
  - `staging.yml`: plantilla de CloudFormation con todo staging (ECR, ECS Fargate, Cloud Map, API Gateway, RDS, secretos, apagado nocturno y rol de GitHub).
  - `staging-infra.sh`: crea o actualiza el stack.
  - `staging-encender.sh`, `staging-apagar.sh` y `staging-estado.sh`: encienden, apagan y consultan staging.
  - `desplegar.sh`: despliega una imagen (migraciones, actualización y verificación). Lo usan el workflow de deploy y `staging-encender.sh`.
  - `comun.sh`: funciones compartidas por los scripts.
- Migraciones de base de datos: viven en `backend/src/database/migrations/` (TypeORM), para que se tipen, se revisen con lint y se compilen con el backend. Ver "Migraciones" en el README principal.
