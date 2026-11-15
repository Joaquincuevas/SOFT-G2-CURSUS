# UI/UX-L: login y pantallas de acceso con shadcn

Tarjeta: UI/UX-L (en Trello figura como «UI/UX-02 · UI/UX Login y Landing»). Rediseña con shadcn las pantallas de acceso que existen en el repositorio y las deja con la misma estructura visual. No cambia la lógica de autenticación, las rutas ni los contratos de la API.

## Qué pantallas hay

Las rutas reales (`App.tsx`) son `/login`, `/recuperar-password` y `/restablecer-password`, más la pantalla del cambio obligatorio de contraseña (PER-03), a la que `RequireAuth` lleva a quien entra con una contraseña provisoria. La verificación en dos pasos (MFA) es el segundo paso del login (`VerificacionMfa`, dentro de `Login.tsx`). Todas se migraron.

**No hay landing pública** ni ruta para ella: no se creó. Queda para confirmarlo con el equipo.

No se tocaron `ActivarMfa` (activar la verificación, dentro del perfil) ni el cambio de contraseña del perfil (`CambiarPassword`): son parte del perfil, no de la puerta de entrada.

## Qué cambia

- **Estructura común** (`components/AuthLayout.tsx`): el panel de marca (`PanelMarca`, con el isotipo de CURSUS que ya existía) a un lado desde 1024 px y, en pantallas angostas, solo el formulario. Sin el panel, un isotipo pequeño con el nombre identifica la pantalla. El título es el `h1`; la tarjeta es un `Card` de shadcn.
- **`PanelMarca`** pasa a Tailwind, con las mismas medidas del Figma (560 px de ancho, 48 y 56 px de relleno, el mensaje de 420 px).
- **Formularios** con `Label`, `Input`, `Button` y `Alert` de shadcn: `Login.tsx` (con su paso de MFA), `CambioObligatorio.tsx` y `RecuperarPassword.tsx` (pedir el enlace y restablecer). Se borran `Login.css` y `CambioObligatorio.css`.
- **`CampoPassword`**: el campo de contraseña con un botón para mostrarla u ocultarla (`aria-pressed`, nombre accesible «Mostrar contraseña» / «Ocultar contraseña nueva»…, `type="button"`, se llega con Tab justo después del campo).
- **`AlertaAcceso`**: un solo componente para los mensajes, con las variantes del `Alert`: **danger** para un error (credenciales, código inválido, error del servidor), **warning** para un bloqueo (demasiados intentos) e **info** para un aviso (la sesión expiró, la verificación expiró). Los tres llevan un ícono además del color y se anuncian al lector de pantalla (`role="alert"`); un enlace enviado o una contraseña actualizada es un `Alert` **success** (`role="status"`).

## Estados

- **Cargando:** el botón se deshabilita y muestra un spinner (que se detiene con «reducir movimiento»). Se conservan los nombres «Ingresar», «Verificando…» y «Guardando…».
- **Campo inválido:** `aria-invalid` y `aria-describedby`.
  - Login: vacío o con un correo mal escrito, el mensaje va bajo el campo, se enfoca el primero y no se pide nada a la API. Antes eso lo hacía la validación nativa del navegador; ahora el formulario es `noValidate` y el mensaje está en español.
  - Credenciales incorrectas: los dos campos quedan marcados y descritos por la alerta; la contraseña se limpia y se enfoca (como antes).
  - Cambio obligatorio: la contraseña nueva corta o igual a la provisoria marca «Contraseña nueva», y las que no coinciden marcan «Repetir contraseña nueva». El hook `useCambiarPassword` suma `campoInvalido` a lo que ya devolvía (no cambia nada de lo anterior).
  - Restablecer: las contraseñas distintas marcan la confirmación.
- **Teclado:** Enter envía el formulario desde cualquier campo (cada pantalla tiene un único botón de envío), el orden de tabulación es el del formulario y todos los controles tienen foco visible.
- **MFA:** el campo del código es numérico (`inputMode="numeric"`) y `autocomplete="one-time-code"`, y recibe el foco al abrirse.

## Decisiones

- Sin paleta ni tipografía nuevas: los colores salen de los tokens y de `--color-primary` (el login usa el de CURSUS; el cambio obligatorio, el de la universidad de la cuenta).
- Los tokens `--login-*` de `tokens.css` quedan sin uso; no se tocó ese archivo.
- Las pruebas de `Login`, `LoginMfa`, `CambioObligatorio` y `limite-login` no cambiaron: la lógica y los textos son los mismos. `AccesoEstados.test.tsx` cubre los estados; `AuthLayout`, `CampoPassword` y `AlertaAcceso` tienen las suyas.

## Capturas (después)

Las de antes están en `docs/evidencias/ui-l-antes-*.png`, con el mismo nombre. Las alertas de bloqueo, MFA y las del servidor se simularon respondiendo en el navegador (sin tocar cuentas reales); los demás estados salen de la aplicación con su API local.

