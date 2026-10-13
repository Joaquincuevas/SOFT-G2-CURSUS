# infra

Infraestructura del proyecto:

- `docker/`: Dockerfiles de los servicios. El `docker-compose.yml` de desarrollo local (PostgreSQL) vive en la raíz del repo; ver "Setup local" en el README principal
- Migraciones de base de datos: viven en `backend/src/database/migrations/` (TypeORM), para que se tipen, se revisen con lint y se compilen con el backend. Ver "Migraciones" en el README principal
- `aws/`: scripts de AWS (S3, despliegue)
