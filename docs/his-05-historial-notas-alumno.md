# HIS-05 · Historial de notas del alumno

El alumno abre **Historial de notas** desde el dashboard o desde **Mis Cursos**. Los cursos se agrupan por período, del más reciente al más antiguo. El detalle muestra sus evaluaciones y notas en solo lectura.

## Cómo probar

1. Usa un curso de un período cuya fecha de término ya pasó. Inscribe un alumno, publica sus notas y cierra el curso como administrativo.
2. Entra como ese alumno y abre **Historial de notas**. Verifica el grupo del período, la sección y la nota final. Abre el curso y compara las notas del detalle con las publicadas.
3. Archiva el curso y comprueba que sigue en el historial. Prueba también un curso anterior que sigue abierto, un curso cerrado de un período que aún no termina y una sección con solo propuestas para el alumno. Esos cursos quedan fuera del historial.
4. Con otro alumno que carezca de notas publicadas en esa sección, abre el mismo enlace. La API responde 404.

La fecha de término se compara con el día de Chile. El historial conserva las notas publicadas del alumno aunque el curso esté archivado o ya no tenga inscripción vigente. El backend reutiliza el cálculo de NOT-14 y muestra una nota parcial si el registro histórico está incompleto. Las propuestas quedan sin valor visible.

```sh
npm run test -w frontend -- HistorialAlumno MisNotas Dashboard
npm run test:db -w backend -- test/notas/notas.db-spec.ts
```
