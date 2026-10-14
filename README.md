# CURSUS

Sistema de gestión académica **multiuniversidad**. Proyecto del curso **ICC 4204 Introducción a la Ingeniería de Software** (Universidad de los Andes), Grupo 2.

Cada universidad opera sobre la misma plataforma con sus datos aislados mediante Row-Level Security en PostgreSQL.

## Stack tecnológico

| Capa          | Tecnología                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Frontend      | React + Vite + TypeScript                                                                                  |
| Backend       | NestJS + TypeScript + Node.js                                                                              |
| Base de datos | PostgreSQL (Row-Level Security por universidad)                                                            |
| Archivos      | Amazon S3                                                                                                  |
| Monorepo      | npm workspaces                                                                                             |
| Calidad       | ESLint, Prettier, Vitest (+ React Testing Library), GitHub Actions (lint, test, build), commitlint + husky |

## Estructura de carpetas

```
SOFT-G2-CURSUS/
├── frontend/            # React + Vite + TypeScript
├── backend/             # NestJS + TypeScript
├── shared/              # DTOs y tipos compartidos (@cursus/shared)
├── infra/               # Dockerfile del backend e infraestructura de staging (AWS)
├── docs/                # Informes, diagramas C4, ADRs
├── .github/
│   ├── workflows/
│   │   ├── ci.yml             # Pipeline: lint + test + build + commitlint
│   │   ├── pr-title.yml       # Valida el título del PR (Conventional Commits)
│   │   └── deploy.yml         # Deploy de develop a staging y de main a producción
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── .husky/commit-msg    # Valida el mensaje de commit en local
├── commitlint.config.js
├── docker-compose.yml   # PostgreSQL para desarrollo local
├── .env.example         # Variables de entorno de ejemplo
├── package.json         # Configuración de workspaces
└── README.md
```

## Setup local

Requisitos: **Node.js 20.19+**, **npm 10+** y **Docker** con Compose v2 (`docker compose version`).

```bash
# 1. Clona el repo y entra a develop
git clone https://github.com/Joaquincuevas/SOFT-G2-CURSUS.git
cd SOFT-G2-CURSUS
git switch develop
# 2. Instala dependencias (compila shared y activa los hooks de husky)
npm install
# 3. Crea tu archivo de variables de entorno
cp .env.example .env
# 4. Levanta PostgreSQL (vuelve cuando la base está lista)
docker compose up -d --wait
```

Con eso la base de datos queda disponible en `localhost:5432` (o en el puerto que definas en `POSTGRES_PORT`). Luego levanta las apps:

```bash
npm run dev:front    # frontend en http://localhost:5173
npm run dev:back     # backend en http://localhost:3000/api
```

### Base de datos local

Las credenciales y el puerto se leen desde `.env` (no se versiona). `.env.example` trae valores de desarrollo.

```bash
docker compose ps                                          # estado del contenedor
docker compose logs -f postgres                            # logs
docker compose exec postgres psql -U cursus -d cursus      # consola SQL
docker compose down                                        # detiene; los datos se conservan
docker compose down -v                                     # detiene y borra los datos
```

- En la consola SQL, `-U cursus -d cursus` son los valores de `.env.example`. Si cambiaste `POSTGRES_USER` o `POSTGRES_DB` en tu `.env`, usa los tuyos.
- Si el puerto 5432 ya está ocupado, cambia `POSTGRES_PORT` en `.env` y vuelve a ejecutar `docker compose up -d --wait`.
- Usuario, contraseña y nombre de la base solo se aplican al crear el volumen. Si los cambias en `.env` después, ejecuta `docker compose down -v` y levanta de nuevo.

### Migraciones

El schema se versiona con migraciones de TypeORM en `backend/src/database/migrations/`. Con la base levantada:

```bash
npm run migration:run --workspace=backend      # aplica las migraciones pendientes
npm run migration:revert --workspace=backend   # revierte la última migración aplicada
npm run migration:show --workspace=backend     # lista las migraciones ([X] = aplicada)
npm run test:db --workspace=backend            # tests del schema contra PostgreSQL
```

- La conexión usa las variables `POSTGRES_*` de `.env`.
- `test:db` crea y borra su propia base (`POSTGRES_TEST_DB`, por defecto `cursus_test`), así que no toca tus datos de desarrollo. `npm run test` no incluye estos tests, porque no necesita Docker; el CI corre ambos.
- Las migraciones que ya están en `develop` no se modifican. Si el schema cambia, crea una migración nueva.

### Datos simulados (seed)

Con las migraciones aplicadas, carga dos universidades de prueba que imitan el escenario del cliente: una grande con varias facultades y otra pequeña de ciencias de la salud.

```bash
npm run seed --workspace=backend
```