### Login

| Estado                        | 1280 px                                              | 375 px                                              |
| ----------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Inicial                       | ![](evidencias/ui-l-despues-login-vacio-1280.png)    | ![](evidencias/ui-l-despues-login-vacio-375.png)    |
| Campos inválidos              | ![](evidencias/ui-l-despues-login-invalido-1280.png) | ![](evidencias/ui-l-despues-login-invalido-375.png) |
| Credenciales incorrectas      | ![](evidencias/ui-l-despues-login-error-1280.png)    | ![](evidencias/ui-l-despues-login-error-375.png)    |
| Demasiados intentos (bloqueo) | ![](evidencias/ui-l-despues-login-bloqueo-1280.png)  | ![](evidencias/ui-l-despues-login-bloqueo-375.png)  |
| Cargando                      | ![](evidencias/ui-l-despues-login-cargando-1280.png) | ![](evidencias/ui-l-despues-login-cargando-375.png) |
| Sesión expirada (aviso)       | ![](evidencias/ui-l-despues-login-aviso-1280.png)    | ![](evidencias/ui-l-despues-login-aviso-375.png)    |

### Verificación en dos pasos (MFA)

| Estado                         | 1280 px                                            | 375 px                                            |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------- |
| Inicial                        | ![](evidencias/ui-l-despues-mfa-vacio-1280.png)    | ![](evidencias/ui-l-despues-mfa-vacio-375.png)    |
| Código incompleto              | ![](evidencias/ui-l-despues-mfa-invalido-1280.png) | ![](evidencias/ui-l-despues-mfa-invalido-375.png) |
| Código inválido                | ![](evidencias/ui-l-despues-mfa-error-1280.png)    | ![](evidencias/ui-l-despues-mfa-error-375.png)    |
| Demasiados intentos (bloqueo)  | ![](evidencias/ui-l-despues-mfa-bloqueo-1280.png)  | ![](evidencias/ui-l-despues-mfa-bloqueo-375.png)  |
| Verificando                    | ![](evidencias/ui-l-despues-mfa-cargando-1280.png) | ![](evidencias/ui-l-despues-mfa-cargando-375.png) |
| La verificación expiró (aviso) | ![](evidencias/ui-l-despues-mfa-expirado-1280.png) | ![](evidencias/ui-l-despues-mfa-expirado-375.png) |

### Cambio obligatorio de contraseña

| Estado                        | 1280 px                                               | 375 px                                               |
| ----------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Inicial                       | ![](evidencias/ui-l-despues-cambio-vacio-1280.png)    | ![](evidencias/ui-l-despues-cambio-vacio-375.png)    |
| Contraseña nueva corta        | ![](evidencias/ui-l-despues-cambio-corta-1280.png)    | ![](evidencias/ui-l-despues-cambio-corta-375.png)    |
| Las contraseñas no coinciden  | ![](evidencias/ui-l-despues-cambio-error-1280.png)    | ![](evidencias/ui-l-despues-cambio-error-375.png)    |
| Guardando                     | ![](evidencias/ui-l-despues-cambio-cargando-1280.png) | ![](evidencias/ui-l-despues-cambio-cargando-375.png) |
| Demasiados intentos (bloqueo) | ![](evidencias/ui-l-despues-cambio-bloqueo-1280.png)  | ![](evidencias/ui-l-despues-cambio-bloqueo-375.png)  |

### Recuperar contraseña

| Estado             | 1280 px                                                 | 375 px                                                 |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------ |
| Inicial            | ![](evidencias/ui-l-despues-recuperar-vacio-1280.png)   | ![](evidencias/ui-l-despues-recuperar-vacio-375.png)   |
| Error del servidor | ![](evidencias/ui-l-despues-recuperar-error-1280.png)   | ![](evidencias/ui-l-despues-recuperar-error-375.png)   |
| Enlace enviado     | ![](evidencias/ui-l-despues-recuperar-enviado-1280.png) | ![](evidencias/ui-l-despues-recuperar-enviado-375.png) |

### Restablecer contraseña

| Estado                       | 1280 px                                                    | 375 px                                                    |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Inicial                      | ![](evidencias/ui-l-despues-restablecer-vacio-1280.png)    | ![](evidencias/ui-l-despues-restablecer-vacio-375.png)    |
| Las contraseñas no coinciden | ![](evidencias/ui-l-despues-restablecer-error-1280.png)    | ![](evidencias/ui-l-despues-restablecer-error-375.png)    |
| Enlace inválido              | ![](evidencias/ui-l-despues-restablecer-invalido-1280.png) | ![](evidencias/ui-l-despues-restablecer-invalido-375.png) |
| Contraseña actualizada       | ![](evidencias/ui-l-despues-restablecer-enviado-1280.png)  | ![](evidencias/ui-l-despues-restablecer-enviado-375.png)  |
