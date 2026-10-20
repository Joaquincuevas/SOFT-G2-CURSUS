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

### Espacio de una sección (ESP-06)

Las rutas con datos de una sección para sus integrantes van en `src/espacio/`, bajo `/api/espacio/secciones/:id`, con dos decoradores:

```ts
@Puede('read', 'Seccion')
@IntegranteDeSeccion()
@Get()
obtener(@SeccionActual() seccion: SeccionEspacio) { ... }
```

`@IntegranteDeSeccion()` deja pasar al profesor de la sección, a sus ayudantes y alumnos activos, al Administrativo de la facultad del curso y al Director (en solo lectura). Un usuario de la misma universidad que no es integrante recibe `403`. Una sección inexistente, archivada o de otra universidad responde `404`. Ver [docs/esp-06-acceso-seccion.md](../docs/esp-06-acceso-seccion.md).

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

- `@UniversidadActual()` entrega la universidad y el rol del JWT (`ContextoUniversidad`). Es el único punto del backend donde se leen.
- `BaseDeDatos.consultarEnUniversidad(contexto, sql, parametros)` ejecuta la consulta con la universidad como `$1`; los demás parámetros siguen desde `$2`. Falla si la consulta no usa `$1`.
- `BaseDeDatos.obtenerEnUniversidad(...)` hace lo mismo para un solo recurso y responde `404` si no lo encuentra.

```ts
@Puede('read', 'Facultad')
@Get(':id')
obtener(@UniversidadActual() contexto: ContextoUniversidad, @Param('id', ParseUUIDPipe) id: string) {
  return this.bd.obtenerEnUniversidad<Facultad>(
    contexto,
    'SELECT id, nombre FROM facultad WHERE universidad_id = $1 AND id = $2',
    [id],
  )
}
```

Excepciones, que usan `BaseDeDatos.query`:

- `POST /api/auth/login` busca al usuario por el dominio de su correo, porque antes del login no hay universidad de sesión.
- El límite de login usa `limite_login` por cuenta o IP antes de tener una universidad de sesión. Sus bloqueos, autenticación y emisión de tokens se ejecutan con `BaseDeDatos.enTransaccion` en una misma conexión; ver [AUTH-07](../docs/auth-07-rate-limiting-login.md).
- `refresh`, `logout` y la validación de la sesión en `JwtAuthGuard` usan `refresh_token` y `sesion_auth`, que no son tablas institucionales.

Los tests de aislamiento (`test/multitenant/aislamiento.db-spec.ts`) usan los usuarios del seed de las dos universidades.

### Director

El Director lee los datos de todas las universidades, pero no modifica ninguno, ni los de su universidad de origen ([ADR 0001](../docs/adr/0001-acceso-del-director-entre-universidades.md)).

- Para la vista consolidada se usa `BaseDeDatos.consultarEnTodasLasUniversidades(contexto, sql, parametros)`. Responde `403` a cualquier otro rol, no exige `$1` y corre en una transacción `READ ONLY`, así que la base rechaza cualquier escritura.
- Para lo que es solo de su universidad (por ejemplo, `/api/auth/yo`), usa `consultarEnUniversidad` como los demás roles.
- En la API, sus permisos son de solo lectura (`definirAbilityPara`). En la base, RLS tampoco le deja crear ni modificar (ver abajo).

Los tests están en `test/multitenant/director.db-spec.ts`.

### Row-Level Security

Además del filtro en la consulta, PostgreSQL aísla las universidades con Row-Level Security (migración `ActivarRls`), así que un filtro olvidado no expone datos de otra universidad.

- `consultarEnUniversidad` ejecuta cada consulta en una transacción con el rol `cursus_app` (`SET LOCAL ROLE`), y con la universidad y el rol de la sesión fijados en `app.universidad_id` y `app.rol` (`set_config(..., true)`). Duran solo esa transacción, así que no pasan a otra consulta que reciba la misma conexión del pool.
- `universidad`, `facultad`, `carrera`, `periodo` y `usuario` tienen tres políticas para `cursus_app` (migración `PermitirLecturaDirector`):
  - `pol_<tabla>_lectura` (`SELECT`): filas de la universidad fijada, o de todas si el rol es `DIRECTOR`.
  - `pol_<tabla>_insercion` y `pol_<tabla>_modificacion` (`INSERT` y `UPDATE`): solo filas de la universidad fijada, con un rol fijado que no sea `DIRECTOR`.
