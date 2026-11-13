# SEG-01: el usuario activa MFA con una app autenticadora

Tarjeta: [F6 SEG-01 Usuario activa MFA con una app autenticadora](https://trello.com/c/1Iiu9n5O/163-f6-seg-01-usuario-activa-mfa-con-una-app-autenticadora). Referencia: Diseño técnico 5.2.1. Dependencia: ninguna dentro de la fase. La desbloquea [SEG-02](https://trello.com/c/Aprvxc7i/164-f6-seg-02-usuario-ingresa-un-c%C3%B3digo-totp-al-iniciar-sesi%C3%B3n), que pedirá el código al iniciar sesión.

**Como** usuario, **quiero** activar MFA con una app autenticadora, **para** agregar una capa extra de protección a mi cuenta.

## Criterios de aceptación

| Criterio                                                                                       | Implementación y pruebas                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desde el perfil se genera un código QR compatible con apps TOTP (Google Authenticator, Authy). | En **Mi perfil**, la tarjeta «Verificación en dos pasos» tiene el botón «Activar verificación en dos pasos». Este llama a `POST /api/perfil/mfa/inicio`, que entrega un QR en SVG con la uri `otpauth://totp/CURSUS:<correo>?secret=…&issuer=CURSUS` (HMAC-SHA1, 6 dígitos, 30 segundos), y la clave en base32 para ingresarla a mano, en grupos de cuatro. Los parámetros se prueban con los vectores de la RFC 6238. |
| La activación se confirma ingresando un código válido de la app.                               | `POST /api/perfil/mfa/confirmacion` con `{ codigo }`. Solo con un código válido el MFA queda activo (`activado_en`). Se aceptan los códigos del paso actual y de un paso antes o después (±30 s), por si el reloj del teléfono está corrido. Un código incorrecto responde 400 y no activa nada. Se puede reintentar con el código siguiente.                                                                          |
| El secreto TOTP se guarda cifrado en la base de datos.                                         | AES-256-GCM, con una llave derivada (HKDF-SHA256) de `MFA_SECRET`, que nunca se guarda en la base, y el id del usuario como dato autenticado. Un `CHECK` de la tabla rechaza cualquier valor que no tenga el formato cifrado, y el rol de la API no tiene permisos sobre la tabla.                                                                                                                                     |

## Flujo

1. `GET /api/perfil/mfa` → `{ activo }`. Si está activo, la tarjeta solo lo informa.
2. «Activar verificación en dos pasos» → `POST /api/perfil/mfa/inicio`. Genera un secreto nuevo y lo deja **pendiente** (`activado_en` NULL). Si ya había uno pendiente, lo reemplaza: el QR anterior deja de servir.
3. El usuario escanea el QR (o ingresa la clave) y escribe el código de 6 dígitos. Los espacios se ignoran, porque las apps lo muestran como «123 456».
4. `POST /api/perfil/mfa/confirmacion` → 204 y la tarjeta muestra «Verificación en dos pasos activada.».

«Cancelar» oculta el QR. El secreto pendiente queda guardado, pero no sirve para nada mientras no se confirme, y el siguiente QR lo reemplaza.

## API

| Método y ruta                       | Respuesta                                                                                                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/perfil/mfa`               | 200 `EstadoMfa` (`{ activo: boolean }`).                                                                                                                                                                                          |
| `POST /api/perfil/mfa/inicio`       | 200 `InicioMfa` (`{ secreto, uri, qr }`) con `Cache-Control: no-store`. 409 si el MFA ya está activo: no se reemplaza un secreto activo. 503 sin `MFA_SECRET`.                                                                    |
| `POST /api/perfil/mfa/confirmacion` | 204 si el código es válido. 400 «El código no es válido», «Primero genera el código QR» o un formato distinto de 6 dígitos. 409 si ya estaba activo o si en otra pestaña se generó un QR nuevo entre medio. 503 sin `MFA_SECRET`. |

Las tres exigen sesión y responden 401 sin ella. Las tres sirven para **todos los roles**, también el Director y el superadmin: como la contraseña (PER-02), el MFA es una credencial y no un dato académico (ADR 0001). También las puede usar el alumno egresado (HIS-06). Con la contraseña provisoria responden 403, como el resto de la API, hasta que la cambie (PER-03). El id del usuario sale siempre del JWT.

## Persistencia

La migración `CrearMfaUsuario1792970000000` crea `mfa_usuario (usuario_id PK, secreto_cifrado, creado_en, activado_en)`.

- **Tabla propia y no una columna de `usuario`.** La auditoría del superadmin (`superadmin_cambio`) copia la fila completa de `usuario`. Si el secreto estuviera ahí, quedaría duplicado en la auditoría.
- **Sin `universidad_id` ni RLS**, como `sesion_auth` y `refresh_token`: es una credencial, no un dato institucional. El rol `cursus_app` no tiene permisos sobre la tabla (lo prueban `test/seguridad/mfa.db-spec.ts` y el contrato de `test/multitenant/rls.db-spec.ts`). El servicio usa la conexión del backend y siempre filtra por el id del JWT.
- **`ck_mfa_usuario_secreto_cifrado`** exige `v1.<iv>.<tag>.<cifrado>` en base64url. Un secreto base32 en claro nunca tiene puntos, así que la base lo rechaza.

## Cifrado y configuración

- `MFA_SECRET` (mínimo 32 caracteres) es la base de la llave. En local viene de `.env.example`. En staging y production es el secreto `cursus-<entorno>/mfa-secret` de Secrets Manager, que crea `infra/aws/cursus.yml`.
- **Es opcional para arrancar**, como `S3_BUCKET`: sin él, la API funciona y solo `inicio` y `confirmacion` responden 503 («no está disponible»). Así, un deploy no se cae si el stack todavía no tiene el secreto. Si viene con menos de 32 caracteres, la API no arranca.
- **Rotar `MFA_SECRET` invalida los MFA ya activados**: no se podrían descifrar. Si alguna vez hay que rotarlo, habrá que agregar una versión `v2` al formato.
- El formato lleva el id del usuario como dato autenticado de GCM: un secreto copiado a la fila de otro usuario no se descifra.

## Fuera de alcance

- **Pedir el código al iniciar sesión** es SEG-02. Con esta tarjeta, el MFA queda activo pero el login todavía no lo exige. `pasoDelCodigo` devuelve el paso de 30 s en que calzó el código, para que SEG-02 pueda impedir que el mismo código se use dos veces.
- **Desactivar el MFA** o recuperarlo si se pierde el teléfono: la tarjeta no lo pide. Por ahora, un `DELETE FROM mfa_usuario WHERE usuario_id = …` en la base lo resetea.
- **Límite de intentos al confirmar:** no se agrega. Quien confirma ya tiene la sesión y acaba de ver el secreto, así que adivinar un código no le da nada que no tenga. En SEG-02 los intentos sí contarán para el rate limiting del login.

## Pruebas

- `backend/src/seguridad/totp.spec.ts`: base32 con los vectores de la RFC 4648. Códigos con los seis vectores SHA1 de la RFC 6238. Tolerancia de ±1 paso y rechazo de 2 pasos. Formatos inválidos. Key Uri con correos con `+`.
- `backend/src/seguridad/cifrado-mfa.spec.ts`: cifra y descifra, sin el secreto en claro y con el formato del `CHECK`. Falla con otro usuario, otra llave o un texto alterado.
- `backend/src/seguridad/mfa.service.spec.ts` y `backend/src/config/entorno.spec.ts`: 503 sin `MFA_SECRET`, sin tocar la base, y la API no arranca con un `MFA_SECRET` corto.
- `backend/test/seguridad/mfa.db-spec.ts` (contra PostgreSQL, por HTTP): un test por criterio; QR nuevo que reemplaza al pendiente; código con espacios; incorrecto, viejo y mal formado; confirmar sin QR; 409 con el MFA activo; secreto cifrado en la base y `CHECK` contra uno en claro; el rol de la API sin acceso; Director, superadmin, administrativo y egresado; 403 con contraseña provisoria; 401 sin sesión; aislamiento entre usuarios; usuario archivado.
- `backend/test/database/esquema-inicial.db-spec.ts`: la migración se aplica y se revierte.
- `frontend/src/pages/ActivarMfa.test.tsx`: tarjeta para alumno, profesor, administrativo y Director; QR y clave agrupada; activación con un código con espacio; código incorrecto con reintento; formato inválido sin petición; ya activa; cancelar; 409 desde otra pestaña; QR que ya no existe; 503; errores al generar y al confirmar; error al cargar con «Reintentar».
- CSS medido en Chromium a 320, 375 y 1280 px: sin scroll horizontal, con el QR de 192 px, la clave sin espacios y los botones dentro de la tarjeta.

## Pasos manuales para el reviewer

1. Copiar `MFA_SECRET` de `.env.example` a tu `.env`, y luego correr `npm run migration:run --workspace=backend`, `npm run dev:back` y `npm run dev:front`.
2. Entrar con `alumno@norte.cursus.test` (contraseña `SEED_PASSWORD`, por defecto `cursus_demo`) e ir a **Mi perfil**.
3. En «Verificación en dos pasos», pulsar «Activar verificación en dos pasos» y escanear el QR con Google Authenticator o Authy. Esperado: la cuenta aparece como «CURSUS (alumno@norte.cursus.test)».
4. Escribir un código incorrecto. Esperado: aviso de código inválido, y el QR sigue visible.
5. Escribir el código de la app. Esperado: «Verificación en dos pasos activada.». Al recargar, la tarjeta dice que está activa.
6. En la base: `SELECT secreto_cifrado FROM mfa_usuario;`. Esperado: `v1.…`, sin la clave que mostró la pantalla.
7. Sin `MFA_SECRET` en `.env`, reiniciar el backend: el perfil carga y activar responde «no está disponible por ahora».
