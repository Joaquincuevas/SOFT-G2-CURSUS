# EXP-01 · Exportación de notas a CSV

**Caso de uso.** Un profesor vigente de una sección abre **Notas → Notas finales → Exportar notas a CSV** y descarga las notas publicadas de esa sección.

**Requerimiento.** La exportación es de solo lectura y exige una asignación vigente como profesor de la sección. El archivo incluye una fila por inscripción vigente, una columna por evaluación vigente y la columna **Nota final** calculada con NOT-14. Las notas sin publicar y los promedios parciales dejan su celda vacía. El CSV usa UTF-8 con BOM, punto y coma como separador y coma decimal.

## Cómo probar

1. Prepara una sección con dos evaluaciones y tres alumnos. Publica ambas notas de uno, solo una del segundo y deja las del tercero sin publicar.
2. Como profesor asignado, descarga el CSV. Verifica las tres filas y el orden de las evaluaciones por fecha. Solo el primer alumno debe tener nota final si las ponderaciones suman 100 %.
3. Repite con un ayudante y con un profesor sin asignación vigente. El botón solo aparece en la vista del profesor de la sección y la API rechaza las solicitudes sin autorización.
4. Abre el archivo en una planilla y verifica las tildes, la coma decimal y los nombres de evaluación que contienen comillas o punto y coma.

```sh
npm run test -w frontend -- NotasFinales
npm run test:db -w backend -- test/notas/notas.db-spec.ts -t EXP-01
```
