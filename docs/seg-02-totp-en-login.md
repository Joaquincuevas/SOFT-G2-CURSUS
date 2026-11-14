# SEG-02: el usuario ingresa un código TOTP al iniciar sesión

Tarjeta: [F6 SEG-02 Usuario ingresa un código TOTP al iniciar sesión](https://trello.com/c/Aprvxc7i/164-f6-seg-02-usuario-ingresa-un-codigo-totp-al-iniciar-sesion). Referencia: Diseño técnico 5.2.1. Depende de SEG-01 (activación del MFA, `docs/seg-01-activar-mfa.md`) y usa el registro de accesos de SEG-04.

**Como** usuario con MFA activo, **quiero** que el login me pida el código de mi app autenticadora, **para** que una contraseña robada no baste para entrar.

## Criterios de aceptación

| Criterio                                                                                   | Implementación y pruebas                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tras validar correo y contraseña, con MFA activo se pide el código de 6 dígitos de la app. | `POST /api/auth/login` responde `{ mfaRequerido: true, desafio }` y no emite sesión. La pantalla de login pasa a «Verificación en dos pasos». `login-mfa.db-spec.ts`, `LoginMfa.test.tsx`. |
| Un código inválido o expirado se rechaza; los intentos cuentan para el rate limiting.      | `POST /api/auth/login/mfa` responde 401 «Código inválido o expirado». Cada fallo cuenta por usuario y por IP con `LimiteLogin`; al exceder, 429 con `Retry-After`.                         |
| Sin código válido no se emite el token de sesión.                                          | `completarMfa` emite tokens solo si `verificarParaLogin` acepta el código. Pruebas con código inválido, fuera de ventana, reusado, desafío vencido o manipulado: ninguna crea sesión.      |

## Flujo

1. **Paso 1.** `POST /api/auth/login` `{ correo, password }`. Sin MFA, responde como siempre (`{ accessToken }` y cookie de refresh). Con MFA activo y la contraseña correcta, no crea sesión ni refresh token: responde `{ mfaRequerido: true, desafio }`.
2. **Paso 2.** `POST /api/auth/login/mfa` `{ desafio, codigo }`. Con un código válido responde igual que el login: `{ accessToken }` y la cookie de refresh.

Una contraseña incorrecta responde 401 «Credenciales inválidas» tenga o no MFA la cuenta: que una cuenta lo tenga solo se sabe después de acertar la contraseña, así que no permite enumerar cuentas.

## El desafío

- **Firmado con otra llave.** Se firma con una llave derivada (HMAC-SHA256) de `JWT_SECRET` con otro propósito, no con `JWT_SECRET`. `JwtAuthGuard` verifica con `JWT_SECRET`, así que el desafío no sirve como token de sesión en ninguna ruta; y un JWT de sesión no pasa como desafío. Además lleva `prop: "mfa"` y no trae rol, universidad ni `sid`.
- **Vinculado a la versión de la credencial.** Lleva una huella (HMAC con la llave del desafío) del hash de la contraseña de la cuenta (`cv`). Cambiar o restablecer la contraseña genera otro hash, así que un desafío emitido antes del cambio se rechaza aunque no haya expirado ni se haya usado, y no puede crear una sesión después de que se revocaron las anteriores. Se comprueba al leer el desafío y otra vez, con `FOR SHARE` sobre la cuenta, antes de consumir el paso del código: un cambio de contraseña concurrente espera a que termine el inicio de sesión. Un inicio nuevo con la contraseña actual funciona normal.
- **Expira en 5 minutos.**
- **De un solo uso.** Lleva el último paso TOTP aceptado de la cuenta cuando se emitió (`up`). Al iniciar sesión con él, ese paso avanza y el mismo desafío deja de valer, aunque llegue con un código nuevo. También se invalida si otro inicio de sesión de la cuenta usó un código entretanto (hay que repetir el paso 1).
- Manipulado, vencido o de otro propósito: 401 con `code: "MFA_DESAFIO_INVALIDO"` y el mensaje «La verificación expiró. Inicia sesión de nuevo.». La pantalla vuelve al paso 1.

## Verificación del código

- Mismo secreto cifrado y misma librería que SEG-01 (`descifrarSecretoTotp`, `pasoDelCodigo`): ventana de ±1 paso de 30 s.
- **Sin reuso.** La migración `AgregarUltimoPasoMfa1792980000000` agrega `mfa_usuario.ultimo_paso`. Un código solo vale si su paso es mayor que el último aceptado; el `UPDATE` es atómico (`ultimo_paso IS NOT DISTINCT FROM` el valor leído), así que dos peticiones con el mismo código no pueden ganar las dos. El código con que se confirma el MFA en SEG-01 también guarda su paso: no sirve para iniciar sesión.
- **Falla cerrado.** Sin `MFA_SECRET`, o con un secreto que no se puede descifrar, el código nunca es válido: no hay sesión.
- Una cuenta archivada entre los dos pasos no inicia sesión.
- Los espacios del código («123 456») se ignoran; un formato distinto de 6 dígitos es 400, sin contar como intento.

## Rate limiting

Se reutiliza `LimiteLogin.intentar` (5 fallos por cuenta y 20 por IP en 15 minutos):

- Cada código fallido cuenta en la clave `usuario:<id>` (no en la del correo, porque el paso 2 no lleva correo) y en la de la IP, que comparte con el login.
- Con el límite alcanzado responde 429 con `Retry-After` **sin evaluar el código**: no revela si era correcto.
- **La contraseña correcta que espera el código no reinicia los contadores** (`reinicia` en `intentar`). Si los reiniciara, se podrían adivinar códigos reiniciando el límite de la IP con cada contraseña. Tampoco cuenta como fallo.
- Un código válido reinicia los contadores, como un login válido.

## Registro de accesos (SEG-04)

Cada resultado del paso 2 queda como un evento `INICIO_SESION` con `usuario_id`, IP y resultado (`EXITOSO`, `FALLIDO` o `BLOQUEADO`) y `detalle: { "subtipo": "MFA" }`. `registrar_inicio_sesion` recibe el subtipo (la migración cambia su firma; se acepta solo `MFA`). No se guarda el código, el secreto ni el desafío: la tabla no tiene columnas para eso y una prueba busca esos valores en todo el registro. El paso 1 con la contraseña correcta no registra nada, porque aún no hay sesión; el evento exitoso llega en el paso 2. SEG-05 muestra el subtipo como «Verificación en dos pasos».

Los mensajes de error son genéricos y el log del servidor, si falla el registro, lleva un mensaje fijo con el SQLSTATE (SEG-04); nada del código, el desafío ni el secreto llega a un log.

## Pantalla

Tras el paso 1 con MFA, «Verificación en dos pasos»: campo con `inputMode="numeric"`, `autocomplete="one-time-code"` y foco automático; «Verificar» (con «Verificando…» mientras espera); errores en una región `role="alert"` enlazada al campo; «Volver al inicio de sesión». Un código inválido limpia el campo y deja reintentar; un desafío vencido vuelve al paso 1 con el correo conservado y el aviso de expiración; un 429 deshabilita el formulario con la espera. La contraseña no se vuelve a enviar ni se guarda.

## Migración

`1792980000000-AgregarUltimoPasoMfa`: agrega `mfa_usuario.ultimo_paso integer` (con `CHECK >= 0`) y reemplaza `registrar_inicio_sesion` por la versión con `p_subtipo`, repitiendo `REVOKE ALL FROM PUBLIC` y `GRANT EXECUTE` al rol de la app. No crea tablas: `mfa_usuario` sigue sin permisos para la app. Su `down` vuelve a la función de SEG-04 y quita la columna (se pierden los pasos usados). `esquema-inicial.db-spec.ts` la revierte primero en sus tres secciones.

## Pruebas

- `backend/test/seguridad/login-mfa.db-spec.ts` (PostgreSQL, por HTTP): el paso 1 no emite sesión; usuario sin MFA y con MFA pendiente sin cambios; sin enumeración; código válido, con espacios, ±1 paso, ±2 pasos, inválido, mal formado, reusado, el de la confirmación y cuenta archivada; desafío de un solo uso, vencido, manipulado, de sesión y firmado con la llave de sesión; desafío anterior a un cambio o restablecimiento de contraseña (rechazado, sin consumir el paso) e inicio nuevo con la contraseña actual; el desafío no sirve en rutas protegidas; límite por usuario y por IP, y que el paso 1 no lo reinicie; eventos de SEG-04 sin datos sensibles.
- `backend/test/auth/login-mfa.e2e-spec.ts`: forma de los dos pasos, `reinicia`, 401/429/400, el log fijo si falla el registro.
- `backend/src/auth/desafio-mfa.spec.ts` y `backend/src/seguridad/mfa.service.spec.ts`: el desafío y el fallo cerrado sin `MFA_SECRET`.
- `frontend/src/pages/LoginMfa.test.tsx`: los dos pasos, foco y atributos, código con espacios, mal formado, inválido con reintento, carga, desafío vencido, rate limit, error del servidor y volver.
- Se revirtieron, y su prueba falla: la verificación del código (acepta cualquiera), el reuso del paso, emitir sesión sin pedir código, el reinicio del límite por el paso 1, el límite por usuario, la llave propia del desafío, su un solo uso y la comprobación de la credencial.

## Límites

- **Recuperación y desactivación del MFA** siguen fuera de alcance (SEG-01): quien pierde el teléfono no puede iniciar sesión hasta que se borre su fila de `mfa_usuario` en la base.
- **El refresh** (`/api/auth/refresh`) no vuelve a pedir el código: la sesión ya lo pasó.
- **Rotar `MFA_SECRET`** deja a los usuarios con MFA sin poder iniciar sesión (no se puede descifrar su secreto): se falla cerrado.
- El desafío se invalida si otro inicio de sesión de la cuenta consume un código entre los dos pasos; el usuario repite el paso 1.
