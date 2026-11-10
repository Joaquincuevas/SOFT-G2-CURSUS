# MAT-03 · Alumno ve el sílabo del curso

Referencia RN-07. El PDF y sus versiones provienen de MAT-02. [Tarjeta Trello](https://trello.com/c/dSlVlo9K/132-f4-mat-03-alumno-ve-el-s%C3%ADlabo-del-curso).

En **Mis Cursos → sección**, la tarjeta **Sílabo del curso** aparece antes de las pestañas. Muestra la versión vigente con un botón de descarga del PDF. Cuando todavía no se ha publicado, aparece un mensaje en su lugar.

La API consulta la versión más reciente vinculada a un PDF confirmado de MAT-01 para el curso. Una sección puede consultar la versión publicada desde otra sección del mismo curso. Tanto la consulta como la descarga comprueban que el usuario pertenece a la sección desde la que accede. Al descargar, la API vuelve a consultar la versión vigente y firma una URL temporal del bucket privado.

## Revisión

1. Con MAT-02 integrado, publicar dos versiones desde el perfil de profesor. Entrar como alumno de la sección y comprobar que la tarjeta destaca y descarga la segunda.
2. Como integrante de otra sección del mismo curso, comprobar que la versión coincide. Abrir un curso sin sílabo y comprobar el mensaje de estado vacío.
3. Probar la URL de la API con un alumno de otra sección y con un Director. La ruta de MAT-03 debe denegar el acceso. Verificar en la integración que las rutas de MAT-02 y la descarga de un archivo de MAT-01 vinculado al sílabo apliquen la misma regla.

```sh
npm run test --workspace=frontend -- src/pages/VistaSeccion.test.tsx
npm run test:db --workspace=backend -- test/archivos/archivos.db-spec.ts
```

La suite usa subidas confirmadas de MAT-01 y datos de prueba para el vínculo por `silabo.archivo_id` mientras MAT-02 esté en revisión. Queda pendiente verificar la publicación y descarga con la migración y el flujo definitivos de MAT-02. [PR de MAT-02](https://github.com/Joaquincuevas/SOFT-G2-CURSUS/pull/105).

Capturas con datos simulados. [Sílabo vigente](evidencias/mat-03-silabo-vigente.png) · [Curso sin sílabo](evidencias/mat-03-silabo-vacio.png).
