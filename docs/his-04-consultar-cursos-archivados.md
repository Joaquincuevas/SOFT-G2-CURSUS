# HIS-04 · Consulta de cursos archivados

En **Cursos → Archivados**, el administrativo ve los cursos archivados de su facultad. El filtro **Período** ofrece los períodos de esos cursos, incluidos los de hace diez años o más. Al volver desde un detalle se conserva el filtro.

## Cómo probar

1. Usa un curso de un período anterior con al menos una evaluación, una nota publicada y una clase con asistencia. Ciérralo y archívalo. Para comprobar la antigüedad, usa un período como 2014-2.
2. Abre **Cursos → Archivados**. Selecciona el período del curso y comprueba que solo quedan cursos de ese período.
3. Abre el curso, despliega una evaluación y una clase. Revisa los nombres de los alumnos, la nota publicada y la marca de asistencia. Los controles de edición quedan fuera de la vista.
4. Repite la consulta del detalle con un administrativo de otra facultad o universidad. Se espera 404. Para roles sin acceso al archivo de la facultad, se espera 403.

La consulta histórica incluye las secciones, evaluaciones, clases y marcas no retiradas, junto con las notas publicadas. Usa el nombre registrado en la cuenta del alumno aunque la cuenta esté archivada. La base autoriza la consulta puntual por rol, universidad, facultad y estado de archivo antes de devolver el registro. El listado de cursos vigentes conserva sus filtros.

```sh
npm run test -w frontend -- CursosArchivados CursoDetalle Cursos.test.tsx
npm run test:db -w backend -- detalle-curso esquema-inicial multitenant/rls
```
