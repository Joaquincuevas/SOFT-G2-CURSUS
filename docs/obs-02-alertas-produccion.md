# OBS-02 · Alertas de producción

Una sonda programada cada minuto consulta `/api/health` y `/api/health/db` a través de API Gateway. Valida el estado HTTP y el JSON. Lee el secreto de origen de Secrets Manager para la consulta de base de datos y publica un único resultado de salud por ejecución. Los logs distinguen el fallo de API del fallo de base de datos.

- **Salud**. CloudWatch alerta tras seis comprobaciones consecutivas fallidas de un minuto. La ausencia de métricas también cuenta como fallo.
- **Errores 5xx**. CloudWatch alerta con una tasa de al menos 5 % y un mínimo de 10 errores 5xx en una ventana de cinco minutos. Sin tráfico, la alarma no se dispara.
- **Entrega**. SNS avisa al buzón del equipo al entrar en alarma y al volver a OK.

## Activación y verificación

1. Con una imagen de producción disponible, define `OBS_ALERTAS_CORREO` con el buzón real del equipo y ejecuta `bash infra/aws/stack.sh production --dry-run`. Revisa el conjunto de cambios. Habilitar las alertas desactiva el apagado automático nocturno de ECS y RDS en producción para mantener la disponibilidad. Staging conserva su programación.
2. Aplica con `bash infra/aws/stack.sh production` usando la misma variable. Confirma la suscripción en el correo de SNS. Si ECS o RDS ya estaban detenidos, inícialos con el procedimiento de producción.
3. Comprueba en CloudWatch que aparece `CURSUS/Salud → FalloSalud` para el ID de la API de producción y que el valor habitual es 0. Confirma que las alarmas `cursus-production-salud` y `cursus-production-tasa-5xx` apuntan al tema SNS.
4. Coordina una prueba de notificación desde CloudWatch con `set-alarm-state` para cada alarma cuando esté en OK. Confirma la recepción en el buzón. Esta prueba verifica el canal de avisos. Los umbrales y la evaluación de fallos se pueden probar en un stack aislado antes de aplicar en producción.
5. Ante una alerta de salud, revisa el log de la sonda. Si falla la API, revisa API Gateway y ECS. Si la API responde y falla la base, revisa RDS y el endpoint de salud de base de datos. Ante una alerta 5xx, revisa los logs del backend y las métricas de API Gateway.
