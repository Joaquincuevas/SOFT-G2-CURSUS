# UI/UX-06 · Profesor y ayudante

Los dashboards muestran las secciones asignadas del período activo. El profesor tiene un bloque **Por revisar** con el número de evaluaciones enviadas por ayudantes y acceso a la lista. El backend del dashboard entrega ese número. Los pendientes de ingreso de notas y de subida de material requieren datos adicionales.

## Cómo revisar con el seed local

1. Aplica las migraciones, ejecuta el seed y levanta el frontend, la API y el servicio `s3` de Compose. Usa las dos cuentas de Norte con la contraseña del seed.
2. Inicia sesión como `matias.munoz@norte.cursus.test`. En el dashboard comprueba las tarjetas, horarios, número de alumnos y acceso a la sección. Abre **ICC101 · sección 2** y crea una evaluación de prueba.
3. En otra sesión, entra como `vicente.silva@norte.cursus.test`. Abre la misma sección. En **Notas** comprueba el aviso de que las evaluaciones son de solo lectura. Abre la evaluación, completa las notas, guarda el borrador y confirma el envío. Verifica el bloqueo de los campos después de enviarlas.
4. Vuelve al dashboard de Matías. Abre **Ver pendientes**, selecciona la evaluación y comprueba la confirmación de **Aprobar y publicar**. Usa solamente datos de la base local.
5. En **Material**, con Matías elige un archivo con **Seleccionar archivo**, indica categoría y título y súbelo. Verifica el listado, la opción de descargar y el control de nuevas versiones. Con Vicente comprueba el aviso de solo lectura y descarga el archivo. Los controles de publicación y versionado están disponibles para el profesor.
6. En **Integrantes**, Matías ve la lista de alumnos inscritos en modo lectura. Vicente ve el equipo docente con un aviso de solo lectura. La administración de altas y bajas sigue protegida por el permiso de edición de sección.
7. Repite el recorrido a **1280 px** y **375 px**. Verifica también los estados de carga y vacío con una sección de prueba y la red limitada de DevTools.

## Capturas con cuentas del seed

| Vista                        | 1280 px                                                       | 375 px                                                  |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Dashboard de Matías          | [Escritorio](evidencias/uix-06-profesor-dashboard-1280.png)   | [Móvil](evidencias/uix-06-profesor-dashboard-375.png)   |
| Dashboard de Vicente         | [Escritorio](evidencias/uix-06-ayudante-dashboard-1280.png)   | [Móvil](evidencias/uix-06-ayudante-dashboard-375.png)   |
| Notas del profesor           | [Escritorio](evidencias/uix-06-profesor-notas-1280.png)       | [Móvil](evidencias/uix-06-profesor-notas-375.png)       |
| Notas del ayudante           | [Escritorio](evidencias/uix-06-ayudante-notas-1280.png)       | [Móvil](evidencias/uix-06-ayudante-notas-375.png)       |
| Material del profesor        | [Escritorio](evidencias/uix-06-profesor-material-1280.png)    | [Móvil](evidencias/uix-06-profesor-material-375.png)    |
| Material del ayudante        | [Escritorio](evidencias/uix-06-ayudante-material-1280.png)    | [Móvil](evidencias/uix-06-ayudante-material-375.png)    |
| Integrantes para el profesor | [Escritorio](evidencias/uix-06-profesor-integrantes-1280.png) | [Móvil](evidencias/uix-06-profesor-integrantes-375.png) |
| Integrantes para el ayudante | [Escritorio](evidencias/uix-06-ayudante-integrantes-1280.png) | [Móvil](evidencias/uix-06-ayudante-integrantes-375.png) |
