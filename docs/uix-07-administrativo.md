# UI/UX-07 · Experiencia del Administrativo

El dashboard muestra la universidad, facultad y período de la sesión. Cuenta los cursos vigentes de la facultad para el período activo con `GET /api/cursos` y las cuentas vigentes de profesores de la universidad con `GET /api/profesores`. Sin período activo, el primer total incluye todos los cursos vigentes de la facultad. El segundo total incluye profesores y su etiqueta indica el alcance. Las acciones rápidas respetan los permisos de la sesión.

## Recorrido con el seed local

1. Aplica las migraciones y carga el seed. Entra como `administrativo.ingenieria@norte.cursus.test` y `administrativo@sur.cursus.test` con la contraseña del seed. Comprueba el nombre de la facultad, los totales y el destino de los accesos directos.
2. Desde **Gestionar cursos**, usa los filtros nativos de carrera y período, ordena una columna y abre un curso. Crea un curso de prueba. Confirma que vuelva al listado y aparezca el aviso de éxito. Desde **Archivados** se accede al flujo existente.
3. Entra con una cuenta Superadmin de prueba según el README. En el dashboard elige **Administrar** para Universidad Demo Norte y revisa la tabla de facultades, la edición de datos y la confirmación de archivo. La confirmación de universidad muestra la cantidad de cuentas afectadas y exige un motivo.
4. Desde **Administrar cuentas**, busca a Matías Muñoz y filtra por profesor. Abre y cancela su edición y la confirmación de archivo. Para probar una escritura, usa una cuenta de demo nueva. Al crearla, la contraseña provisoria se muestra una sola vez.
5. Repite a **1280 px** y **375 px**. En móvil, Cursos muestra carrera y período junto al nombre. Cuentas reúne correo, rol y facultad bajo el nombre y mantiene las acciones al lado de la cuenta.

## Contraste institucional

Se midieron el texto y fondo del encabezado y del botón **Crear curso** en Chrome, en ambas resoluciones.

| Universidad | Fondo     | Contraste |
| ----------- | --------- | --------- |
| Demo Norte  | `#1b4f72` | 8,72:1    |
| Demo Sur    | `#0a5c36` | 8,09:1    |

## Capturas

| Vista                   | 1280 px                                                  | 375 px                                             |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Dashboard Norte         | [Escritorio](evidencias/uix-07-dashboard-norte-1280.png) | [Móvil](evidencias/uix-07-dashboard-norte-375.png) |
| Dashboard Sur           | [Escritorio](evidencias/uix-07-dashboard-sur-1280.png)   | [Móvil](evidencias/uix-07-dashboard-sur-375.png)   |
| Cursos                  | [Escritorio](evidencias/uix-07-cursos-1280.png)          | [Móvil](evidencias/uix-07-cursos-375.png)          |
| Crear curso             | [Escritorio](evidencias/uix-07-crear-curso-1280.png)     | [Móvil](evidencias/uix-07-crear-curso-375.png)     |
| Administrar universidad | [Escritorio](evidencias/uix-07-universidad-1280.png)     | [Móvil](evidencias/uix-07-universidad-375.png)     |
| Cuentas filtradas       | [Escritorio](evidencias/uix-07-cuentas-1280.png)         | [Móvil](evidencias/uix-07-cuentas-375.png)         |
| Editar cuenta           | [Escritorio](evidencias/uix-07-editar-cuenta-1280.png)   | [Móvil](evidencias/uix-07-editar-cuenta-375.png)   |
