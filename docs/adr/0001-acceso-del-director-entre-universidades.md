# ADR 0001: acceso del Director entre universidades

- **Estado:** Aceptada
- **Fecha:** 2026-10-19
- **Tarjetas:** MT-02 (registro de la decisión) y MT-03 (implementación)

## Contexto

CURSUS aísla los datos por universidad: cada usuario pertenece a una (`usuario.universidad_id`) y solo ve los datos de esa universidad, tanto en la API (MT-01) como en PostgreSQL con Row-Level Security (MT-02).

El Director administra el directorio y necesita una visión consolidada de todas las universidades (RN-03), pero no debe modificar datos de ninguna, ni académicos ni institucionales.

## Decisión

- El Director sigue perteneciendo a una sola universidad: su `universidad_id` es su universidad de origen. El schema no cambia.
- La política RLS le permite **solo leer** (`SELECT`) los datos de todas las universidades. Las políticas de escritura (`INSERT` y `UPDATE`) no lo incluyen, así que tampoco puede modificar los de su universidad de origen.
- En la API, sus permisos son de solo lectura (`definirAbilityPara` en `@cursus/shared`: nunca `manage`, `create`, `update` ni `delete`).
- La única excepción es su propia contraseña (PER-02): es una credencial de su cuenta, no un dato académico ni institucional, y el cambio no pasa por las políticas RLS.

## Alternativas descartadas

- **Tabla `usuario_universidad`** para que un usuario pertenezca a varias universidades: agrega complejidad al schema, a las políticas y a la sesión que hoy no se necesita, porque el único caso entre universidades es el del Director y es de solo lectura.
- **Un rol de base de datos con `BYPASSRLS` para el Director:** se salta todas las políticas, incluidas las de escritura, y deja la restricción de solo lectura únicamente en la API.

## Consecuencias

- Las políticas RLS distinguen al Director a partir del rol de la sesión, que el backend fija en la base junto con la universidad en cada consulta institucional.
- Si en el futuro un usuario necesita escribir en varias universidades, hay que revisar esta decisión.