- Sin universidad fijada, una consulta no devuelve filas (salvo para el Director).
- `cursus_app` tiene `SELECT`, `INSERT` y `UPDATE`, pero no `DELETE`: nada institucional se borra, se archiva con `archived_at`. Un usuario archivado no puede iniciar sesión, renovar su sesión ni seguir usando su JWT.
- El dueño de las tablas (el usuario de `POSTGRES_USER`) no pasa por RLS: lo usan las migraciones, el seed y las excepciones de arriba.
- Una tabla nueva con `universidad_id` necesita sus permisos para `cursus_app`, `ENABLE ROW LEVEL SECURITY` y sus tres políticas. Si falta algo, el test de contrato de `test/multitenant/rls.db-spec.ts` falla.

## Carreras (GES-01)

`GET /api/carreras`, `POST /api/carreras` y `PATCH /api/carreras/:id` permiten al administrativo listar, crear y editar las carreras de su facultad. POST/PATCH reciben únicamente `{ nombre }`; el ámbito se obtiene del usuario de sesión en la BD y las consultas mantienen RLS por universidad más filtro de facultad. Duplicados responden 409 y una carrera ajena, archivada o inexistente responde 404 al editar. La migración nueva garantiza nombres únicos por facultad también al ignorar mayúsculas y espacios. Ver [contrato y pruebas de GES-01](../docs/ges-01-carreras-facultad.md).

## Períodos (GES-02)

`PeriodosController` concentra `GET /api/periodos` (incluye fechas y conserva los campos usados por Cursos), `POST /api/periodos` y `PATCH /api/periodos/:id/activar`. El administrativo crea períodos y cambia el activo de su universidad con RLS y una transacción serializada por universidad. Crear un duplicado responde 409 y revierte la desactivación anterior. Se reutilizan las restricciones existentes, sin nueva migración. Ver [contrato y pruebas de GES-02](../docs/ges-02-periodos-academicos.md).

## Edición de cursos (GES-07)

`GET /api/cursos/:id/edicion`, `PATCH /api/cursos/:id` y `GET /api/cursos/:id/historial` permiten al administrativo editar cursos de su facultad con las validaciones de creación. Curso e historial se guardan en una transacción con bloqueo del curso y RLS; una falla revierte ambos. La migración `CrearHistorialCurso1792480000000` agrega el historial de solo adición, con fecha de BD, responsable y snapshots anterior/nuevo. La interfaz exige revisar y confirmar antes de enviar el PATCH. Ver [contrato y pasos de revisión](../docs/ges-07-editar-curso.md).

## Horarios de secciones (GES-10)

GES-11 comprueba salas ocupadas al guardar el horario: misma universidad, período, día e intervalos superpuestos. Responde 409 con `code: SALA_OCUPADA` y los cursos/secciones ocupantes, sin modificar ningún bloque ni la versión. Los guardados se serializan por universidad para evitar reservas simultáneas en cursos diferentes. Ver [contrato y revisión de GES-11](../docs/ges-11-sala-ocupada.md).

`GET` y `PUT /api/secciones/:id/horario` permiten al Administrativo editar todos los bloques semanales de una sección de su facultad. El guardado es atómico, archiva las filas anteriores y controla la versión para evitar sobrescribir cambios de otra sesión. El resumen aparece en el detalle del curso y es consultable por el Director. Ver [contrato y verificación de GES-10](../docs/ges-10-horarios-seccion.md).

## Carga CSV de alumnos (GES-16)

`POST /api/secciones/:id/alumnos/csv` recibe `{ csv }` y devuelve total, cargados, errores y detalle por fila. Solo el administrativo de la facultad/universidad de la sección puede cargar. Cada fila reutiliza el DTO y la transacción de GES-15; un fallo individual no revierte otras filas. Formato UTF-8 `correo,nombre`, hasta 100 alumnos y 48 KiB. La plantilla se descarga desde el diálogo de la sección. No requiere migraciones ni dependencias nuevas. Ver [formato, permisos, límites y pruebas](../docs/ges-16-carga-alumnos-csv.md).

## Facultad completa de demo (GES-20)

