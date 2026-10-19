# AUTH-03: cierre de sesión

Tarjeta: [F1 AUTH-03 Usuario cierra sesión](https://trello.com/c/y9singVH/76-f1-auth-03-usuario-cierra-sesi%C3%B3n). Referencia: RE-01. Dependencia: AUTH-01; se integra sobre AUTH-04 ya incorporada en develop.

## Comportamiento

Cerrar Sesión retira inmediatamente el token de memoria y reemplaza la ruta actual por `/login`. El frontend descarta las respuestas de peticiones anteriores al cierre y avisa a las otras pestañas del mismo origen mediante el evento `storage`.

`POST /api/auth/logout` sigue siendo público, sin cuerpo y con respuesta 204 incluso sin cookie o al repetirlo. Revoca la sesión identificada por la cookie `refresh`, todos sus refresh tokens y borra la cookie HttpOnly con su mismo Path `/api/auth`. Los JWT incluyen `sid`: el guard consulta la sesión en PostgreSQL en cada petición protegida y responde 401 si se revocó. Los JWT emitidos antes y después de renovar comparten sesión; cerrar una sesión no afecta otro navegador del mismo usuario.

Login, renovación y logout usan el mismo Web Lock donde está disponible. Logout espera una renovación pendiente antes de enviar la cookie al servidor. Se conserva la política de AUTH-04: intentar renovar un refresh token ya revocado se interpreta como reuso y revoca todas las sesiones del usuario.

En `localStorage` se guarda únicamente `cursus-sesion-cerrada=1`, sin tokens ni datos personales. Si el servidor falla o no hay conexión, la marca impide restaurar la cookie al recargar; solo un login exitoso la elimina. Sin conexión no se puede garantizar la revocación remota ni borrar una cookie HttpOnly: se bloquea su uso por esta aplicación en ese navegador, y el token remoto conserva su vigencia hasta revocarse o expirar.

## Migración y despliegue

Ejecutar `npm run migration:run --workspace=backend` antes de arrancar la nueva API. La migración agrega `sesion_auth` y `refresh_token.sesion_id`, sin modificar migraciones anteriores. Asocia los refresh tokens existentes a sesiones y conserva su estado de revocación. La columna admite null para permitir que la versión anterior siga insertando durante un despliegue o rollback.

Los JWT anteriores sin `sid` reciben 401: una cookie activa migrada puede renovarlos automáticamente; en los demás casos se necesita iniciar sesión nuevamente. Los tokens insertados por la versión anterior después de la migración no tienen sesión y la nueva versión no los renueva. En rollback se conserva la migración aplicada; la versión anterior seguirá funcionando, pero no aplicará la nueva validación de sesiones revocadas.

## Pruebas automáticas

Desde la raíz, con dependencias instaladas y PostgreSQL local levantado:

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

Los tests de base crean y eliminan bases de prueba propias. Cubren invalidación de JWT de distintas renovaciones, cookie anterior a una rotación, logout repetido y aislamiento entre navegadores. Los tests del frontend cubren redirección inmediata, historial, acceso directo y recarga, pérdida de conexión, renovación pendiente y cierre recibido desde otra pestaña.

## Pasos para el reviewer

1. Hacer checkout de `feature/auth-cerrar-sesion`, ejecutar `npm ci`, preparar `.env` desde `.env.example` si falta y levantar `docker compose up -d --wait`.
2. Ejecutar las migraciones y `npm run seed --workspace=backend`. Levantar `npm run dev:back` y `npm run dev:front` en terminales distintas. Abrir `http://localhost:5173`.
3. Ingresar con `profesor@norte.cursus.test` y la contraseña `SEED_PASSWORD` de `.env` (`cursus_demo` si se mantiene el ejemplo). Abrir Mis Cursos. En DevTools > Network, conservar el `accessToken` de login únicamente para esta prueba local.
4. Abrir otra pestaña del mismo origen y confirmar que restaura la sesión. En la primera, pulsar Cerrar Sesión. Esperado: ambas quedan en `/login`, sin menú ni contenido protegido. La respuesta de logout es 204 y elimina la cookie `refresh`.
5. Usar Atrás, recargar y escribir `/mis-cursos` directamente. Esperado: continúa en login; no se restaura la sesión.
6. En una terminal, llamar `GET http://localhost:3000/api/auth/yo` con `Authorization: Bearer <accessToken guardado>`. Esperado: 401, aunque aún no hayan pasado los 15 minutos del JWT. No pegar tokens en el PR.
7. En otra ventana con almacenamiento separado (incógnito u otro perfil), iniciar sesión con el mismo usuario. Cerrar la sesión de la ventana normal y comprobar que la otra sigue funcionando. No reenviar un refresh revocado: eso activa la política de reuso de AUTH-04.
8. Volver a ingresar, desconectar la red desde DevTools y cerrar sesión. Esperado: login inmediato. Reconectar y recargar `/mis-cursos`: sigue en login. Esta prueba comprueba el bloqueo local; la revocación remota requiere conexión.
9. Iniciar sesión nuevamente y comprobar que Mis Cursos vuelve a cargar. Revisar que no aparezcan errores inesperados de consola/backend; los 401 de las pruebas negativas son esperados.

La aprobación final requiere que el compañero complete esta revisión y que los checks de GitHub estén en verde antes de integrar a develop.
