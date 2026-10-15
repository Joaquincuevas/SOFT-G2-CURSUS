# syntax=docker/dockerfile:1
# Imagen del backend para staging y producción. Se construye desde la raíz del
# monorepo:
#   docker build -f infra/docker/backend.Dockerfile -t cursus-backend .
#
# Imágenes de ECR Public: son las oficiales de Docker, sin el límite de
# descargas anónimas de Docker Hub. Node 22: argon2 0.45 (hash de contraseñas)
# se cae con SIGSEGV al cargarse en Linux con Node 20.
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-alpine

# 1. Compila shared y backend con todas las dependencias.
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# --ignore-scripts: los scripts de la raíz (husky, postinstall) no aplican aquí;
# shared se compila explícitamente.
RUN npm ci --ignore-scripts
COPY shared/ shared/
COPY backend/ backend/
RUN npm run build --workspace=shared && npm run build --workspace=backend

# 2. Solo las dependencias de producción del backend.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --ignore-scripts --workspace=backend

# 3. Imagen final: código compilado y dependencias de producción, sin código
# fuente ni herramientas de desarrollo.
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
# Certificados de RDS para validar la conexión SSL (POSTGRES_SSL=true). La
# carpeta se crea antes porque, si no existe en la imagen base, ADD --chmod
# también aplicaría 644 a las carpetas que crea y no se podrían recorrer.
RUN mkdir -p /etc/ssl/certs
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/shared/package.json shared/
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/backend/package.json backend/
COPY --from=build /app/backend/dist backend/dist
WORKDIR /app/backend
USER node
EXPOSE 3000
# Para docker local. En ECS el health check se define en la tarea.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
# Migraciones: npm run migration:run:prod (mismo directorio de trabajo).
CMD ["node", "dist/main.js"]