`npm run seed` y `npm run seed:prod` completan Ingeniería de Norte con tres carreras, quince cursos y treinta secciones con horario, sala y participantes. La carga es transaccional y se puede repetir sin duplicar ni restaurar asignaciones retiradas. Ver [datos y verificación de GES-20](../docs/ges-20-seed-facultad.md).

## Sesión

- `POST /api/auth/login` devuelve el JWT de acceso (`JWT_EXPIRES_IN`, 15 min por defecto) y setea la cookie `refresh`: `HttpOnly`, `SameSite=Strict`, `Path=/api/auth` y `Secure` con `NODE_ENV=production`.
- Login responde `429` desde el quinto fallo por cuenta o el vigésimo por IP dentro de una ventana móvil de 15 minutos, con `Retry-After` en segundos. Un éxito anterior al bloqueo reinicia ambos contadores. Con `ORIGIN_SECRET`, se usa la IP única de `x-vercel-forwarded-for`; si falta, se aplica solo el límite de cuenta y se registra un aviso sin datos del cliente. Una cabecera inválida responde 400. En local se usa el socket. Se conservan `LoginDto`, `ValidationPipe` y helmet.
- `POST /api/auth/refresh` cambia la cookie por un JWT nuevo y rota el refresh token. Responde `401` y borra la cookie si el token no existe, expiró o fue revocado. Reusar un token ya rotado revoca todas las sesiones del usuario.
- `POST /api/auth/logout` revoca el refresh token de la cookie y la borra. Siempre responde `204`.
- El refresh token es opaco (32 bytes aleatorios) y en la tabla `refresh_token` solo se guarda su sha256. Dura `JWT_REFRESH_EXPIRES_IN` (7 días por defecto) desde su último uso.

## Perfil

- `GET /api/auth/yo` entrega los datos del perfil: nombre, correo, rol, universidad y facultad.
- `PATCH /api/perfil` (`{ nombre }`, PER-01) cambia el nombre del usuario de la sesión: el id sale del JWT, nunca de la petición. Cualquier otro campo responde `400`. El Director recibe `403`: ve su perfil en solo lectura ([ADR 0001](../docs/adr/0001-acceso-del-director-entre-universidades.md)).
- `PUT /api/auth/password` (`{ passwordActual, passwordNueva }`, PER-02) cambia la contraseña del usuario de la sesión, también la del Director. La nueva debe tener al menos 8 caracteres y ser distinta de la actual; si no, o si la actual no es correcta, responde `400`. Responde `204` y cierra las demás sesiones del usuario; la actual sigue abierta. Una contraseña actual incorrecta cuenta para el mismo límite por cuenta del login (`429` con `Retry-After`).
- Contraseña provisoria (PER-03): las cuentas que crea un administrativo (alumnos de GES-15 y GES-16, profesores y ayudantes de GES-21) quedan con `usuario.credencial_provisoria = true`. Mientras la tengan, `GET /api/auth/yo` devuelve `debeCambiarPassword: true` y el resto de las rutas con sesión responde `403`, salvo `PUT /api/auth/password`. Las rutas que se permiten llevan `@PermitidaConProvisoria()`. La marca se lee de la base en cada petición, así que al cambiar la contraseña se quita sin pedir otro JWT. El frontend lleva a esos usuarios a `/cambiar-password`.

## Variables de entorno

Con `NODE_ENV=production` (la imagen Docker), la API no arranca si falta `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` u `ORIGIN_SECRET`, y las migraciones no corren si falta alguna de las `POSTGRES_*`. En local se usan los valores por defecto. `POSTGRES_SSL=true` activa SSL hacia la base (RDS). Ver `.env.example`.

## Base de datos

- La conexión está en `src/database/data-source.ts`. Lee las variables `POSTGRES_*` del `.env` de la raíz del repo, o del entorno si no hay `.env` (por ejemplo, en el CI).
- Las migraciones viven en `src/database/migrations/` y se registran a mano en la lista `migrations` de `data-source.ts`.
- Convención de nombres: tablas en singular y en snake_case (`universidad`, `periodo`), columnas en snake_case (`universidad_id`, `created_at`) y restricciones con prefijo `pk_`, `fk_`, `uq_`, `ck_`, `ux_` (índice único) o `ix_` (índice).

El proyecto es ESM (`"type": "module"`): los imports relativos llevan extensión `.js` (por ejemplo, `import { AppService } from './app.service.js'`).
