# SEG-04: registro de inicios de sesión y acciones sensibles

Tarjeta: SEG-04. Los datos quedan listos para SEG-05 (la vista del Director), que no forma parte de esta tarjeta.

**Como** responsable de la seguridad, **quiero** un registro de quién inicia sesión y de las acciones sensibles, **para** poder investigar accesos y cambios sin poder alterarlos.

## Criterios de aceptación

| Criterio                                                                                            | Implementación y pruebas                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Se registran los inicios de sesión exitosos y fallidos con usuario, fecha, IP y resultado.          | `AuthController.login` registra cada intento con `registrar_inicio_sesion`: `EXITOSO`, `FALLIDO` (contraseña mala, cuenta inexistente, archivada o dominio desconocido) y `BLOQUEADO` (límite de intentos, 429). Pruebas en `test/seguridad/eventos.db-spec.ts` y `test/auth/registro-eventos.e2e-spec.ts`. |
| Se registran las acciones sensibles (cambios de notas, asignaciones y cierres) con usuario y fecha. | Triggers `AFTER INSERT` sobre `nota_cambio`, `asignacion_cambio` y `cierre_curso` (HIS-01).                                                                                                                                                                                                                 |
| Los registros no se pueden modificar desde la aplicación.                                           | La app no tiene `INSERT`, `UPDATE` ni `DELETE` sobre la tabla; un trigger rechaza `UPDATE` y `DELETE` también al dueño, y no tiene el privilegio `TRUNCATE`.                                                                                                                                                |

## Qué se registra

Tabla `evento_auditoria`, de solo adición:

| Columna          | Contenido                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `tipo`           | `INICIO_SESION`, `CAMBIO_NOTA`, `ASIGNACION` o `CIERRE_CURSO`.                                                                          |
| `resultado`      | `EXITOSO`, `FALLIDO` o `BLOQUEADO`. Solo el inicio de sesión puede fallar o bloquearse; una acción sensible se registra cuando ocurrió. |
| `usuario_id`     | La cuenta, o `NULL` si el intento no corresponde a ninguna cuenta vigente.                                                              |
| `universidad_id` | La universidad de la cuenta, o `NULL` (intento sin cuenta y superadmin).                                                                |
| `fecha`          | Hora del servidor de base de datos. En las acciones, la de la fila de historial de origen.                                              |
| `ip`             | `inet`. Solo en los inicios de sesión; `NULL` si no hay una IP confiable.                                                               |
| `detalle`        | `jsonb` con solo las claves `credencialProvisoria`, `subtipo`, `origen` y `origenId` (lo exige un `CHECK`).                             |

Acciones instrumentadas:

- **Cambios de notas** (`nota_cambio`): `APROBACION`, `DEVOLUCION` y `RECORRECCION`, es decir, lo que publica, devuelve o corrige notas. La propuesta y el envío son del borrador y no se duplican aquí; siguen en `nota_cambio`.
- **Asignaciones** (`asignacion_cambio`): el cambio de profesor o de ayudante de una sección (`subtipo` `PROFESOR` o `AYUDANTE`).
- **Cierres de curso** (`cierre_curso`, HIS-01).

El detalle apunta a la fila de origen (`origen`, `origenId`) para investigar; no copia notas, motivos ni nombres.

## Qué NO se registra (privacidad)

- Contraseñas, tokens, hashes ni RUT.
- **El correo digitado.** La gente pega la contraseña en ese campo. Un éxito registra el `usuario_id` que resolvió el login (`AuthService.iniciarSesion` lo devuelve y el controlador lo pasa a `registrar_inicio_sesion`): no se vuelve a buscar por correo, así que una cuenta archivada justo después del login no deja el éxito sin usuario. En un fallo la función recibe lo digitado solo para resolver la cuenta dentro de la base, con la misma regla que el login (sin espacios en blanco en los extremos, en minúsculas, universidad por el dominio o superadmin, sin cuentas archivadas), y guarda únicamente el `usuario_id`. Si no hay cuenta, el evento queda sin usuario: solo fecha, IP y resultado. Una cuenta archivada se registra igual que una inexistente, como responde el login.
- Valores de notas, motivos y nombres. Una prueba busca en toda la tabla las contraseñas y correos digitados.
- Al fallar el registro, el log del servidor lleva un mensaje fijo con el resultado y el SQLSTATE; nunca el texto del error del driver, que puede repetir lo digitado.