> **Solo para desarrollo y pruebas.** Estas credenciales son públicas: no las uses en producción. Con `NODE_ENV=production` el seed se niega a correr, salvo que se defina `SEED_ALLOW=true` (por ejemplo, para levantar staging).

- Se puede ejecutar las veces que quieras: actualiza los datos existentes en vez de duplicarlos.
- La contraseña de todos los usuarios es el valor de `SEED_PASSWORD` en tu `.env` (`cursus_demo` en `.env.example`). Se guarda hasheada con argon2id.
- Los dominios usan `.test`, un TLD reservado, así que ningún correo es real.
- El período 2026-2 queda activo solo si la universidad no tiene ya otro período activo.

| Universidad            | Facultades y carreras                                                                                            | Período |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ------- |
| Universidad Demo Norte | Facultad de Ingeniería (Ingeniería Civil en Informática), Facultad de Economía y Negocios (Ingeniería Comercial) | 2026-2  |
| Universidad Demo Sur   | Facultad de Ciencias de la Salud (Enfermería)                                                                    | 2026-2  |

| Rol            | Universidad Demo Norte                                                                                                        | Universidad Demo Sur             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Director       | `director@norte.cursus.test`                                                                                                  | `director@sur.cursus.test`       |
| Administrativo | `administrativo.ingenieria@norte.cursus.test` (Ingeniería), `administrativo.economia@norte.cursus.test` (Economía y Negocios) | `administrativo@sur.cursus.test` |
| Profesor       | `profesor@norte.cursus.test`                                                                                                  | `profesor@sur.cursus.test`       |
| Ayudante       | `ayudante@norte.cursus.test`                                                                                                  | `ayudante@sur.cursus.test`       |
| Alumno         | `alumno@norte.cursus.test`                                                                                                    | `alumno@sur.cursus.test`         |

El Director no tiene facultad asociada. En Norte, cada administrativo pertenece a su facultad, para probar el aislamiento entre facultades; profesor, ayudante y alumno pertenecen a Ingeniería. En Sur, todos pertenecen a Ciencias de la Salud.

Otros comandos (se ejecutan en todos los workspaces que definan el script):

```bash
npm run lint
npm run test
npm run build
```

Formato con Prettier (configuración única en `.prettierrc.json` para todo el repo):

```bash
npm run format         # formatea
npm run format:check   # solo verifica
```

`shared` se compila automáticamente después de `npm install`. Si cambias algo en `shared/src`, recompílalo con `npm run build --workspace=shared` para que frontend y backend vean los cambios.

## Entornos en AWS

Hay dos entornos en AWS (región Ohio, `us-east-2`), cada uno con su propio stack, base de datos y secretos:

| Entorno      | Rama      | Se despliega con       | Frontend (Vercel)                 | API                                                    |
| ------------ | --------- | ---------------------- | --------------------------------- | ------------------------------------------------------ |
| `staging`    | `develop` | Cada merge a `develop` | https://cursus-staging.vercel.app | https://pvkd45c0ya.execute-api.us-east-2.amazonaws.com |
| `production` | `main`    | Cada release a `main`  | https://cursus-g2.vercel.app      | https://p24c3u9eek.execute-api.us-east-2.amazonaws.com |

Los dos están **apagados por defecto** para cuidar los créditos: quien necesite uno lo enciende y lo apaga al terminar.

- **Frontend:** Vercel reenvía las llamadas a `/api/*` hacia la API de su entorno (`develop` en Preview y `main` en Production) y les agrega un header secreto. La API rechaza con 403 las peticiones que no lo traen, así que se usa a través de Vercel; solo `/api/health` responde sin el header.
- **Backend:** contenedor Docker ([infra/docker/backend.Dockerfile](infra/docker/backend.Dockerfile)) en ECS Fargate, expuesto con API Gateway (HTTP API) sin balanceador.
- **Base de datos:** RDS PostgreSQL 17 (`cursus_staging` o `cursus_production`), privada y cifrada. Las dos dejan un snapshot si se borran o se reemplazan y guardan respaldos de 1 día (el máximo del plan gratuito de AWS; con el plan de pago, producción debería guardar 7). La de producción además está protegida contra borrado y conserva sus respaldos si se borra la instancia.
- **Infraestructura:** la misma plantilla de CloudFormation ([infra/aws/cursus.yml](infra/aws/cursus.yml)) con el parámetro `Entorno`. Los stacks (`cursus-staging` y `cursus-production`) nunca se borran.

### Cómo funciona el deploy

El workflow [deploy.yml](.github/workflows/deploy.yml) corre con cada push a `develop` (staging) o a `main` (production):

