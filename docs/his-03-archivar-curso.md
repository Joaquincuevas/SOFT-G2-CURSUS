# HIS-03 · Archivo de un curso cerrado

El administrativo puede archivar un curso cerrado de su facultad desde **Cursos → Ver detalle → Archivar curso**. Al confirmar, vuelve al listado con un aviso. El curso queda fuera de los listados vigentes.

## Cómo probar

1. Entra como administrativo al detalle de un curso abierto. La opción **Archivar curso** está oculta. Si se invoca `PATCH /api/cursos/:id/archivar`, la API responde 409.
2. Completa el cierre de HIS-01. La opción **Archivar curso** aparece en el detalle. Cancela la primera confirmación y comprueba que el curso sigue en el listado.
3. Confirma el archivo. Debe aparecer el aviso de éxito en el listado y desaparecer el curso. Al repetir la petición de archivo, la API devuelve 204 y conserva la fecha original.
4. Prueba con un administrativo de otra facultad o universidad. La API responde 404. Para el Director, la acción queda oculta y la API responde 403.

## Conservación del registro

- El archivo registra `curso.archived_at`. Se conservan el cierre, las secciones y sus evaluaciones, inscripciones, notas y asistencia. El curso archivado queda fuera de las consultas vigentes.
- La base protege las escrituras del rol de la aplicación con la misma regla de cierre y facultad. El código del curso sigue reservado en el período.
- La API carece de una operación de eliminación de cursos y su rol de base de datos carece de permiso `DELETE` sobre `curso`.

```sh
npm run test -w frontend -- CursoDetalle.test.tsx
npm run test:db -w backend -- detalle-curso listar-cursos esquema-inicial multitenant/rls
```
