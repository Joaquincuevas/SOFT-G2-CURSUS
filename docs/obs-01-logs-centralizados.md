# OBS-01: logs centralizados del backend en AWS

Tarjeta: [F6 OBS-01 Logs centralizados del backend en AWS](https://trello.com/c/K6S56p9u/170-f6-obs-01-logs-centralizados-del-backend-en-aws).

**Como** equipo de la plataforma, **quiero** que la API escriba logs estructurados y seguros en CloudWatch, **para** investigar un problema por entorno y por solicitud sin exponer datos de nadie.

## Criterios de aceptación

| Criterio                                                                     | Implementación                                                                                                                                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Los logs de staging y producción llegan a CloudWatch, separados por entorno. | Sin cambios de infraestructura: el contenedor ya usa `awslogs` hacia el log group `/ecs/cursus-<Entorno>` (`infra/aws/cursus.yml`, retención de 7 días). Ahora la API escribe JSON en stdout. |
| Cada log incluye fecha, nivel, endpoint e identificador de solicitud.        | `timestamp` (ISO 8601 UTC), `level`, `route` (con `method`) y `requestId` en cada línea de acceso y de error.                                                                                 |
| Los logs no contienen contraseñas, tokens ni RUT.                            | Todo pasa por `redactar()` antes de escribirse (ver Redacción). No se registran cuerpos, cabeceras ni query strings.                                                                          |

## Formato de línea

Una línea JSON por evento, en stdout:

```json
{
  "timestamp": "2026-11-13T22:20:55.018Z",
  "level": "error",
  "environment": "staging",
  "context": "Acceso",
  "requestId": "demo-req-0001",
  "message": "solicitud atendida",
  "method": "POST",
  "route": "/api/auth/login",
  "status": 500,
  "durationMs": 41.35
}
```

| Campo                                     | Contenido                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `timestamp`                               | Instante ISO 8601 en UTC.                                                                                                                     |
| `level`                                   | `fatal`, `error`, `warn`, `info`, `debug` o `verbose`.                                                                                        |
| `environment`                             | `ENTORNO` si existe; si no, `NODE_ENV`. Hoy el contenedor no define `ENTORNO`, así que sale `production` en ambos entornos: ver «Qué falta».  |
| `context`                                 | Quién escribe: `Acceso` (línea de cada solicitud), `Excepciones` (5xx) o la clase de un servicio.                                             |
| `requestId`                               | Identificador de la solicitud en curso (ver abajo). No aparece en los logs de arranque, que no pertenecen a una solicitud.                    |
| `message`                                 | Texto, ya redactado.                                                                                                                          |
| `method`, `route`, `status`, `durationMs` | Solo en las líneas de acceso y de error 5xx.                                                                                                  |
| `usuarioId`                               | Solo en la línea de acceso, y solo si la solicitud ya está autenticada: el uuid interno. Nunca nombre ni correo.                              |
| `error`                                   | En los 5xx: `name`, `message` y `stack`, redactados. No se copian otras propiedades del error (TypeORM adjunta la consulta y sus parámetros). |

Los nombres de campo van en inglés (`method`, `route`) por ser los habituales de CloudWatch; el mensaje va en español.

### Nivel de cada línea de acceso

- 2xx y 3xx: `info`. 4xx: `warn`, sin stack. 5xx: `error`.
- `/api/health` y `/api/health/db` (los llama el health check del contenedor cada pocos segundos): `debug` mientras respondan bien, así que no aparecen con `LOG_LEVEL=info`. Si fallan (≥ 400) se registran normal.
- Las líneas de arranque de Nest `Mapped {…} route` (cientos) bajan a `debug`.
- `LOG_LEVEL` (`error`, `warn`, `info`, `debug`; por defecto `info`) deja pasar ese nivel y los más importantes.

### `route`

Es el patrón de la ruta (`/api/espacio/secciones/:id`), nunca la URL real: no lleva query string ni el valor de los parámetros, que pueden identificar a alguien. Un camino que no existe se registra como `(sin ruta)`: no se escribe lo que mandó el cliente.

## requestId

- Se lee `X-Request-Id` de la solicitud **solo** si cumple `^[A-Za-z0-9._-]{8,64}$`. Cualquier otra cosa (espacios, comillas, saltos de línea, muy corto o muy largo, varios valores) se descarta y se genera un UUID. Así un cliente no puede inyectar líneas ni texto arbitrario en los logs.
- Se devuelve siempre en la cabecera `X-Request-Id` de la respuesta, también en los 5xx, y se propaga a todos los logs de esa solicitud con `AsyncLocalStorage`.
- En los 5xx el id va **solo en la cabecera**, no en el cuerpo: el cuerpo de un 500 es el de siempre (`{"statusCode":500,"message":"Internal server error"}`) y el de `/api/health/db` es un contrato que usa el workflow de deploy.

## Redacción

`backend/src/observabilidad/redaccion.ts`. `LoggerJson` aplica `redactar()` a cada mensaje, objeto, error y stack antes de escribir. Reemplaza por `[REDACTADO]`:

- **Por clave** (en cualquier nivel de un objeto): password, contraseña, token, authorization, cookie, secret/secreto, desafio, codigo, credencial, clave, llave, hash, refresh, correo/email, y `rut`, `otp`, `totp`, `jwt`, `code` como palabra completa (así `route` no se toca).
- **Por patrón en cualquier texto**: JWT (`eyJ…`), `Bearer …`, `clave=valor` y `"clave":"valor"` de las palabras anteriores, «código TOTP 123456», el fragmento `#token` de un enlace de recuperación, correos, RUT (con y sin puntos o guion, y con el dígito verificador pegado) y cualquier texto opaco de 32 o más caracteres que no sea un uuid (refresh tokens, hashes).
- **Errores**: solo `name`, `message` y `stack`, redactados.

Es deliberadamente conservadora: prefiere redactar de más. Efecto conocido: un campo llamado `codigo` (por ejemplo, el de un curso) se redacta si alguien lo agrega a un log.

Además, lo que **no se escribe nunca**: cuerpos de solicitud o respuesta, cabeceras, query strings y nombres o correos de usuarios.

## Errores

`FiltroExcepciones` (global) registra los 5xx con `requestId`, `method`, `route`, `status` y el error redactado, y deja que Nest responda como siempre: un error que no es `HttpException` sigue respondiendo 500 `Internal server error`. Los 4xx esperados no pasan por aquí: su línea de acceso (`warn`) basta.

## Cómo buscar en CloudWatch Logs Insights

Elige el log group del entorno: `/ecs/cursus-staging` o `/ecs/cursus-production`.

Todas las líneas de una solicitud:

```
fields @timestamp, level, context, message, method, route, status
| filter requestId = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b"
| sort @timestamp asc
```

Los 5xx de la última hora, con su requestId:

```
fields @timestamp, requestId, route, status, error.message
| filter level = "error" and context = "Excepciones"
| sort @timestamp desc
| limit 50
```

Rutas más lentas (percentil 95):

```
filter context = "Acceso"
| stats count() as solicitudes, pct(durationMs, 95) as p95 by route
| sort p95 desc
| limit 20
```

Todo lo que no es un 2xx, por ruta:

```
filter context = "Acceso" and status >= 400
| stats count() by route, status
| sort count() desc
```

Un requestId que le reporta un usuario (la cabecera `X-Request-Id` de la respuesta): se pega en el primer filtro.

## Pruebas

- `src/observabilidad/redaccion.spec.ts`: contraseña, JWT, refresh token, enlace de recuperación, código TOTP, Authorization, Cookie, desafío MFA, correo y RUT (con y sin puntos o guion) en texto, objeto, error y stack nunca salen.
- `src/observabilidad/logger-json.spec.ts`: línea JSON con `timestamp` ISO, `level`, `environment`, `requestId`; una sola línea ante saltos de línea; un campo del llamador no pisa los fijos; `LOG_LEVEL`; saneo del requestId.
- `test/observabilidad/logs.e2e-spec.ts`: línea de acceso con método, ruta (patrón, sin query), status y duración; requestId entrante válido respetado e inválido reemplazado, y la cabecera en la respuesta; `/health` sin ruido; 4xx en `warn` sin stack; un 500 real registrado con requestId y sin datos sensibles, con la respuesta intacta.
- Se revirtieron, y su prueba falla: la redacción del logger, `redactarTexto`, la redacción por clave, el saneo del requestId, el patrón de ruta (query string) y el silencio de `/health`.

## Qué falta verificar con AWS real

- Que las líneas lleguen a `/ecs/cursus-staging` y `/ecs/cursus-production` y que Logs Insights descubra los campos JSON (se probó solo escribiendo a stdout).
- **`environment`**: el contenedor no define `ENTORNO`, así que el campo sale `production` también en staging (el log group sí está separado por entorno). Para distinguirlo dentro de la línea basta agregar `{ Name: ENTORNO, Value: !Ref Entorno }` en `Environment` de la tarea de `infra/aws/cursus.yml`. No se hizo para no tocar la infraestructura en esta tarjeta.
- Volumen y costo de los logs (una línea por solicitud; 7 días de retención), y el comportamiento bajo carga.
- Que el stack de un 5xx no supere el límite de 256 KB por evento de CloudWatch en errores muy profundos.
