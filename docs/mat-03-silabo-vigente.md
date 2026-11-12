# MAT-03 · Alumno ve el sílabo del curso

Referencia RN-07. El PDF y sus versiones provienen de MAT-02. [Tarjeta Trello](https://trello.com/c/dSlVlo9K/132-f4-mat-03-alumno-ve-el-s%C3%ADlabo-del-curso).

En **Mis Cursos → sección**, la tarjeta **Sílabo del curso** aparece antes de las pestañas. Muestra la versión vigente con un botón de descarga del PDF. Cuando todavía no se ha publicado, aparece un mensaje en su lugar.

La API consulta la tabla `silabo` de MAT-02 y elige la versión más reciente vinculada a un PDF confirmado del curso. Una sección puede consultar la versión publicada desde otra sección del mismo curso. La consulta fija el usuario de sesión para la RLS y comprueba su pertenencia a la sección solicitada. La URL temporal apunta a la versión del objeto de S3 que MAT-02 fijó al publicar.

## Revisión

1. Con MAT-02 integrado, publicar dos versiones desde el perfil de profesor. Entrar como alumno de la sección y comprobar que la tarjeta destaca y descarga la segunda.
2. Como integrante de otra sección del mismo curso, comprobar que la versión coincide. Abrir un curso sin sílabo y comprobar el mensaje de estado vacío.
3. Probar la URL de la API con un alumno ajeno a la sección solicitada y con un Director. MAT-03 debe denegar el acceso. Como Director, comprobar también que MAT-02 y las rutas de descarga de MAT-01 y MAT-06 no entregan el PDF publicado como sílabo.

```sh
npm run test --workspace=frontend -- src/pages/VistaSeccion.test.tsx
npm run test:db --workspace=backend -- test/archivos/archivos.db-spec.ts
```

La prueba de integración aplica las migraciones reales, confirma los archivos con MAT-01, publica dos versiones con MAT-02 y consulta y descarga la vigente con MAT-03. Usa un doble de S3 para verificar el identificador de versión que se firma. [PR de MAT-02](https://github.com/Joaquincuevas/SOFT-G2-CURSUS/pull/112).

Capturas con datos simulados. [Sílabo vigente](evidencias/mat-03-silabo-vigente.png) · [Curso sin sílabo](evidencias/mat-03-silabo-vacio.png).
