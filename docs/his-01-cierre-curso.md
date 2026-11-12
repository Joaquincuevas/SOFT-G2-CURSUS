# HIS-01 · Cierre de curso

El administrativo puede cerrar un curso de su facultad desde **Cursos → Ver detalle → Cerrar curso**. La pantalla pide confirmar y muestra la fecha cuando el cierre queda registrado.

## Cómo probar

1. Usa un curso de tu facultad con dos secciones vigentes. Inscribe alumnos y crea al menos una evaluación por sección.
2. Como administrativo, abre el detalle del curso, pulsa **Cerrar curso** y elige **Cancelar**. El curso sigue abierto.
3. Deja una nota pendiente de publicar y vuelve a abrir y confirmar el cierre. Debe aparecer el nombre de la evaluación, el número de sección y cuántas notas faltan. Incluye una nota en propuesta para verificar que tampoco cuenta como publicada.
4. Deja las ponderaciones de una sección en 80 %. Confirma el cierre y verifica que el aviso de esa sección indique que faltan 20 puntos porcentuales.
5. Como profesor, ajusta las ponderaciones de cada sección al 100 % y publica las notas pendientes. Vuelve al detalle como administrativo, confirma el cierre y recarga la página. Debe seguir apareciendo **Curso cerrado el…**.
6. Prueba el mismo curso con un administrativo de otra facultad o universidad. El cierre devuelve 404. Con un Director, la acción queda oculta y la API devuelve 403.

## Reglas del cierre

- Cada evaluación vigente de una sección vigente debe tener al menos una nota publicada y una nota publicada por cada alumno con inscripción vigente. Las notas archivadas no cuentan. Si una evaluación no tiene inscritos ni notas publicadas, el mensaje dice **Sin notas publicadas**.
- Cada sección vigente debe sumar 100 % con sus evaluaciones vigentes, según NOT-02. Una sección vigente sin evaluaciones suma 0 %.
- Si una sección sin alumnos quedó abierta y no se utilizará, solicita su archivo antes de cerrar el curso. El archivo de la sección se gestiona fuera de esta pantalla. Una vez archivada, sus evaluaciones y ponderaciones quedan fuera de la validación.
- El cierre está pensado para el fin del período. Se puede ejecutar cuando se cumple la condición de publicación, sin un bloqueo adicional por fecha de calendario.
- `POST /api/cursos/:id/cierre` devuelve 409 con las evaluaciones que tienen notas pendientes y las secciones con ponderaciones distintas de 100 %. Al cerrar, devuelve 200 con fecha y responsable. Si se repite un cierre exitoso, devuelve el registro original. `GET /api/cursos/:id` incluye el cierre registrado.
- PostgreSQL guarda una sola fila de cierre por curso. La función valida el rol y la facultad de la sesión antes de consultar el estado de las notas. El administrativo recibe los conteos por evaluación.

## Integración con HIS-02

Integrar HIS-01 antes de HIS-02. `public.curso_cerrado(uuid)` devuelve un booleano y limita la consulta a la universidad de la sesión. Los triggers y políticas de HIS-02 pueden usarla para consultar el cierre. Las escrituras que deban serializarse con el cierre deben tomar primero el bloqueo de la fila del curso y comprobar el estado dentro de la misma transacción.

## Evidencia de la interfaz

- [Cierre bloqueado por notas pendientes](evidencias/his-01-cierre-bloqueado.png)
- [Curso cerrado después de recargar](evidencias/his-01-curso-cerrado.png)

## Pruebas automatizadas

```sh
npm run test -w frontend -- CursoDetalle.test.tsx
npm run test:db -w backend -- detalle-curso esquema-inicial multitenant/rls
```
