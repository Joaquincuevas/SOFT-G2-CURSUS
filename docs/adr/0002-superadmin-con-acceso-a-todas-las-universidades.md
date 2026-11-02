# ADR 0002: superadmin con acceso a todas las universidades

- **Estado:** Aceptada
- **Fecha:** 2026-10-27
- **Tarjetas:** MT-04 (decisión e implementación), GES-23 y GES-24 (lo que el superadmin escribe fuera de una facultad)

## Contexto

CURSUS aísla los datos por universidad en la API (MT-01) y en PostgreSQL con Row-Level Security (MT-02). La única excepción es el Director, que lee todas las universidades pero no modifica ninguna (ADR 0001).

En la demo de la E5, el profesor pidió un superadmin para producción, que pueda ver, crear, editar y archivar todo y que cree los usuarios iniciales (Directores y Administrativos). Hasta ahora, el plan era que el equipo cargara esos usuarios antes de entregar (INFRA-11), y producción no tiene datos: el seed nunca corre ahí.

## Decisión

- **Rol `SUPERADMIN`** en el enum `rol_usuario`. El superadmin no tiene universidad ni facultad propias (`usuario.universidad_id` es NULL solo para él, con un CHECK), y su correo es único entre los superadmins.
- **Trabaja dentro de una facultad.** Desde su Dashboard elige una universidad y una facultad (`PUT /api/superadmin/contexto`), y puede salir de ellas para volver a la vista global (`DELETE /api/superadmin/contexto`). La elección se guarda en su sesión (`sesion_auth`) y no en el JWT, así que rige desde la petición siguiente y cada sesión tiene la suya. Dentro de la facultad, la API lo trata como el Administrativo de esa facultad: `@UniversidadActual()` le entrega la universidad elegida y el rol `ADMINISTRATIVO`, y reutiliza las mismas rutas, servicios y vistas. Mientras no elija una, esas rutas le responden 403.
- **RLS se le sigue aplicando.** Dentro de la facultad, sus consultas pasan por las mismas políticas que las del Administrativo, con la universidad elegida. Para elegir dónde trabajar, las políticas de lectura de `universidad` y `facultad` lo dejan leer las de todas (`consultarComoSuperadmin`, en una transacción READ ONLY). Escribir universidades, facultades y usuarios de cualquier rol es GES-23 y GES-24.
- **La facultad se resuelve en la base.** La función `facultad_actual(usuario)` devuelve la facultad elegida por el superadmin o la del Administrativo, y reemplaza a la subconsulta que repetían los servicios de gestión.
- **Cada acción queda auditada.** Un trigger en cada tabla institucional guarda en `superadmin_cambio` la fila anterior y la nueva (sin `password_hash`), el superadmin, la fecha y el motivo, si la acción lo tiene. Corre solo cuando la consulta es de un superadmin (`app.superadmin_id`), así que no depende de que cada servicio registre el cambio. La tabla es de solo adición.
- **Solo un comando crea superadmins** (`npm run superadmin`, o `infra/aws/superadmin.sh` en AWS), con una contraseña provisoria que se cambia en el primer ingreso (PER-03). La API no puede: las políticas de `usuario` exigen la universidad de la sesión, y el superadmin no tiene una.

## Alternativas descartadas

- **Un rol de base de datos con `BYPASSRLS`** que el backend usa con `SET LOCAL ROLE` en las sesiones del superadmin: saca la red de seguridad de RLS justo al usuario con más permisos, y en RDS el usuario de las migraciones no es superusuario, así que podría no poder crear ese rol. Las políticas por rol, como con el Director, cubren el caso sin ese riesgo.
- **Agregar `OR rol_actual() = 'SUPERADMIN'` a todas las políticas:** obliga a tocar las políticas de cada tabla, y de cada tabla nueva, y no resuelve en qué facultad trabaja. Solo se usa en la lectura de `universidad` y `facultad`.
- **Un usuario por universidad para el superadmin** (o la tabla `usuario_universidad` del ADR 0001): duplica cuentas y credenciales, y no deja auditar a una misma persona.
- **Guardar la elección en el JWT:** obliga a emitir un token nuevo en cada cambio, y el JWT dura 15 minutos aunque la facultad se archive antes.

## Consecuencias

- Las FKs compuestas que exigían que el responsable de un cambio fuera de la misma universidad (`curso_cambio`, `asignacion_cambio` e `inscripcion.archivada_por`) pasan a referenciar solo al usuario. Un trigger mantiene la regla: el responsable es de esa universidad o es un superadmin.
- RLS no deja ver la fila del superadmin desde la API, ni al Director. Las consultas que muestran el nombre del responsable usan `LEFT JOIN` y muestran "Superadmin".
- Cada tabla nueva con `universidad_id` debe tener el trigger de auditoría `tg_<tabla>_auditar_superadmin`. Un test de contrato (`test/multitenant/rls.db-spec.ts`) falla si falta.
- Cada ruta nueva que use `@UniversidadActual()` o `@IntegranteDeSeccion()` ya considera al superadmin. Las que revisan el rol en la sección (`seccion.rol`) lo ven como `ADMINISTRATIVO`.
- La regla de aislamiento entre universidades queda así: el Director lee todas sin modificar ninguna, y solo el superadmin trabaja en cualquiera, en una facultad a la vez y con auditoría. Los demás roles siguen aislados en su universidad.
