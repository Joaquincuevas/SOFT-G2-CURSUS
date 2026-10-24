# ESP-06: solo los integrantes de una sección acceden a ella

Tarjeta: [F3 · ESP-06 Solo los integrantes de una sección pueden acceder a ella](https://trello.com/c/r2nusqlm/173-f3-esp-06-solo-los-integrantes-de-una-secci%C3%B3n-pueden-acceder-a-ella). Referencia: RE-01. Sin dependencias dentro de la fase.

## Comportamiento

El espacio de una sección es la parte de la plataforma que usan sus integrantes. ESP-04 le agrega horario, sala y equipo docente; ESP-05, la lista de alumnos; y la Fase 4, notas, material, anuncios y asistencia. Esta historia agrega el control de acceso que comparten todas esas rutas y un primer endpoint con los datos básicos de la sección.

Pueden entrar a una sección:

| Quién                                      | Resultado | Rol en la respuesta |
| ------------------------------------------ | --------- | ------------------- |
| Su profesor a cargo                        | 200       | `PROFESOR`          |
| Un ayudante con asignación activa          | 200       | `AYUDANTE`          |
| Un alumno con inscripción activa           | 200       | `ALUMNO`            |
| El Administrativo de la facultad del curso | 200       | `ADMINISTRATIVO`    |
| El Director, de cualquier universidad      | 200       | `DIRECTOR`          |

Cualquier otro usuario de la misma universidad recibe **403**: otro profesor, un alumno no inscrito, un ayudante o alumno cuya asignación o inscripción fue archivada, o el Administrativo de otra facultad.

La respuesta es **404** si la sección no existe, si ella o su curso están archivados, o si es de otra universidad (salvo para el Director). El Director también recibe 404 si la sección o su curso están archivados.

## 403 en el espacio y 404 en gestión

Para una sección ajena, los endpoints de gestión (`/api/secciones/:id/...`, GES-*) responden **404** y el de espacio responde **403**. Es intencional:

- **Gestión** es del Administrativo y se limita a su facultad. Una sección de otra facultad queda fuera de su alcance y no tiene por qué saber si existe, así que gestión la trata igual que una inexistente (404). Así tampoco se puede usar gestión para averiguar qué ids existen.
- **Espacio** lo usan los integrantes. La tarjeta pide que un usuario de la misma universidad que no pertenece a la sección reciba 403: la sección existe en su universidad, pero no tiene permiso para entrar. Para un usuario de otra universidad, el espacio responde 404, igual que gestión, porque el aislamiento por universidad no deja distinguir si la sección existe.

Por eso el Administrativo de otra facultad recibe 403 en el espacio, por la regla de la tarjeta, y 404 en gestión.

## API y datos

- `GET /api/espacio/secciones/:id` devuelve `SeccionEspacio` (`@cursus/shared`):

  ```ts
  { id, numero, curso: { id, codigo, nombre }, periodo: { id, anio, semestre }, rol }
  ```

  `rol` es el rol con el que el usuario entra a la sección. ESP-04 lo usa para mostrar solo las acciones de cada rol.

- Respuestas: 400 si el id no es un UUID, 401 sin sesión, 403 si no es integrante y 404 en los casos anteriores.
- La ruta exige `@Puede('read', 'Seccion')` y `@IntegranteDeSeccion()`. El guard (`IntegranteSeccionGuard`) corre después de los guards globales, resuelve la sección del parámetro `:id` y la deja en la petición (`@SeccionActual()`), así que el handler no vuelve a consultarla. Las rutas que se agreguen al espacio llevan los mismos dos decoradores.
- Profesor, Ayudante y Alumno reciben `read` sobre `Seccion` en `shared/src/permisos.ts`. Ese permiso no les abre ningún endpoint de gestión, que exigen `update Seccion`, `read Inscripcion` o `read Curso`. Un test recorre todos los handlers de gestión y lo verifica.

El control de pertenencia va en la aplicación. RLS sigue aislando por universidad, sin cambios en sus políticas, y no hay migración. Las consultas del espacio usan `consultarEnUniversidad` ($1 = universidad, con RLS). El Director usa `consultarEnTodasLasUniversidades`, en una transacción `READ ONLY` (ADR 0001), también para secciones de otra universidad.

Solo se leen datos: nada se crea, modifica ni archiva.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

`test/espacio/acceso-seccion.db-spec.ts` cubre:

- Los tres casos de la tarjeta: alumno inscrito (200), alumno no inscrito (403) y profesor de otra sección (403).
- 200 para el profesor, el ayudante y el Administrativo de la facultad.
- 403 para una asignación o inscripción archivada, un alumno o ayudante de otra sección y el Administrativo de otra facultad.
- 404 para otra universidad y para una sección inexistente, archivada o de un curso archivado.
- Director: dentro de la transacción que lee la sección, el test ejecuta `SHOW transaction_read_only` y comprueba que vale `on`, en su universidad y en otra. Con un integrante vale `off`, así que la verificación distingue los dos casos.

`test/espacio/acceso-seccion.e2e-spec.ts` comprueba que Profesor, Ayudante y Alumno no tienen el permiso de ningún handler de gestión, y que los GET de gestión de secciones y cursos les responden 403. También cubre 401 y 400. `src/auth/permisos.spec.ts` incluye `read Seccion` en la matriz.

## Revisión en local

1. Ejecutar las migraciones (`npm run migration:run --workspace=backend`) y el seed de facultad completa (`npm run seed --workspace=backend`). Levantar el backend.
2. Iniciar sesión con un profesor de la Facultad de Ingeniería de Norte que tenga secciones (seed GES-20), con la contraseña `SEED_PASSWORD` del `.env`. `GET /api/espacio/secciones/<id de una de sus secciones>` con su token debe responder 200 con `rol: "PROFESOR"`.
3. Con el mismo token, pedir una sección de otro profesor: 403.
4. Repetir con un alumno inscrito (200, `rol: "ALUMNO"`) y con uno no inscrito (403).
5. Con `administrativo.economia@norte.cursus.test`, pedir una sección de Ingeniería: 403. En gestión, `GET /api/secciones/<id>/alumnos` responde 404.
6. Con `director@sur.cursus.test`, pedir una sección de Norte: 200, `rol: "DIRECTOR"`.
7. Con `profesor@sur.cursus.test`, pedir una sección de Norte: 404.
