# Datos de demo y guía para presentar CURSUS

El seed (`npm run seed --workspace=backend`, o `infra/aws/seed.sh staging` en AWS) carga, además de los datos base, una capa de demo ([seed-demo.ts](../../backend/src/database/seed-demo.ts)) para que la aplicación se vea como una universidad en funcionamiento.

## Qué se carga

| Facultad                    | Personas extra                         | Períodos cerrados       | Período activo (2026-2)          |
| --------------------------- | -------------------------------------- | ----------------------- | -------------------------------- |
| Ingeniería (Norte)          | 8 profesores, 8 ayudantes, 150 alumnos | 2025-1, 2025-2 y 2026-1 | 15 cursos, 30 secciones (GES-20) |
| Economía y Negocios (Norte) | 2 profesores, 2 ayudantes, 40 alumnos  | 2026-1                  | 5 cursos, 10 secciones           |
| Ciencias de la Salud (Sur)  | 2 profesores, 2 ayudantes, 40 alumnos  | 2026-1                  | 5 cursos, 10 secciones           |

Las personas extra se suman a las de GES-22 y tienen nombre y dos apellidos (por ejemplo, `ana.gonzalez.cortes@norte.cursus.test`), con la misma contraseña que el resto del seed.

- **Períodos cerrados:** cada curso tiene dos secciones con horario, profesor, ayudantes y alumnos, cinco evaluaciones que suman 100 % con todas sus notas publicadas, su auditoría (propuesta, envío y aprobación) y la asistencia del semestre. Todos los cursos quedan cerrados (HIS-01), y los de 2025-1 además archivados (HIS-03).
- **Período activo:** las evaluaciones ya rendidas tienen notas; la última rendida queda en distintos estados según la sección (en revisión, en borrador o devuelta). Las clases van desde el 3 de agosto hasta ayer, sin la semana de Fiestas Patrias, y la asistencia de los últimos tres días queda por marcar. Cada curso tiene anuncios y cada sección dos actividades con plazo abierto.
- **Registro de accesos:** dos semanas de inicios de sesión (algunos fallidos) en cada universidad.
- **Fuera de este PR:** el material, los sílabos y las entregas necesitan archivos en S3; van en un PR aparte.

Las fechas se calculan con el día en que se corre el seed (hora de Chile). Para la demo, conviene cargarlo el mismo día o el anterior.

## Con quién entrar

Los correos son los de la tabla del README. La contraseña es `SEED_PASSWORD` en local, o el secreto `cursus-staging/seed-password` en staging. En Sur, el profesor, el ayudante y el alumno de la tabla no tienen secciones: para esos roles, usar los de Norte.

| Usuario                                       | Qué mostrar                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alumno@norte.cursus.test`                    | Cinco ramos este semestre (Bases de Datos, Redes de Computadores, Ingeniería de Software, Gestión de la Calidad y Sistemas de Control), con notas, asistencia y los anuncios de los últimos días sin leer. Su historial muestra tres semestres; reprobó Estructuras de Datos en 2025-2 y la aprobó en 2026-1. |
| `profesor@norte.cursus.test`                  | Tres secciones: en Ingeniería de Software la Prueba 2 espera su aprobación; en Bases de Datos el ayudante aún la está ingresando; en Redes de Computadores la comparte con otro profesor (GES-25) y la Prueba 2 fue devuelta con un comentario. También puede marcar la asistencia de las últimas clases.     |
| `ayudante@norte.cursus.test`                  | Ayudante de Bases de Datos (puede completar y enviar las notas de la Prueba 2) y de Ingeniería de Software.                                                                                                                                                                                                   |
| `administrativo.ingenieria@norte.cursus.test` | Tres carreras con sus cursos y secciones completas, los períodos anteriores con cursos cerrados y los archivados de 2025-1, y el reporte de la facultad. Es quien usa el CSV (abajo).                                                                                                                         |
| `director@norte.cursus.test`                  | Indicadores y comparación de las dos universidades, el detalle por facultad, carrera y curso, y el registro de accesos. El Director tiene una universidad de origen (ADR 0001), pero lee las dos.                                                                                                             |
| Superadmin                                    | Se conserva: es la cuenta creada con `superadmin.sh`. Elige universidad y facultad, y trabaja como el Administrativo de esa facultad.                                                                                                                                                                         |

## Crear un curso y cargar sus alumnos con el CSV

[alumnos-seccion-nueva.csv](alumnos-seccion-nueva.csv) tiene 35 alumnos de `norte.cursus.test` que no existen en el seed, en el formato de GES-16 (`correo,nombre`).

1. Entrar como `administrativo.ingenieria@norte.cursus.test`.
2. Crear un curso en el período activo (por ejemplo, `ICC205 Taller de Desarrollo Web`) y su sección, con horario, profesor y ayudantes.
3. En la sección, **Cargar CSV** y elegir el archivo. Se crean las 35 cuentas, cada una con su contraseña provisoria, que se muestra una sola vez.
4. Volver a cargar el mismo archivo muestra que el sistema rechaza a los alumnos ya inscritos.

Para repetir la demo desde cero, reiniciar la base (abajo): las cuentas del CSV se borran y el archivo vuelve a servir.

## Cargar o reiniciar los datos

En local:

```bash
npm run seed --workspace=backend                    # carga o completa los datos
SEED_RESET=true npm run seed --workspace=backend    # vacía la base (salvo los superadmins) y carga todo
```

En staging, desde CloudShell y con staging encendido:

```bash
bash infra/aws/seed.sh staging            # carga o completa los datos
bash infra/aws/seed.sh staging --reset    # vacía la base (salvo los superadmins) y carga todo
```

- El seed se puede repetir: un período cerrado que ya existe no se toca, y una sección que ya tiene evaluaciones tampoco.
- El reinicio borra todo lo que se haya creado a mano (cursos, cuentas, notas, sesiones) y conserva solo a los superadmins y su MFA. Quienes tenían sesión abierta tienen que volver a entrar.
- Corre en una sola transacción: si la carga falla, la base queda como estaba.
- Exige `SEED_RESET=true` (además de `SEED_ALLOW=true` en AWS) y el nombre de la base en `POSTGRES_DB`. Antes de borrar, comprueba en la misma conexión que la base conectada es esa, y nunca corre sobre `cursus_production`. `seed.sh` ya se niega con `production`.
