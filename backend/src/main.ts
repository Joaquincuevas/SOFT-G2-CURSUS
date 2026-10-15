import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { configurarApp } from './config/configurar-app.js'
import { VARIABLES_API, validarEntorno } from './config/entorno.js'

async function bootstrap() {
  validarEntorno(VARIABLES_API)
  const app = await NestFactory.create(AppModule)
  configurarApp(app)
  // Cierra conexiones al recibir SIGTERM (ECS lo envía al reemplazar la tarea).
  app.enableShutdownHooks()
  await app.listen(process.env.PORT ?? 3000)
}
await bootstrap()
