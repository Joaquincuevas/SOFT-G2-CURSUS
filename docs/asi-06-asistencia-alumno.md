# ASI-06 · El alumno ve su asistencia por curso

[Tarjeta Trello](https://trello.com/c/FusfXQrE/149-f4-asi-06-alumno-ve-su-asistencia-por-curso). RN-13; depende de ASI-02 y amplía la lectura mínima que incorporó ASI-04.

## Comportamiento

Desde Dashboard o Mis Cursos, el alumno abre su sección y la pestaña **Asistencia**. Ve cada marca propia vigente con fecha, bloque y Presente/Ausente, de fecha más reciente a más antigua; en un mismo día, el bloque más reciente primero. El contexto del curso y la sección permanece visible.

El backend devuelve el porcentaje **por sección**, redondeado a dos decimales, junto con la fracción de clases asistidas y registradas y **N clases sin marca**. No combina las secciones de un curso ni distintos períodos. Por ejemplo: dos presentes y un ausente → **66,67 %**, **2 de 3**. Sin clases con asistencia registrada en la sección devuelve `null`, presentado como **Sin registros**. Si existen clases registradas pero ninguna marca propia, muestra **0 %** y el número de clases sin marca. El navegador solo aplica formato al número recibido.

**Cálculo compartido con ASI-05:** `100 × presentes propios / clases activas con asistencia registrada en la sección`. Una clase se cuenta una sola vez si tiene al menos una marca activa de cualquier alumno. Las clases pendientes o archivadas no cuentan. `sinMarca = total de clases registradas − marcas propias activas`. Con 10 clases registradas y 8 presentes propios, profesor y alumno ven **80 %**, **8 de 10** y **2 clases sin marca**. Las clases sin marca entran en el denominador pero no se inventan filas Ausente: se informan por separado, también para incorporaciones tardías. La función SQL de conteo y la expresión de redondeo son comunes a ambas vistas.

**Actualizar asistencia** vuelve a consultar las marcas y el porcentaje; también se consultan al volver a abrir la pestaña. Así se reciben guardados y correcciones de ASI-02/ASI-04 sin persistir un porcentaje derivado. No hay sincronización automática entre navegadores. Carga, error y reintento conservan los estados del sistema. Ante un error de recarga se retira la tabla hasta un reintento exitoso. Cambiar de sección remonta la vista para no conservar datos del curso anterior.

## API y aislamiento

`GET /api/espacio/secciones/:id/mi-asistencia/resumen` → `ResumenAsistenciaPropia`:

```json
{
  "clases": [
    {
      "clase": {
        "id": "uuid",
        "fecha": "2026-09-14",
        "inicio": "08:30",
        "termino": "10:00",
        "sala": "ING-101"
      },
      "presente": true
    }
  ],
  "registradas": 1,
  "asistidas": 1,
  "sinMarca": 0,
  "porcentaje": 100
}
```

Requiere sesión, rol ALUMNO y pertenencia activa a la sección. El guard de ESP-06 verifica acceso; el servicio comprueba el rol de sesión y de sección, y SQL revalida inscripción y usuario/curso/sección/clase activos. Universidad e identidad salen de la sesión, no de parámetros de consulta. Los JOIN incluyen universidad. Una sola sentencia SQL combina el listado y los presentes propios con el conteo agregado de la sección para producir lista, contadores y porcentaje en el mismo snapshot. El `numeric` redondeado se convierte a `double precision` para entregar un número JSON.

Se conserva RLS de ASI-04: `app.asistencia_alumno_id` se fija desde la sesión en la transacción y se combina con universidad/rol. El alumno no recibe nombres, correos, marcas ajenas, responsable, motivos ni historial de correcciones. Los endpoints completos del profesor continúan denegados. Sin sesión: 401; sección mal formada: 400; sin acceso: 403; sección/curso archivados o sección de otra universidad: 404, según ESP-06.

El GET anterior `/mi-asistencia` sigue devolviendo `AsistenciaPropia[]` por compatibilidad con ASI-04: comparte el filtro de marcas propias, pero consulta solo el listado, sin calcular agregados. El frontend usa `/mi-asistencia/resumen`.

## Migración y conteo seguro

Aplicar `1792720000000-ContarClasesAsistencia` antes de iniciar el backend actualizado (`npm run migration:run --workspace=backend`). No modifica marcas, datos existentes ni la política RLS. El timestamp se comprobó contra develop y las migraciones de los PR abiertos.

`public.total_clases_asistencia(seccion uuid)` devuelve exclusivamente un entero. Usa `SECURITY DEFINER` para contar también clases sin marca propia sin abrir al alumno la lectura de las marcas ajenas. Es `STABLE`, por lo que el conteo y el listado pertenecen al mismo snapshot de la sentencia. Tiene `search_path = pg_catalog`, tablas y funciones del sistema de contexto calificadas con `public`, sin SQL dinámico. Se revoca EXECUTE de PUBLIC y solo se concede a `cursus_app`.

La función filtra universidad de sesión y clase/sección/curso activos. Para ALUMNO exige además identidad fijada desde sesión, usuario activo y una inscripción vigente en la sección. Sin contexto, con otra universidad, rol distinto de ALUMNO/PROFESOR o sin inscripción, devuelve 0. Para PROFESOR mantiene el alcance de lectura institucional existente; el guard y el servicio siguen exigiendo que sea el profesor vigente de esa sección antes de devolver el resumen. Esta función no reemplaza los controles de acceso de los endpoints ni devuelve ids de clase, marcas o identidades de compañeros.

`down` elimina únicamente la función. Para revertir funcionalmente, desplegar también la versión anterior del backend; los datos y la RLS quedan intactos. La prueba de esquema revierte y vuelve a aplicar toda la cadena.

## Pruebas automatizadas

Desde la raíz, con dependencias instaladas y PostgreSQL disponible (`docker compose up -d postgres`):

```sh
npm run build
npm run lint
npm run format:check
npm run test --workspace=frontend -- --maxWorkers=1
npm run test --workspace=backend
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
```

Focales:

```sh
npm run test --workspace=frontend -- src/pages/MiAsistencia.test.tsx src/pages/AsistenciaDeClase.test.tsx --maxWorkers=1
npm run test:db --workspace=backend -- test/asistencia/asistencia.db-spec.ts
```

La suite DB cubre ausencia de registros, 0/66,67/100 %, orden por fecha/bloque, clases pendientes, archivo, inscripción retirada, guardado/corrección mediante HTTP real, ids manipulados y aislamiento de sección/universidad/rol. La regresión consulta ambos endpoints con 10 clases, 8 presentes y 2 sin marca y exige 80 % en ambos; después retira todas las marcas propias y verifica 0 %, 10 sin marca y listado vacío. También invoca el conteo bajo el rol real de la API para comprobar universidad, identidad, inscripción y roles, denegación de EXECUTE a PUBLIC y que SELECT de asistencia siga devolviendo solo la marca propia. Conserva los tests directos de RLS de ASI-04. Frontend verifica el contador sin marca separado de Ausente, fracción, formato, porcentaje recibido, estados vacíos/error/reintento, Actualizar y reapertura.

## Pasos para el compañero que revisa

1. Usar un entorno de pruebas con un curso del período activo, sección con profesor y dos alumnos inscritos. Preparar tres clases distintas y una cuarta pendiente con ASI-01. Anotar las cuentas de los alumnos; no usar datos reales.
2. Como profesor, guardar para el alumno A dos Presente y un Ausente; para B usar marcas distintas. Mantener la cuarta sin guardar.
3. Iniciar sesión como A. Dashboard → tarjeta del curso → Asistencia. Esperar tres filas propias en orden descendente, sus bloques y marcas, **66,67 %** y **2 de 3**. La clase pendiente no aparece. No debe haber nombres/marcas de B ni acciones de corrección/historial.
4. Como profesor en otro navegador, corregir el Ausente de A a Presente con motivo. Como A, pulsar Actualizar asistencia: tres presentes, **100 %**, **3 de 3**. No aparece el motivo. También se actualiza al salir de la pestaña y volver.
5. Abrir otro curso inscrito sin marcas. Esperar **Sin registros**, **0 de 0** y mensaje vacío; no quedan marcas del curso anterior. Para un curso con una única marca Ausente, esperar **0 %**.
6. En Red, repetir el GET propio agregando `?alumnoId=<B>&universidadId=<otra>`: sigue entregando solo A. Cambiar el id de sección a una sin inscripción debe negar acceso; a otra universidad, 404. Como A no se puede consultar la lista completa del profesor ni historial. Una sesión cerrada responde 401.
7. Retirar la inscripción de A en el entorno de pruebas y reintentar: acceso denegado. Simular un error de red: mensaje y Reintentar; al recuperar la conexión vuelve a cargar. Revisar consola sin errores no manejados.
8. Para el caso bloqueante: registrar dos clases para B antes de inscribir a A; inscribir a A y registrar otras ocho como Presente para A. Abrir el resumen del profesor y Asistencia de A: ambos deben mostrar **80 %**, **8 de 10** y **2 clases sin marca**. El alumno ve únicamente sus ocho filas. Una clase adicional pendiente no altera el cálculo. Si se archivan todas las marcas de una clase, deja de contar para ambos.

## Evidencia local

La revisión del denominador se verifica con las suites de asistencia (ASI-02/04/05/06) y de reversión completa de migraciones, además del CI del PR. Los resultados de la revisión se registran en la descripción del PR.

Capturas con Nest y PostgreSQL reales en una base temporal aislada, datos simulados, sesión de alumno. Diez clases con asistencia registrada, ocho presentes propios, dos sin marca propia y una pendiente en ICC101; ICC201 sin registros. Se verificó Actualizar y navegación entre cursos. La base temporal se elimina al terminar.

![Ocho presentes de diez clases, 80 % y dos sin marca](evidencias/asi-06-marcas.png)

![Otro curso sin registros](evidencias/asi-06-sin-registros.png)