1. Espera a que el CI de ese commit (lint, test y build) termine en verde.
2. Construye la imagen del backend y la publica en ECR, con el SHA del commit como etiqueta.
3. Si el entorno está apagado, termina en verde con un aviso. La imagen se despliega al encender.
4. Si está encendido: corre las migraciones como una tarea aparte, actualiza el backend y verifica `/api/health/db` en la URL de la API. Si algo falla, el workflow queda en rojo y el entorno sigue con la versión anterior (ECS vuelve sola a ella si la nueva no arranca).
5. Si el environment de GitHub tiene la variable `FRONTEND_URL`, verifica también `/api/health/db` a través de Vercel. Si no responde 200, deja una **advertencia** pero no falla, porque Vercel despliega en paralelo y puede tardar más.

**Las migraciones deben ser compatibles hacia atrás.** Si la versión nueva del backend falla y ECS vuelve a la anterior, la migración ya quedó aplicada: ECS no la revierte. Por eso la versión anterior tiene que seguir funcionando con el schema nuevo. Por ejemplo, para renombrar una columna: primero se agrega la nueva y se copian los datos, y en un deploy posterior se borra la antigua.

### Volver a una versión anterior (rollback manual)

Si una versión ya desplegada tiene un problema, se vuelve a la anterior desde CloudShell, con el entorno encendido:

```bash
bash infra/aws/deploy.sh production <sha-del-commit-anterior>
```

- El SHA es la etiqueta de la imagen en ECR: el commit de un deploy anterior que funcionaba (se ve en GitHub Actions o con `git log`). ECR guarda las últimas 10 imágenes de cada entorno.
- **La migración no se revierte:** la versión anterior corre sobre el schema nuevo, por eso las migraciones deben ser compatibles hacia atrás.
- El arreglo definitivo se hace con un PR nuevo; el siguiente merge vuelve a desplegar la versión corregida.

### Encender y apagar

