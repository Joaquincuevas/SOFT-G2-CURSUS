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
│   ├── workflows/
│   │   ├── ci.yml       # Pipeline: lint + test + build + commitlint
│   │   └── pr-title.yml # Valida el título del PR (Conventional Commits)
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
4. El CI (lint, test, build, commitlint, pr-title) debe estar en verde.
5. Pide revisión a un compañero; se hace merge cuando esté aprobado.

### Conventional Commits

Formato: `<tipo>(<ámbito>): <descripción>`

- El **ámbito** es opcional (se omite en cambios transversales: `<tipo>: <descripción>`). Si se usa, debe ser una épica del tablero.
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
Feat(notas): Agrega ingreso.    # tipo y descripción con mayúscula, y punto final
```

La convención se valida en tres puntos, todos con la misma configuración (`commitlint.config.js`):

1. **Local**: el hook `commit-msg` (husky + commitlint) rechaza el commit antes de crearlo.
2. **CI, job `commitlint`**: valida todos los commits del PR.
3. **CI, job `pr-title`**: valida el título del PR, porque con squash merge el título es el commit que queda en `develop`.

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
