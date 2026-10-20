# GES-06: código de curso único por período

Tarjeta: [GES-06](https://trello.com/c/5bqwYaok). Referencia: RN-04. Depende de GES-05.

## Comportamiento

Un administrativo no puede guardar dos cursos con el mismo código en un mismo período de su universidad. El mismo código sí se puede usar en otro período o en otra universidad.

El código se compara sin distinguir mayúsculas ni espacios al inicio o al final: `icc101`, `ICC101` e `Icc101` son el mismo código. Un curso archivado sigue ocupando su código en el período, porque nada se elimina.

Al crear un curso con un código repetido, la API responde 409 con `Ya existe un curso con el código ICC101 en el período 2026-2`. El formulario muestra ese mensaje, conserva lo escrito y no guarda nada. Este comportamiento llegó con GES-05; esta tarjeta lo extiende a la base de datos.

## Restricción en la base de datos

La migración `CodigoCursoUnicoNormalizado` agrega el índice único `ux_curso_periodo_codigo_normalizado` sobre `(periodo_id, upper(btrim(codigo)))`.

La restricción original `uq_curso_codigo_periodo` de `CrearCurso` se mantiene, pero compara el código tal cual: solo la API lo normaliza (`CrearCursoDto` lo guarda sin espacios y en mayúsculas). El índice nuevo aplica la misma regla a cualquier escritura, aunque no pase por la API, y tanto a `INSERT` como a `UPDATE`.

La migración solo agrega un índice, así que es compatible hacia atrás. Si ya existieran cursos duplicados en un entorno, falla sin modificar ni eliminar datos.

## Edición de cursos (GES-07)

La edición de cursos todavía no existe: queda para GES-07. Esta tarjeta deja la regla protegida en la base para cuando llegue: un `UPDATE` que repite el código en el período, o que mueve el curso a un período donde su código ya existe, falla con el error 23505. El endpoint de GES-07 debe convertir ese error en un 409, como lo hace `GestionService.crearCurso`.

## Preparación

Desde la raíz del repositorio:

```bash
git fetch origin
git switch feature/gestion-codigo-curso-unico
npm ci
docker compose up -d --wait
npm run migration:run --workspace=backend
npm run seed --workspace=backend
# En dos terminales:
npm run dev:back
npm run dev:front
```

## Pasos para el reviewer

1. Ingresar con `administrativo.ingenieria@norte.cursus.test` y la contraseña `SEED_PASSWORD` de `.env`. Abrir Cursos → Crear curso.
2. Crear un curso con código `GES601` en el período activo. Esperar el mensaje de éxito.
3. Crear otro con código `ges601` en el mismo período. Esperar el error 409 en el formulario, con lo escrito conservado.
4. Crear un período nuevo en Períodos (por ejemplo 2039-1), volver a Crear curso y usar `GES601` en ese período. Debe crearse.
5. Comprobar la base directamente, como dueño de las tablas:

   ```bash
   docker compose exec postgres psql -U cursus -d cursus
   ```

   ```sql
   INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
   SELECT universidad_id, carrera_id, periodo_id, ' ges601', 'Duplicado'
     FROM curso WHERE codigo = 'GES601' LIMIT 1;
   ```

   Debe fallar con `duplicate key value violates unique constraint "ux_curso_periodo_codigo_normalizado"`.

## Pruebas automáticas

```bash
npm run lint
npm test
npm run test:db --workspace=backend
npm run test:e2e --workspace=backend
npm run build
```

`backend/test/gestion/codigo-curso.db-spec.ts` usa PostgreSQL real en una base propia, creada y eliminada al terminar. Cubre:

- el mismo código en otro período desde la API (201) y repetido en el mismo período (409);
- `INSERT` directos repetidos, en minúsculas o con espacios, rechazados por la base;
- el mismo código en otro período permitido por la base;
- `UPDATE` que repite el código o mueve el curso a un período donde el código ya existe, rechazados;
- un curso archivado que sigue ocupando su código.

El 409 al crear, con mayúsculas distintas, sigue cubierto en `crear-curso.db-spec.ts`, y el mensaje del formulario en `frontend/src/pages/Cursos.test.tsx`. `esquema-inicial.db-spec.ts` revierte también la migración nueva.
