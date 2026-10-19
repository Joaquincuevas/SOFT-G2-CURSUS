# backend

API de CURSUS: **NestJS + TypeScript + Node.js** (ESM), sobre PostgreSQL (con Row-Level Security por universidad) y Amazon S3 para archivos.

## Scripts

Desde la raíz del repo (`npm run <script> --workspace=backend`) o dentro de `backend/`:

| Script                       | Qué hace                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| `npm run dev`                | Servidor con recarga en http://localhost:3000/api           |
| `npm run build`              | Compila a `dist/`                                           |
| `npm run start:prod`         | Ejecuta el build (`node dist/main`)                         |
| `npm run lint`               | ESLint con reglas que usan los tipos                        |
| `npm run test`               | Tests unitarios con Vitest (`src/**/*.spec.ts`)             |
| `npm run test:e2e`           | Tests end-to-end (`test/**/*.e2e-spec.ts`)                  |
| `npm run test:db`            | Tests del schema contra PostgreSQL (`test/**/*.db-spec.ts`) |
| `npm run migration:run`      | Aplica las migraciones pendientes                           |
| `npm run migration:revert`   | Revierte la última migración aplicada                       |
| `npm run migration:show`     | Lista las migraciones y cuáles están aplicadas              |
| `npm run migration:run:prod` | Aplica las migraciones desde `dist/` (imagen Docker)        |
| `npm run seed`               | Carga los datos simulados (ver README de la raíz)           |

El puerto se puede cambiar con la variable de entorno `PORT`.

## API

- Todas las rutas van bajo el prefijo `/api` (por ejemplo, `http://localhost:3000/api`), igual en local, staging y producción. Se configura en `src/config/configurar-app.ts`.
- `GET /api/health`: `200 {"status":"ok"}` si el proceso está vivo. No consulta la base; lo usa el health check del contenedor.
- `GET /api/health/db`: `200` si la base responde y `503` si no. Lo usa la verificación del deploy.
- Si `ORIGIN_SECRET` está definido, toda petición sin el header `x-origin-secret` correcto recibe `403` (salvo `/api/health`). En local va vacío y la validación se desactiva.
- Todas las respuestas llevan `Cache-Control: no-store`.

## Permisos por endpoint

Cada ruta debe declarar quién puede usarla. Los guards globales corren en este orden: `JwtAuthGuard` (sin sesión → `401`) y después `PermisosGuard` (sin permiso → `403`).

| Decorador                     | Quién puede usar la ruta                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `@Public()`                   | Cualquiera, sin sesión                                                                |
| `@SoloSesion()`               | Cualquier usuario con sesión, sin importar su rol                                     |
| `@Puede('create', 'Carrera')` | Los roles cuya ability permite esa acción sobre ese sujeto (ver `@cursus/shared`)     |
| _(ninguno)_                   | Nadie: responde `403`, para que olvidar el decorador cierre la ruta en vez de abrirla |

```ts
@Puede('read', 'Universidad')
@Get()
listar() { ... }
```

Las reglas por rol viven en `shared/src/permisos.ts` (`definirAbilityPara`) y las usa también el frontend.

Nada se elimina: los registros se archivan (archived_at). Por eso ningún rol tiene `delete` ni `manage`, y una ruta `@Puede('delete', ...)` responde `403` a todos.

## Validación de entradas

Un `ValidationPipe` global (en `src/config/configurar-app.ts`) valida cada body con su DTO. Un campo no declarado o un valor inválido responde `400`.

- Cada `@Body()` nuevo debe tiparse con una **clase** DTO con decoradores de `class-validator`, en un archivo `<nombre>.dto.ts` (por ejemplo, `src/auth/login.dto.ts`).
- Un body tipado como `unknown`, como interfaz o como tipo **no se valida**: el pipe solo valida clases.

```ts
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  correo!: string
}

@Post('login')
login(@Body() { correo }: LoginDto) { ... }
```

## Aislamiento por universidad

Toda consulta a una tabla con datos institucionales se filtra por la universidad del usuario de la sesión. Un usuario nunca ve datos de otra universidad, y pedir un recurso de otra universidad responde `404`, igual que si no existiera.

- `@UniversidadActual()` entrega la universidad del JWT. Es el único punto del backend donde se lee.
- `BaseDeDatos.consultarEnUniversidad(universidadId, sql, parametros)` ejecuta la consulta con la universidad como `$1`; los demás parámetros siguen desde `$2`. Falla si la consulta no usa `$1`.
- `BaseDeDatos.obtenerEnUniversidad(...)` hace lo mismo para un solo recurso y responde `404` si no lo encuentra.

```ts
@Puede('read', 'Facultad')
@Get(':id')
obtener(@UniversidadActual() universidadId: string, @Param('id', ParseUUIDPipe) id: string) {
  return this.bd.obtenerEnUniversidad<Facultad>(
    universidadId,
    'SELECT id, nombre FROM facultad WHERE universidad_id = $1 AND id = $2',
    [id],
  )
}
```

Excepciones, que usan `BaseDeDatos.query`:

- `POST /api/auth/login` busca al usuario por el dominio de su correo, porque antes del login no hay universidad de sesión.
- `refresh`, `logout` y la validación de la sesión en `JwtAuthGuard` usan `refresh_token` y `sesion_auth`, que no son tablas institucionales.

Los tests de aislamiento (`test/multitenant/aislamiento.db-spec.ts`) usan los usuarios del seed de las dos universidades. El acceso del Director a todas las universidades es de MT-03.

## Sesión

- `POST /api/auth/login` devuelve el JWT de acceso (`JWT_EXPIRES_IN`, 15 min por defecto) y setea la cookie `refresh`: `HttpOnly`, `SameSite=Strict`, `Path=/api/auth` y `Secure` con `NODE_ENV=production`.
- `POST /api/auth/refresh` cambia la cookie por un JWT nuevo y rota el refresh token. Responde `401` y borra la cookie si el token no existe, expiró o fue revocado. Reusar un token ya rotado revoca todas las sesiones del usuario.
- `POST /api/auth/logout` revoca el refresh token de la cookie y la borra. Siempre responde `204`.
- El refresh token es opaco (32 bytes aleatorios) y en la tabla `refresh_token` solo se guarda su sha256. Dura `JWT_REFRESH_EXPIRES_IN` (7 días por defecto) desde su último uso.

## Variables de entorno

Con `NODE_ENV=production` (la imagen Docker), la API no arranca si falta `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` u `ORIGIN_SECRET`, y las migraciones no corren si falta alguna de las `POSTGRES_*`. En local se usan los valores por defecto. `POSTGRES_SSL=true` activa SSL hacia la base (RDS). Ver `.env.example`.

## Base de datos

- La conexión está en `src/database/data-source.ts`. Lee las variables `POSTGRES_*` del `.env` de la raíz del repo, o del entorno si no hay `.env` (por ejemplo, en el CI).
- Las migraciones viven en `src/database/migrations/` y se registran a mano en la lista `migrations` de `data-source.ts`.
- Convención de nombres: tablas en singular y en snake_case (`universidad`, `periodo`), columnas en snake_case (`universidad_id`, `created_at`) y restricciones con prefijo `pk_`, `fk_`, `uq_`, `ck_`, `ux_` (índice único) o `ix_` (índice).

El proyecto es ESM (`"type": "module"`): los imports relativos llevan extensión `.js` (por ejemplo, `import { AppService } from './app.service.js'`).
