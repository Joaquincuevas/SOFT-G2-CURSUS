# GES-10: horario de una sección

Tarjeta: [F2 · GES-10 Administrativo asigna días, bloques y sala a una sección](https://trello.com/c/9WRuW0DT/97-f2-ges-10-administrativo-asigna-d%C3%ADas-bloques-y-sala-a-una-secci%C3%B3n). Referencia: RN-04. Depende de GES-09, ya integrada en `develop`.

## Comportamiento

El Administrativo abre **Asignar horario** desde una sección del detalle del curso. Puede agregar varios bloques semanales, cada uno con día, hora de inicio, hora de término y sala. Se usan horas de inicio y término, según lo confirmado para esta tarjeta; el nombre de la sala se escribe directamente. Los días van de lunes a domingo y las horas son locales de la universidad, con precisión de minutos.

**Editar horario** carga los bloques actuales y permite modificar o quitar cualquiera. **Guardar horario** guarda todos juntos, actualiza el resumen de esa sección y cierra el diálogo. El horario persiste al recargar y el Director puede leerlo en el detalle, sin acciones de edición. La asignación posterior de un profesor conserva el horario.

Cancelar o Escape descartan los cambios que aún no se enviaron. Durante el guardado se bloquean los campos, Cancelar y Escape. Si hay un error, el diálogo conserva los datos para reintentar. Si otra sesión modificó el horario, se informa el conflicto y se exige **Recargar horario** antes de guardar; esa acción descarta la edición local.

Quitar un bloque lo archiva. Al reemplazar el horario, las filas anteriores se conservan con `archived_at` y se crean las nuevas dentro de la misma transacción. Se permite quitar el último bloque: el detalle vuelve a mostrar **Sin asignar**. No se elimina información institucional.

## Contrato de API

Solo el Administrativo con permiso `update` sobre `Seccion` usa el editor. Se valida que la sección y su curso estén vigentes y pertenezcan a su facultad. Otra facultad, otra universidad, un recurso inexistente o archivado responden 404. El Director consulta el resumen mediante el detalle del curso y recibe 403 si intenta acceder directamente al editor.

- `GET /api/secciones/:id/horario` devuelve `{ version, bloques, resumen }`. Un horario nuevo tiene versión 0, lista vacía y resumen null.
- `PUT /api/secciones/:id/horario` reemplaza el horario completo. Recibe `{ version, bloques }`; la versión debe ser la que entregó el GET. Devuelve 200 con el horario ordenado por día e inicio, el nuevo resumen y la versión incrementada.
- Cada bloque es `{ dia, inicio, termino, sala }`: día entero de 1 (lunes) a 7 (domingo), horas `HH:mm` y sala de 1 a 100 caracteres. Se recortan espacios extremos y se normalizan espacios consecutivos del nombre de la sala.
- Se aceptan hasta 100 bloques. El término debe ser posterior al inicio dentro del mismo día. No se permiten duplicados ni superposiciones dentro de una misma sección; los bloques consecutivos sí se aceptan. El conjunto inválido responde 400 y no modifica el horario.
- Una versión desactualizada responde 409. El bloqueo de la sección y el curso serializa los guardados simultáneos; uno no sobrescribe silenciosamente al otro.
- `GET /api/cursos/:id` mantiene `secciones[].horario` como resumen de texto, o null si no tiene bloques. El contrato existente del detalle se conserva.

La ocupación de la misma sala por **otras secciones** corresponde a GES-11. Esta tarjeta registra el día, intervalo y sala para permitir implementar ese aviso después.

## Datos y migración

`1792510000000-CrearHorarioSeccion` crea `horario_seccion`, con clave primaria `pk_horario_seccion`, FK compuesta hacia la sección de la misma universidad, restricciones para días, horas y sala, índice único para inicios activos y RLS. Solo el Administrativo de esa universidad puede insertar o actualizar; el Director tiene lectura consolidada. La API no recibe DELETE.

La migración agrega también `seccion.horario_version` para detectar ediciones concurrentes. Su reversión quita la tabla y esa columna. No modifica migraciones ya integradas.

## Verificación

Desde la raíz, con Node 24.15+, PostgreSQL y las dependencias instaladas:

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

Las pruebas cubren varios bloques, modificación, quitar el último, persistencia, resumen en el detalle, asignación de profesor sin perder el horario, rechazo de superposiciones, validación de los campos, permisos, aislamiento entre universidades y facultades, secciones/cursos archivados, ediciones simultáneas y versiones antiguas. Una falla de escritura simulada después del archivado comprueba el rollback del conjunto completo. También se comprueban migraciones, RLS y la FK compuesta.

En la interfaz se verifica el guardado, edición, eliminación de bloques, cancelación, bloqueo mientras se envía, error y reintento, conflicto y recarga, y lectura del Director.

## Revisión manual

1. Ejecutar las migraciones y el seed. Ingresar con el Administrativo de Ingeniería de Norte.
2. Abrir Gestión académica, un curso y **Asignar horario** en la sección 1.
3. Agregar lunes 08:30–09:20, Sala 201, y miércoles 10:00–11:30, Laboratorio A. Guardar.
4. Confirmar el resumen en esa sección y que se conserva al recargar. Revisar que las otras secciones no cambian.
5. Abrir **Editar horario**, modificar la sala de un bloque y quitar el otro. Guardar y comprobar el resultado.
6. Quitar el bloque restante y guardar: debe aparecer **Sin asignar**. Cancelar una edición diferente y confirmar que no se guarda.
7. Con el editor abierto en dos pestañas, guardar en una y luego en la otra: la segunda debe mostrar un conflicto y exigir recargar.
8. Entrar como Director y comprobar que ve el horario sin acciones de edición. Revisar también el diálogo en móvil.
