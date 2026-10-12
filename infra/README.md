# infra

Infraestructura del proyecto:

- `docker/`: Dockerfiles de los servicios. El `docker-compose.yml` de desarrollo local (PostgreSQL) vive en la raíz del repo; ver "Setup local" en el README principal
- `migrations/`: migraciones de base de datos y políticas de Row-Level Security
- `aws/`: scripts de AWS (S3, despliegue)