Desde [AWS CloudShell](https://console.aws.amazon.com/cloudshell) en la región Ohio, con el repo clonado (`git clone` y `git switch develop`). Cada script recibe el entorno: `staging` o `production`.

```bash
bash infra/aws/start.sh staging    # inicia la base y despliega la última imagen (5 a 20 min)
bash infra/aws/stop.sh staging     # backend a 0 tareas y base detenida
bash infra/aws/status.sh staging   # imprime "encendido" o "apagado"
```

- **Quien enciende, apaga.** Antes de una revisión o entrega, enciende con al menos 20 minutos de anticipación.
- Todas las noches a las 3:00 (hora de Chile) cada entorno se apaga solo, por si alguien lo olvida. AWS enciende la base sola cada 7 días, y ese apagado nocturno la vuelve a detener.
- Costo aproximado por entorno: ~4 USD/mes apagado, ~10 USD/mes encendido 2 días por semana y ~27 USD/mes encendido todo el mes.

### Secretos y variables

Ningún secreto está en el repositorio. Cada entorno tiene los suyos (`<entorno>` es `staging` o `production`).

| Dónde                                      | Qué                                                                                                                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS Secrets Manager                        | `cursus-<entorno>/base-de-datos` (usuario y contraseña de RDS) y `cursus-<entorno>/origin-secret` (header secreto). Los genera AWS.                                                            |
| GitHub, environment `<entorno>` (secretos) | `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`: llaves del usuario `cursus-<entorno>-github`, que solo puede desplegar (ver abajo).                                                             |
| GitHub, environment `<entorno>` (variable) | `AWS_REGION` (opcional; por defecto `us-east-2`).                                                                                                                                              |
| Vercel                                     | `API_URL` (salida `ApiUrl` del stack, sin `/` al final) y `ORIGIN_SECRET` (secreto `cursus-<entorno>/origin-secret`): en Preview, rama `develop`, para staging; en Production para production. |

El environment `staging` de GitHub solo acepta la rama `develop`, y `Production` solo `main`. `Production` es el mismo environment que crea la integración de Vercel: GitHub no distingue mayúsculas, y el workflow lo usa con el nombre `production`. Cada environment puede tener la variable `FRONTEND_URL` (la URL de Vercel de su entorno) para la verificación del frontend.

**Llaves de GitHub.** El plan gratuito de AWS bloquea OIDC, así que el workflow entra con las llaves de un usuario de IAM con permisos mínimos (subir imágenes, correr migraciones y actualizar el servicio). La plantilla crea el usuario, pero no la llave, para que no quede guardada en AWS. Para crearla, en CloudShell:

```bash
aws iam create-access-key --user-name cursus-<entorno>-github --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text
```

Pega los dos valores en los secretos del environment de GitHub de ese entorno y no los guardes en ningún otro lado. Para rotarla: crea una nueva, actualiza GitHub y borra la anterior con `aws iam delete-access-key --user-name cursus-<entorno>-github --access-key-id <id-anterior>`. Si la cuenta pasa al plan de pago, se puede volver a OIDC (sin llaves) con el parámetro `AccesoGitHub=oidc` de la plantilla y el secreto `AWS_ROLE_ARN`.

### Crear o actualizar la infraestructura

Lo hace el dueño de la cuenta de AWS desde CloudShell:

```bash
bash infra/aws/stack.sh staging --dry-run   # muestra qué cambiaría, sin aplicar nada
bash infra/aws/stack.sh staging             # crea o actualiza el stack
```

- La primera vez crea todo menos el servicio del backend, porque todavía no hay imágenes (unos 15 minutos). Después del primer deploy del workflow, correrlo de nuevo crea el servicio.
- Antes de aplicar un cambio en [cursus.yml](infra/aws/cursus.yml), revisa el `--dry-run`: si alguna fila dice `Replacement = True` en la base de datos, un secreto o el usuario de GitHub, AWS los borraría y crearía de nuevo. Una revisión nueva de la definición de tarea (`DefinicionTarea`) sí es normal.
- Los nombres de los recursos de staging no se cambian: AWS los recrearía con pérdida de datos, secretos o llaves.

### Límites conocidos

- API Gateway corta cada petición a los **30 segundos** y acepta hasta **10 MB**. Las subidas grandes y las descargas de archivos deben ir directo a S3 con enlaces firmados.

## Flujo de trabajo Git

### Ramas

- `main`: versión estable/entregable. Solo recibe merges desde `develop` vía PR.
- `develop`: rama de integración. Todo el trabajo se integra aquí vía PR.
- `feature/<épica>-<descripción>`: trabajo de una tarjeta, creada desde `develop` y con PR hacia `develop`. Ejemplos: `feature/infra-frontend-scaffold`, `feature/ui-app-shell`.
- `hotfix/<descripción>`: corrección urgente sobre `main`, creada desde `main`; luego se integra también en `develop`.

El tipo de cambio (`feat`, `fix`, `docs`, etc.) va en los commits, no en el nombre de la rama.

Ninguna de las dos ramas principales acepta push directo; todo entra por Pull Request.

### Pull Requests

1. Crea tu rama desde `develop` actualizado.
2. Haz commits siguiendo Conventional Commits.
3. Abre un PR hacia `develop` y completa el template (tarjeta Trello, historia de usuario, DoD).
4. El CI (lint, test, build, commitlint, pr-title) debe estar en verde.
5. Pide revisión a un compañero; se hace merge cuando esté aprobado.

### Conventional Commits

Formato: `<tipo>(<ámbito>): <descripción>`

- El **ámbito** es opcional (se omite en cambios transversales: `<tipo>: <descripción>`). Si se usa, debe ser **una sola** épica del tablero: `feat(notas/ui)` o `feat(notas,ui)` no son válidos.
- La **descripción** va en minúsculas y sin punto final.

| Tipo       | Uso                                                 |
| ---------- | --------------------------------------------------- |
| `feat`     | Nueva funcionalidad                                 |
| `fix`      | Corrección de bug                                   |
| `docs`     | Solo documentación                                  |
| `refactor` | Cambio de código sin cambiar comportamiento         |
| `test`     | Agrega o corrige tests                              |
| `style`    | Formato, espacios, punto y coma (sin cambio lógico) |
| `chore`    | Mantenimiento, dependencias, configuración          |
| `ci`       | Pipeline de CI/CD                                   |

Ámbitos válidos (épicas): `infra`, `auth`, `multitenant`, `ui`, `gestion`, `perfil`, `espacio`, `notas`, `materiales`, `anuncios`, `asistencia`, `metricas`, `historial`, `seguridad`, `exportacion`, `observabilidad`.

Ejemplos válidos:

```
feat(notas): agrega ingreso de notas por evaluación
fix(auth): corrige expiración del token de sesión
docs: actualiza guía de contribución
```

Ejemplos inválidos:

```
agrega cosas                    # sin tipo
feat(backend): agrega endpoint  # "backend" no es una épica
feat(notas/ui): agrega ingreso  # más de un ámbito; si es transversal, omítelo
Feat(notas): Agrega ingreso.    # tipo y descripción con mayúscula, y punto final
```

La convención se valida en tres puntos, todos con la misma configuración (`commitlint.config.js`):

1. **Local**: el hook `commit-msg` (husky + commitlint) rechaza el commit antes de crearlo.
2. **CI, job `commitlint`**: valida todos los commits del PR.
3. **CI, job `pr-title`**: valida el título del PR con commitlint. Los PR se mergean con **merge commit** (no squash), y el título del PR queda en la descripción de ese commit.

## Tablero

Trello: https://trello.com/b/hzsgcqqi/intro-a-software-grupo-2-cursus

## Equipo

- Joaquín Cuevas
- Juan I. de la Cuadra
- Cristobal Diaz
- Matias Garcia-Huidobro
- Leopoldo Lorenzini
- Ricardo Madariaga
- Alvaro Tapia
