# NOT-03 · Profesor edita una evaluación que aún no tiene notas

[Tarjeta Trello](https://trello.com/c/4fZZ6srv/116-f4-not-03-profesor-edita-una-evaluaci%C3%B3n-que-a%C3%BAn-no-tiene-notas) · RN-10 · Depende de NOT-01.

En **Mis Cursos → sección → Notas → Evaluaciones**, cualquiera de los profesores vigentes de la sección puede editar el nombre, la fecha y la ponderación. La fecha debe estar dentro del período del curso y la ponderación debe ser un entero de 1 a 100. Al guardar se actualizan la fila y el total de ponderaciones. Si ya se ingresó una nota, incluso una propuesta o una nota archivada, la lista explica por qué no se puede editar y el servidor responde 409 a un intento de guardado.

`PUT /api/espacio/secciones/:seccionId/evaluaciones/:evaluacionId` recibe `{ nombre, fecha, ponderacion }`. El listado entrega `tieneNotas` al profesor. El ayudante conserva `envio` con los estados y el comentario de devolución de NOT-09.

## Protección y auditoría en PostgreSQL

- La migración `1792800000000-CrearEvaluacionCambio` se aplica después de GES-25. La RLS de UPDATE exige que el usuario de sesión sea profesor vigente de la sección activa, según `es_profesor_de_seccion`. El trigger fija su asignación y cuenta durante el guardado. `cursus_app` solo tiene permiso para actualizar nombre, fecha y ponderación.
- Un trigger comprueba que no haya notas y registra la edición con la fecha del cambio, el responsable y los valores anterior y nuevo. Funciona también por SQL directo; `cursus_app` no puede insertar registros de historial por su cuenta. Un cambio sin diferencias no deja un registro, y si la transacción se revierte también se revierte el historial.
- La edición y la primera escritura de notas comparten un bloqueo por evaluación. El SQL directo puede recibir `40001` si el bloqueo de notas está ocupado o `55P03` si hay una escritura concurrente sobre la sección, la asignación o la cuenta. En ambos casos se reintenta en una nueva transacción. El trigger requiere `READ COMMITTED` para ver las notas que se confirmaron antes de tomar el bloqueo.

## Cómo revisar

1. Como profesor asignado, crear una evaluación sin notas. Editar nombre, fecha y ponderación, guardar y recargar: los tres cambios y la suma deben mantenerse. Probar una fecha fuera del período y comprobar que se rechaza.
2. Como ayudante, guardar una propuesta en esa evaluación. Volver como profesor: la evaluación debe indicar que ya tiene notas. Una solicitud de edición a la API debe responder 409.
3. Como ayudante, abrir el listado y revisar que conserva el estado del envío y el comentario si fue devuelto. Guardar o reenviar y verificar que se actualiza la fila.
4. Ejecutar las pruebas de PostgreSQL: usan `SET LOCAL ROLE cursus_app` para comprobar que otro profesor de la universidad no puede editar la fila, que los tres campos quedan bloqueados cuando hay notas y que una edición por SQL queda auditada en la misma transacción.
5. Con dos profesores asignados a la misma sección, editar una evaluación sin notas con cada uno. Verificar que cada entrada del historial registra al profesor que guardó. Retirar al segundo profesor y comprobar que pierde el permiso de edición.

```sh
npm run test --workspace=frontend -- src/pages/PestanaNotas.test.tsx src/pages/NotasDeEvaluacion.test.tsx src/pages/EstadoEnviosNotas.test.tsx --maxWorkers=1
npm run test:db --workspace=backend -- test/notas/evaluaciones.db-spec.ts test/notas/notas.db-spec.ts test/database/esquema-inicial.db-spec.ts test/multitenant/rls.db-spec.ts
```
