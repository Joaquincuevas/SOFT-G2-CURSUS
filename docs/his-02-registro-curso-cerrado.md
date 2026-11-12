# HIS-02 · Registro académico de cursos cerrados

Al cerrar un curso mediante HIS-01, sus secciones muestran **Curso cerrado**. Las consultas de notas, evaluaciones y asistencia conservan sus permisos habituales.

## Prueba manual

1. Prepara un curso con una sección, un profesor, un ayudante y un alumno. Completa las evaluaciones al 100 %, publica todas las notas y registra asistencia para una clase.
2. Cierra el curso como administrativo. Entra a la sección como profesor. En **Notas**, verifica que puedes consultar las notas y el historial, y que desaparecen las acciones para crear o editar evaluaciones y recorregir notas.
3. En **Asistencia**, abre la clase y comprueba que se conservan las marcas y su historial. La creación de clases, la toma de asistencia y las correcciones quedan bloqueadas.
4. Entra como ayudante y comprueba que puedes consultar las notas sin guardar ni enviar propuestas. Como alumno, comprueba que puedes consultar tus notas publicadas y tu asistencia.
5. Repite una petición de escritura directa a la API. Se espera HTTP 403 para cualquier rol. Si el rol tiene permiso habitual para la operación, el mensaje es **Curso cerrado**.

## Base de datos

Los servicios toman un bloqueo compartido sobre la fila del curso antes de escribir. El cierre usa un bloqueo exclusivo en esa misma fila. Los triggers protegen las cinco tablas académicas de escrituras directas y verifican el curso de origen y destino al cambiar el padre de una fila. En una escritura directa concurrente con el cierre, PostgreSQL devuelve un error de bloqueo para evitar esperar con las filas tomadas en orden inverso.

```sh
npm run test:db -w backend -- detalle-curso esquema-inicial multitenant/rls test/notas test/asistencia
npm run test -w frontend -- PestanaNotas PestanaAsistencia NotasDeEvaluacion AsistenciaDeClase
```
