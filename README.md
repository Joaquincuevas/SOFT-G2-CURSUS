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
├── infra/               # Docker, migraciones, scripts AWS
├── docs/                # Informes, diagramas C4, ADRs
├── .github/
│   ├── workflows/ci.yml # Pipeline: lint + test + build + commitlint
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
npm run dev:back     # backend en http://localhost:3000
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
4. El CI (lint, test, build, commitlint) debe estar en verde.
5. Pide revisión a un compañero; se hace merge cuando esté aprobado.

### Conventional Commits

Formato: `tipo(alcance opcional): descripción`

```
feat(backend): agregar endpoint de inscripción de ramos
fix(frontend): corregir validación del formulario de login
docs: agregar ADR sobre Row-Level Security
chore(infra): configurar docker-compose con PostgreSQL
```

Tipos permitidos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
El hook `commit-msg` (husky + commitlint) rechaza en local los mensajes que no cumplan el formato, y el CI los vuelve a validar en cada PR.

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
