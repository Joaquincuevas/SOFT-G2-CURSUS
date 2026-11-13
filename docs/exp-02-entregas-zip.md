# EXP-02 · Descargar entregas en ZIP

**Caso de uso.** El profesor o ayudante vigente abre **Entregas**, expande el listado de una actividad y selecciona **Descargar entregas en ZIP**.

**Requerimiento.** La descarga contiene la última versión acreditada de cada alumno con inscripción vigente que entregó esa actividad. Cada PDF se identifica por el correo institucional, con un prefijo numérico para que los nombres sean únicos. El backend limita las firmas a la actividad, sección y universidad de la sesión.

El navegador obtiene los PDF del bucket privado mediante URLs temporales y arma el ZIP en memoria. El contenido no atraviesa API Gateway. Si falla un PDF, se muestra un error y se puede volver a intentar.

## Cómo probar

1. Crea dos actividades. En la primera, sube dos versiones para un alumno y un informe para otro. Sube un PDF distinto en la segunda actividad.
2. Descarga el ZIP de la primera como profesor y como ayudante. Ábrelo y verifica que contiene dos PDF y que el primero corresponde a la última versión acreditada.
3. Comprueba que un alumno o un docente de otra sección no puede pedir las URLs del ZIP. Repite en staging para verificar el acceso directo al bucket desde el navegador.

```sh
npm run test -w frontend -- zipEntregas PestanaEntregas
npm run test:db -w backend -- entregas-docentes
```
