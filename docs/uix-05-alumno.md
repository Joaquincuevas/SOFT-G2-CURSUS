# UI/UX-05 · Experiencia del alumno

El dashboard usa las inscripciones del período activo. Cada tarjeta muestra el curso, la sección, su horario, los profesores y los anuncios nuevos. El enlace de historial abre las notas de períodos anteriores.

El endpoint `GET /api/dashboard/secciones-alumno` entrega las secciones y sus anuncios nuevos. Las fechas de evaluación se consultan por sección en Mis notas. El dashboard omite «Por hacer» hasta disponer de próximas evaluaciones en una respuesta para el dashboard.

Dentro del curso, Mis notas muestra la nota final o parcial y las evaluaciones en una tabla con desplazamiento local cuando la pantalla es angosta. Material agrupa los archivos y mantiene las descargas de material y de las versiones del sílabo. Integrantes muestra el equipo docente con el resumen de la sección. El listado de alumnos inscritos se conserva en la vista del profesor.

## Cómo revisar

1. Ejecuta las migraciones y el seed en la base local según el README. Ingresa como `antonia.araya@norte.cursus.test` con la contraseña del seed. Verifica que aparezcan las cinco secciones de Antonia y que al seleccionar cualquiera se abra la sección correspondiente.
2. En el curso, abre **Notas**, **Material** e **Integrantes**. En una sección con datos, comprueba las notas publicadas, el estado **Sin publicar**, los metadatos de cada archivo y su descarga. En una sección sin datos, revisa que se indique qué aparecerá ahí. Con la red limitada desde DevTools, comprueba los skeletons mientras cargan los datos.
3. Repite la navegación en 1280 y 375 px. La página debe caber en el viewport. Si la tabla de notas necesita más ancho, el desplazamiento se limita a la tabla.
4. Usa una cuenta de prueba marcada como egresada según HIS-06. Inicia sesión y comprueba que se abre **Historial de notas** y que es el único enlace de navegación principal. Repite abriendo el menú móvil.

## Capturas en Chrome con el seed local

| Vista                                     | 1280 px                                              | 375 px                                           |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Dashboard de Antonia                      | [Escritorio](evidencias/uix-05-dashboard-1280.png)   | [Móvil](evidencias/uix-05-dashboard-375.png)     |
| Notas                                     | [Escritorio](evidencias/uix-05-notas-1280.png)       | [Móvil](evidencias/uix-05-notas-375.png)         |
| Material                                  | [Escritorio](evidencias/uix-05-material-1280.png)    | [Móvil](evidencias/uix-05-material-375.png)      |
| Integrantes                               | [Escritorio](evidencias/uix-05-integrantes-1280.png) | [Móvil](evidencias/uix-05-integrantes-375.png)   |
| Navegación de una cuenta egresada de demo | [Escritorio](evidencias/uix-05-egresado-1280.png)    | [Menú móvil](evidencias/uix-05-egresado-375.png) |

Las capturas de Notas y Material a 1280 px muestran una evaluación y una guía de demo agregadas a la primera sección del seed de Antonia.
