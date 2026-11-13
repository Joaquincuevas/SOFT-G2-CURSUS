# SEG-05: el Director consulta el log de accesos

Tarjeta: SEG-05. Consulta el registro de solo adición de SEG-04 (`evento_auditoria`).

**Como** Director, **quiero** consultar el log de accesos y acciones sensibles, **para** investigar quién entró y qué cambió.

## Criterios de aceptación

| Criterio                                                            | Implementación y pruebas                                                                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El Director consulta el log de accesos y acciones.                  | `GET /api/auditoria/eventos` y la vista `/accesos` («Registro de accesos»). `test/auditoria/eventos.db-spec.ts`, `RegistroAccesos.test.tsx`.                            |
| Filtros por usuario, universidad, tipo de evento y rango de fechas. | Query `usuarioId`, `universidadId`, `tipo`, `desde`, `hasta`, combinables. En la vista, el usuario se elige haciendo clic en su nombre en la tabla.                     |
| Resultados paginados, del más reciente al más antiguo.              | `pagina` y `tamano` (25 por defecto, máximo 100); orden `(fecha DESC, id DESC)`, el de los índices de SEG-04. La respuesta trae `total`, `pagina`, `tamano`, `eventos`. |
| Solo el Director accede.                                            | CASL `read RegistroAccesos` (solo `DIRECTOR`), y `consultarEnTodasLasUniversidades` lo exige otra vez. Los demás roles, incluido el superadmin, reciben 403.            |

## API

`GET /api/auditoria/eventos` (Director). Todos los parámetros son opcionales:

| Parámetro                    | Regla                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `usuarioId`, `universidadId` | UUID. Uno que no existe da una lista vacía, no un error.                                                                            |
| `tipo`                       | `INICIO_SESION`, `CAMBIO_NOTA`, `ASIGNACION` o `CIERRE_CURSO`.                                                                      |
| `desde`, `hasta`             | Instante ISO 8601 **con zona horaria** (`Z` o `±hh:mm`), ambos extremos incluidos. Sin zona, o `desde` posterior a `hasta`, es 400. |
| `pagina`, `tamano`           | Enteros ≥ 1; `tamano` ≤ 100 (400 si lo supera); `pagina` ≤ 100000.                                                                  |

Un parámetro desconocido o inválido responde 400 (`forbidNonWhitelisted`). `GET /api/auditoria/universidades` entrega las opciones del filtro de universidad (solo Director).

Cada evento: `id`, `tipo`, `resultado`, `fecha` (UTC), `ip`, `usuario` (`id`, `nombre`, `rol`, o `null`), `universidad` (`id`, `nombre`, o `null`) y `detalle`.

## Alcance del Director

El Director de CURSUS no pertenece a una universidad: ve todas (ADR 0001) y la política de `evento_auditoria` de SEG-04 lo deja leer todo. Por eso el filtro `universidadId` es un filtro, no una restricción: no hay «su universidad» a la que acotarlo. No hay ningún otro modo de que un Director vea una universidad que no le corresponde, porque no existe tal límite en su rol.

El superadmin lee la tabla en la base, pero la API no le da acceso: la tarjeta pide que solo el Director consulte.

## Privacidad

- La consulta no devuelve el correo de nadie, hashes, tokens ni valores de notas: del usuario solo el `nombre` y el `rol`; del detalle, solo las claves que SEG-04 permite (`subtipo`, `origen`, `origenId`, `credencialProvisoria`). Una prueba busca contraseñas, hashes y dominios de correo en la respuesta.
- Un intento de login sin cuenta sigue sin usuario ni universidad: se muestra «Sin cuenta».
- La lectura corre en una transacción `READ ONLY`. La app no tiene `INSERT`, `UPDATE`, `DELETE` ni `TRUNCATE` sobre la tabla (SEG-04); una prueba los intenta con el rol de la app y la base los rechaza.

## Vista

`/accesos`, solo en el menú y las rutas del Director (el mismo permiso de CASL que el backend). Filtros de tipo, universidad, desde y hasta; tabla con fecha, evento, resultado, usuario, universidad, IP y detalle; paginación Anterior/Siguiente; estados de carga, vacío y error con «Reintentar». Los filtros y la página viven en la URL.

Las fechas se muestran en la zona horaria del navegador, con su abreviatura en cada fecha y el nombre de la zona sobre la tabla; el instante exacto va en el atributo `dateTime`. Los días de los filtros son días completos de esa zona (de 00:00:00 a 23:59:59.999) y se envían como instantes.

## Migración

No hizo falta: SEG-04 ya dejó la tabla, los índices por filtro, el `GRANT SELECT` y la RLS de lectura para `DIRECTOR` y `SUPERADMIN`.

## Límites

- La paginación es por `OFFSET`: páginas muy profundas de una tabla grande son más lentas (por eso `pagina` tiene tope). Si el volumen lo pide, hay que pasar a cursor `(fecha, id)`.
- `total` y la página son dos consultas: si entran eventos entre ambas, pueden diferir en uno.
- No se filtra por `resultado` (exitoso, fallido o bloqueado), porque la tarjeta no lo pide.
