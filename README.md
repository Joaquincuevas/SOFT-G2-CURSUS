# CURSUS

Sistema de gestión académica **multiuniversidad**. Proyecto del curso **ICC 4204 Introducción a la Ingeniería de Software** (Universidad de los Andes), Grupo 2.

Cada universidad opera sobre la misma plataforma con sus datos aislados mediante Row-Level Security en PostgreSQL.

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | NestJS + TypeScript + Node.js |
| Base de datos | PostgreSQL (Row-Level Security por universidad) |
| Archivos | Amazon S3 |
| Monorepo | npm workspaces |
| Calidad | GitHub Actions (lint, test, build), commitlint + husky |

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
├── package.json         # Configuración de workspaces
└── README.md
```

## Setup local

Requisitos: **Node.js 20+** y **npm 10+**.

```bash
git clone https://github.com/Joaquincuevas/SOFT-G2-CURSUS.git
cd SOFT-G2-CURSUS
git switch develop
npm install          # instala dependencias de todos los workspaces y activa los hooks de husky
npm run dev:front    # levanta el frontend
npm run dev:back     # levanta el backend
```

Otros comandos (se ejecutan en todos los workspaces que definan el script):

```bash
npm run lint
npm run test
npm run build
```

## Flujo de trabajo Git

### Ramas

- `main`: versión estable/entregable. Solo recibe merges desde `develop` vía PR.
- `develop`: rama de integración. Todo el trabajo se integra aquí vía PR.
- Ramas de trabajo, creadas desde `develop`:
  - `feat/<tarjeta>-descripcion-corta`
  - `fix/<tarjeta>-descripcion-corta`
  - `docs/...`, `refactor/...`, `test/...`, `chore/...`, `ci/...`

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
