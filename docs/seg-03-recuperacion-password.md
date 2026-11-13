# SEG-03 · Recuperación de contraseña

**Caso de uso.** En el login, el usuario selecciona **¿Olvidaste tu contraseña?**, ingresa su correo institucional y recibe un enlace para definir una nueva contraseña. Después vuelve a iniciar sesión.

**Requerimiento.** El API devuelve 204 y la interfaz muestra el mismo mensaje para direcciones válidas con o sin cuenta. El enlace vence en 30 minutos y solo se puede canjear una vez. El restablecimiento revoca las sesiones existentes y conserva la configuración de MFA.

## Configuración

Configura `RECUPERACION_ORIGEN` con el origen HTTPS del frontend, `RECUPERACION_REMITENTE` con un remitente verificado y `AWS_REGION` con la región de SES. En CloudFormation, proporciona `RemitenteRecuperacion` e `IdentidadSesRecuperacion` y aplica la actualización del stack para configurar las variables y el permiso de la tarea. Para enviar a destinatarios sin verificar, la cuenta SES debe tener habilitado el acceso de producción en esa región.

Con el script del repositorio, pasa el remitente y la identidad de SES mediante `RECUPERACION_REMITENTE` y `RECUPERACION_IDENTIDAD_SES` al ejecutar `bash infra/aws/stack.sh staging`.

## Cómo probar

1. Pide un enlace con una cuenta institucional de prueba y con una dirección inexistente. Comprueba que las respuestas públicas sean iguales y que el correo llegue solo a la cuenta de prueba.
2. Abre el enlace, guarda una nueva contraseña y verifica que puedes iniciar sesión con ella. Comprueba que la sesión anterior perdió el acceso.
3. Reabre el enlace y confirma que se rechaza. Repite con un enlace vencido.

Las pruebas automatizadas sustituyen el envío a SES y verifican la expiración, el consumo concurrente y la revocación. El límite de solicitudes es independiente del login. Solo se guarda el hash del enlace y una huella de la credencial a la que se emitió.
