# HIS-06 · Acceso de egresados

Desde **Administrar universidad → Cuentas**, el superadmin registra el egreso de una cuenta de alumno y confirma el cambio. La cuenta queda vigente con su mismo identificador y rol académico. El egreso queda registrado con fecha y en la auditoría de cuentas.

## Cómo probar

1. Prepara un alumno con notas publicadas de un curso cerrado de un período anterior. Inicia sesión como ese alumno.
2. En otra sesión, entra como superadmin a las cuentas de la universidad. Pulsa **Registrar egreso** y confirma. Comprueba que la cuenta aparece como **Egresado**.
3. En la primera sesión, comprueba que una petición al dashboard o al perfil responde 403 desde que se registra el egreso. Recarga y verifica que la interfaz te lleva al historial. Prueba la URL de una sección vigente y comprueba que también te lleva al historial.
4. Cierra sesión e inicia nuevamente con el egresado. Abre un curso de su historial y verifica que sus notas siguen disponibles en solo lectura.

La sesión del egresado conserva el acceso al historial y a las operaciones de su propia sesión y credenciales. El egreso no caduca y la cuenta queda protegida contra el archivo y el cambio de rol desde la gestión de cuentas. La prueba de PostgreSQL verifica el acceso once años después del egreso.

```sh
npm run test -w frontend -- HistorialAlumno CuentasUniversidad
npm run test:db -w backend -- cuentas esquema-inicial test/notas/notas.db-spec.ts
```