## IP

Se usa `ipLogin(req)`, la misma que ya alimenta el límite de intentos: con `ORIGIN_SECRET` configurado y la petición verificada, la de `x-vercel-forwarded-for` (el proxy de Vercel); sin esa configuración, la de la conexión (`req.socket.remoteAddress`) y se ignora cualquier cabecera que envíe el cliente. Si el proxy no envía una IP, queda `NULL`. Las acciones sensibles no llevan IP: ocurren en la base, sin la petición.

## Diseño de la tabla

- **Escritura.** La app solo tiene `SELECT`. Escriben dos funciones `SECURITY DEFINER` con `search_path` fijo y `EXECUTE` revocado a `PUBLIC` (solo `registrar_inicio_sesion` se concede a `cursus_app`, porque el login no tiene sesión ni universidad): `registrar_inicio_sesion` y `registrar_evento_de_historial`, la del trigger. Es el mismo patrón de `superadmin_cambio`. Así la tabla no admite escrituras arbitrarias de la app.
- **Lectura.** `ENABLE ROW LEVEL SECURITY` (no `FORCE`) y una política solo para `DIRECTOR` y `SUPERADMIN`; un administrativo, profesor, ayudante o alumno ve 0 filas.
- **`universidad_id` opcional.** Un intento sin cuenta y el superadmin no tienen universidad, así que la FK compuesta `(usuario_id, universidad_id)` (MATCH SIMPLE) no se revisa si falta una columna. Por eso hay además una FK simple a `usuario` y otra a `universidad`: el usuario siempre existe y, cuando hay ambos, es de esa universidad.
- **Sin trigger del superadmin.** Como `curso_cambio`, `nota_cambio` o `superadmin_cambio`, es una auditoría: el contrato de `test/multitenant/rls.db-spec.ts` las exceptúa por nombre, y auditar la auditoría duplicaría cada evento.
- **Un fallo no tumba nada.** El login captura el error al registrar y lo deja en el log del servidor (`RegistroEventos`, sin el correo). El trigger lo captura con un bloque `EXCEPTION` y emite un `WARNING` en el log de PostgreSQL. En ambos casos la operación y la respuesta HTTP no cambian.
- **Migración** `1792960000000-CrearEventoAuditoria`. Su `down` quita la tabla (se pierden los eventos), las funciones y los triggers; el historial de origen queda.

## Cómo lo consultará SEG-05

Orden y paginación del más reciente al más antiguo, con `(fecha DESC, id DESC)` como cursor, y los cuatro filtros:

```sql
SELECT id, tipo, resultado, usuario_id, universidad_id, fecha, host(ip) AS ip, detalle
  FROM evento_auditoria
 WHERE ($1::uuid IS NULL OR usuario_id = $1)
   AND ($2::uuid IS NULL OR universidad_id = $2)
   AND ($3::text IS NULL OR tipo = $3)
   AND fecha >= $4 AND fecha < $5
   AND ($6::timestamptz IS NULL OR (fecha, id) < ($6, $7))
 ORDER BY fecha DESC, id DESC
 LIMIT 50
```

Un índice por filtro, con el mismo orden: `ix_evento_auditoria_fecha`, `_universidad`, `_usuario` y `_tipo`, cada uno `(…, fecha DESC, id DESC)`. Hay que ejecutarla como Director (`consultarEnTodasLasUniversidades`) o superadmin; para ver el nombre del usuario, unir con `usuario`. Una prueba ejecuta cada filtro y la paginación por cursor.

## Fuera de alcance y límites conocidos

- La vista del Director (SEG-05) y cualquier endpoint de lectura.
- La retención y el crecimiento de la tabla: cada intento fallido o bloqueado deja una fila, y el límite de intentos no frena el registro de los bloqueos. Si crece demasiado, hay que particionar por fecha o acotar los `BLOQUEADO` en otra tarjeta.
- Otras acciones (cambio de contraseña, refresh, altas de cuentas, notas propuestas) no se instrumentan.
