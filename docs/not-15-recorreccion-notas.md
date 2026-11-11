# NOT-15: recorrección de una nota publicada

[Tarjeta Trello](https://trello.com/c/flCOpPwl/128-f4-not-15-profesor-registra-una-recorrecci%C3%B3n-con-la-nota-nueva-y-el-motivo). Referencias: RN-12 y RE-05. Depende de NOT-11 y de la vista del alumno de NOT-13 (#100), ambas integradas en `develop`.

Como profesor, quiero registrar una recorrección indicando la nota nueva y el motivo, para corregir una nota ya publicada de forma trazable.

## Comportamiento

En **Mis cursos → sección → Notas → Ver notas**, el profesor consulta las notas de la evaluación. En una evaluación aprobada, cada alumno con una nota publicada tiene **Recorregir**. El formulario muestra la nota publicada y pide la nota nueva y el motivo obligatorio.

- La nota va de 1,0 a 7,0, con a lo más un decimal. La interfaz acepta coma o punto. Debe ser distinta de la publicada.
- El motivo admite entre 1 y 500 caracteres después de quitar los espacios de los extremos; se cuentan caracteres Unicode, como PostgreSQL. Admite saltos de línea y tabuladores.
- **Guardar recorrección** actualiza la nota y deja el evento de auditoría en una transacción. El estado sigue siendo `PUBLICADA` y la evaluación sigue `APROBADA`; no vuelve al ayudante.
- **Cancelar** y Escape cierran sin enviar. Durante el guardado quedan bloqueados junto con los campos, para no dar por cancelada una petición que ya se está procesando.
- Un fallo conserva la nota escrita y el motivo. Si otra pestaña ya cambió la nota, se informa el conflicto y se exige **Recargar notas** antes de intentar otra corrección.
- El alumno ve el nuevo valor de su nota y la marca **Recorregida**. No recibe el motivo ni el historial de otros alumnos.

Puede recorregir cualquier profesor vigente de la sección, incluidos los profesores adicionales de GES-25. El ayudante sigue sin poder modificar las publicadas ni usar este formulario. El alumno, el Administrativo, el superadmin y el Director tampoco recorregirán desde este endpoint. El PUT de propuestas y el envío a revisión siguen reservados al ayudante.

## API

`POST /api/espacio/secciones/:id/evaluaciones/:evaluacionId/notas/:alumnoId/recorreccion`

```json
{
  "notaAnterior": 5.5,
  "notaNueva": 6.2,
  "motivo": "Se reconoció el procedimiento de la pregunta 3."
}
```

`notaAnterior` es el valor que el profesor vio al abrir el formulario. El servidor lo compara con la nota actual; la auditoría siempre toma el valor anterior de la base, nunca lo usa sin verificar.

| Resultado              | Cuándo                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200, `NotasEvaluacion` | Nota y evento confirmados. La fila devuelve el nuevo valor y `recorregida: true`.                                               |
| 400                    | Falta el motivo, excede su largo, tiene caracteres de control no permitidos, nota inválida o nota nueva idéntica.               |
| 401                    | Sin sesión.                                                                                                                     |
| 403                    | No es el profesor actual de la sección.                                                                                         |
| 404                    | La evaluación, sección, curso o nota no existen o están archivados; alumno sin inscripción activa; recurso de otra universidad. |
| 409                    | La nota aún no está publicada, cambió desde que se abrió el formulario, o no pudo modificarse.                                  |

El conflicto por una nota cambiada también devuelve `notaActual`. Cada consulta de notas de una evaluación incluye `recorregida` en sus alumnos; `false` en notas sin recorrección o aún inexistentes.

`GET /api/espacio/secciones/:id/mis-notas` incluye también `recorregida: boolean` en cada `NotaPropia`. Devuelve el nuevo valor y `true` para una nota publicada corregida, y `false` si no tiene recorrección o todavía no se publicó. En **Mis notas**, el alumno ve **Recorregida** junto al valor nuevo. No se amplían sus permisos sobre notas ajenas ni sobre `nota_cambio`.

## Datos y permisos

`1792820000000-RecorregirNota` agrega `nota.recorreccion_id`, una FK compuesta por universidad al último evento de `nota_cambio`. La marca se calcula con `recorreccion_id IS NOT NULL`. La nota mantiene su identidad y su estado publicado.

La migración se registra después de `LeerNotasAlumno` (`1792810000000`) y de GES-25, cuyo helper `es_profesor_de_seccion` usa la política `pol_nota_recorreccion`. Permite modificar una publicada activa solo a profesores vigentes de esa sección, con `usuario_actual()` fijado dentro de la transacción. CASL habilita `update Nota` al profesor; cada controlador conserva la distinción entre ingresar propuestas, enviar y recorregir.

El servicio usa el mismo advisory lock por evaluación que guardar, enviar y revisar notas. Verifica otra vez al profesor y mantiene bloqueada la sección durante la operación, además de la inscripción activa del alumno. Una nota modificada desde otra pestaña responde 409 en lugar de sobrescribirla.

La transacción añade un evento `RECORRECCION` con el alumno, la nota anterior real, la nueva, el motivo, la fecha del servidor y el profesor de sesión. El trigger valida que el evento al que apunta la nota corresponda a esos mismos valores y responsable. Un fallo del UPDATE revierte también el evento. La auditoría existente sigue siendo de solo adición.

`down()` retira la política, el trigger, la función y el enlace. Conserva los valores de las notas y todos los eventos de auditoría.

## Verificación

Con Node 24.15+ y PostgreSQL local:

```sh
npm run build --workspace=shared
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run lint
npm run build
```

Los tests de recorrección verifican valores y motivo, escala, Unicode, roles, pertenencia, recursos archivados, concurrencia, RLS y reversión ante fallos. También comprueban que el alumno recibe la nota nueva y su marca sin acceso a la auditoría, y que un segundo profesor puede corregir y pierde el permiso al retirarse. La interfaz cubre la marca del alumno, el formulario, errores y reintento, conflicto y recarga, y Cancelar/Escape antes y durante el envío. La prueba de migraciones revierte NOT-15 antes de NOT-13, NOT-03 y GES-25, también después de reaplicar las migraciones.

## Evidencia de navegador

Datos simulados de la facultad de Norte en una base local aislada: nota publicada 5,5, recorrección a 6,2 con motivo, comprobación de ambas notas y el profesor en PostgreSQL. Sin errores JavaScript y sin desbordamiento horizontal de la página en móvil.

- [Formulario del profesor](evidencias/not-15-formulario.png).
- [Nota guardada y marca de recorrección](evidencias/not-15-guardada.png).
- [Formulario móvil](evidencias/not-15-movil.png).

La verificación final sobre la integración con NOT-13 usa Node 24.15 y PostgreSQL: 575 pruebas de frontend, 530 unitarias del backend, 362 de API y 1596 de base de datos; lint, formato y build correctos. Contra la API local compilada se comprobó la lectura del alumno antes y después de corregir (5,5 → 6,2), la marca y el historial del profesor. La captura visual final de la vista del alumno queda pendiente: el control del navegador no estuvo disponible en esta sesión.
