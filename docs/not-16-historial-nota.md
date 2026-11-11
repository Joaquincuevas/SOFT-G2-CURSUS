# NOT-16 · Profesor ve el historial de cambios de una nota

Referencia RN-12. Depende de NOT-15 para generar las recorrecciones. [Tarjeta Trello](https://trello.com/c/gaPBxPYA/129-f4-not-16-profesor-ve-el-historial-de-cambios-de-una-nota).

En **Mis Cursos → sección → Notas → Evaluaciones**, un profesor vigente puede abrir **Ver historial** y elegir un alumno con inscripción activa. La tabla muestra fecha y hora de Chile, responsable, tipo, valor anterior, valor nuevo y motivo. Los campos que el evento no registra se muestran con un guion.

El endpoint de solo lectura es `GET /api/espacio/secciones/:seccionId/evaluaciones/:evaluacionId/notas/:alumnoId/historial`. Lee `nota_cambio` (NOT-04) y ordena por fecha ascendente e ID para los empates. Si hay eventos propios, incluye la propuesta, la publicación, las recorrecciones y los eventos generales de esa evaluación (envío, aprobación y devolución). Una nota sin eventos propios muestra el estado vacío. Los responsables se identifican por el nombre de su cuenta, aunque esté archivada.

La consulta exige que la evaluación y el alumno correspondan a la sección y que quien consulta sea uno de sus profesores vigentes. Conserva el filtro por universidad y la RLS existente. El historial no agrega migraciones ni operaciones de escritura.

## Cómo revisar

1. Como ayudante, guardar las propuestas de una evaluación y enviarlas a revisión. Como profesor, aprobarlas y publicar. Si NOT-15 ya está integrado, recorregir una nota dos veces con motivos distintos.
2. En la lista de evaluaciones, abrir **Ver historial** y seleccionar al alumno. Comprobar que los eventos van del más antiguo al más reciente y que cada recorrección tiene los valores, el responsable y el motivo correctos. La aprobación y la publicación aparecen por separado.
3. Seleccionar otro alumno y comprobar que solo aparecen sus valores y los eventos generales de la evaluación. Una nota sin eventos muestra un mensaje de historial vacío.
4. Verificar que el ayudante y el alumno no tienen acceso al historial y que los datos de otra sección o universidad no aparecen.

```sh
npm run test --workspace=frontend -- src/pages/PestanaNotas.test.tsx
npm run test:db --workspace=backend -- test/notas/notas.db-spec.ts test/notas/auditoria-notas.db-spec.ts
```

La prueba de PostgreSQL genera propuestas, envíos, devolución, aprobación y publicación a través de la API. Usa eventos de recorrección como datos de prueba para verificar la lectura antes de que se integre NOT-15.

[Acceso desde la evaluación](evidencias/not-16-evaluaciones.png) · [Historial abierto con dos recorrecciones](evidencias/not-16-historial-nota.png). Las capturas usan datos simulados.
