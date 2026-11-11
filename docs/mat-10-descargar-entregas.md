# MAT-10: el profesor o el ayudante descarga los informes entregados

Tarjeta: [F4 · MAT-10](https://trello.com/c/54WsafEB/138-f4-mat-10-profesor-o-ayudante-descarga-los-informes-entregados). Referencia: RN-08. Depende de MAT-09 (entregas), MAT-01 (archivos en S3), MAT-08 (actividades) y GES-25 (varios profesores por sección).

**Como** profesor o ayudante, **quiero** descargar los informes entregados en una actividad, **para** corregirlos.

## Criterios de aceptación

| Criterio                                                                                    | Implementación y pruebas                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Se listan las entregas con alumno, fecha y hora, y se marcan los alumnos que no entregaron. | El listado parte de los alumnos inscritos vigentes y agrega la última entrega de cada uno, o `null`. La tabla muestra **Entregado** o **Sin entrega**, la fecha y hora en Chile continental y cuántas versiones hay. |
| Cada informe se puede descargar por separado.                                               | Cada fila con entrega tiene **Descargar**. La API firma la versión acreditada (`version_objeto`), no la última del objeto.                                                                                           |
| Solo el profesor y los ayudantes de la sección acceden a las entregas.                      | Hay tres capas: CASL (`read Entrega` para PROFESOR y AYUDANTE), el servicio (el rol de la sesión debe coincidir con el rol en la sección) y la RLS `pol_entrega_lectura_docente` con el usuario fijado.              |

## Uso

En **Mis cursos → sección → Entregas**, el profesor y el ayudante ven bajo cada actividad:

- cuántos alumnos entregaron, por ejemplo "1 de 2 alumnos entregaron";
- una tabla con el alumno, el estado, la fecha y hora de la última entrega y el botón **Descargar**;
- cuando el alumno reemplazó su entrega, la cantidad de versiones; se descarga la última.

Mientras se pide la URL firmada, todos los botones de descarga quedan bloqueados y se desbloquean al terminar, también si la descarga falla. La tabla tiene estados de carga, vacío (sin alumnos inscritos) y error con reintento. El alumno y el Director no ven la tabla.

## API

`GET /api/espacio/secciones/:id/actividades/:actividadId/entregas` responde 200 con `EntregaDeAlumno[]`:

```json
[
  {
    "alumno": { "id": "uuid", "nombre": "Ana Pérez", "correo": "ana@…" },
    "entrega": {
      "id": "uuid",
      "entregadaEn": "2026-11-10T18:05:00.000Z",
      "versiones": 2,
      "archivo": {
        "id": "uuid",
        "nombre": "Informe.pdf",
        "tipo": "application/pdf",
        "tamano": 1234,
        "subidoEn": "…"
      }
    }
  },
  {
    "alumno": { "id": "uuid", "nombre": "Bruno Soto", "correo": "…" },
    "entrega": null
  }
]
```

Incluye un elemento por cada alumno con inscripción y cuenta vigentes. El orden es por nombre (collation `es-CL`) y luego por correo, como ESP-05. `usuario` guarda el nombre completo en una sola columna, así que no se puede ordenar por apellido.

`GET …/entregas/:entregaId/descarga` responde 200 con `DescargaArchivo` (`{ url, expiraEn }`). La URL dura 5 minutos y firma el `VersionId` acreditado con `Content-Disposition: attachment` y `Cache-Control: no-store`. Cualquier versión anterior también se puede descargar por su id.

| Resultado | Motivo                                                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400       | Algún id no es un UUID.                                                                                                                                                                 |
| 401       | Sin sesión.                                                                                                                                                                             |
| 403       | Otro rol (alumno, Administrativo, Director), o un docente que no lo es de esta sección.                                                                                                 |
| 404       | La sección es de otra universidad o no existe; la actividad está archivada o es de otra sección; la entrega no existe, es de otra actividad o la RLS la oculta. No se revela si existe. |
| 503       | El almacenamiento no está disponible (solo en la descarga).                                                                                                                             |

## Datos y permisos

La migración `1792880000000-LeerEntregasDocentes` solo agrega `pol_entrega_lectura_docente` (SELECT en `entrega`). Sus condiciones:

- la universidad de la sesión;
- rol `PROFESOR` o `AYUDANTE`;
- el usuario fijado es profesor vigente de la sección de la actividad (`es_profesor_de_seccion`, GES-25), o ayudante vigente si el rol es AYUDANTE.

Sin usuario fijado no se lee nada. `pol_entrega_lectura` del alumno no cambia. `archivo` no necesita otra política: `pol_archivo_lectura` ya deja leer a la universidad, y la privacidad de la entrega la da la fila de `entrega`. Su `down()` quita la política.

El número es mayor que el último de `develop` (`1792860000000`) y deja libre `1792870000000` para que el #105 (MAT-02) se renumere.

`AlmacenamientoService.firmarDescarga` recibe un `version` opcional. Con él, firma ese `VersionId` y pide `no-store`. La descarga genérica de MAT-01 no cambia.

## Para EXP-02

La exportación en ZIP (EXP-02) puede reutilizar `EntregasService.listar` para saber qué entrega y qué versión incluir de cada alumno, y `firmarDescarga` con `version` para leer cada objeto.

## Verificación

```sh
npm run lint && npm run format:check && npm run build && npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
```

- `entregas-docentes.db-spec.ts` (PostgreSQL real con RLS):
  - qué ven el profesor, el co-profesor y el ayudante vigente;
  - que no leen un ayudante archivado, un profesor de otra sección, un profesor con sesión de ayudante, otra universidad ni un usuario sin fijar;
  - que el alumno sigue viendo solo lo suyo;
  - que los alumnos sin entrega aparecen y se cuentan las versiones;
  - que la descarga firma `version_objeto` aunque el objeto tenga otra versión más reciente.
- `entregas-docentes.e2e-spec.ts`: 200, 401, 403, 404 y 400.
- `almacenamiento.service.spec.ts`: la firma con `versionId` y `response-cache-control`.
- `PestanaEntregas.test.tsx`: la tabla, que el alumno no la ve, el estado vacío, el error con reintento, la descarga y el desbloqueo tras un error.
- La matriz CASL, el contrato RLS y la aplicación y reversión de migraciones incluyen MAT-10.
