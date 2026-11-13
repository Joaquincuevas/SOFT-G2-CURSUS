import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { configurarApp } from './config/configurar-app.js'
import { VARIABLES_API, validarEntorno } from './config/entorno.js'
import { LoggerJson } from './observabilidad/logger-json.js'

async function bootstrap() {
  validarEntorno(VARIABLES_API)
  // OBS-01: logs en JSON, una línea por evento, redactados. bufferLogs guarda
  // lo que Nest escribe al arrancar hasta que el logger está instalado.
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(new LoggerJson())
  configurarApp(app)
  // Cierra conexiones al recibir SIGTERM (ECS lo envía al reemplazar la tarea).
  app.enableShutdownHooks()
  await app.listen(process.env.PORT ?? 3000)
}
await bootstrap()
