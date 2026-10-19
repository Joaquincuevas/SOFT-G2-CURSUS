import { Global, Module } from '@nestjs/common'
import { BaseDeDatos } from './base-de-datos.service.js'

// Global: todos los módulos usan la misma conexión a la base, en vez de abrir
// una por módulo.
@Global()
@Module({
  providers: [BaseDeDatos],
  exports: [BaseDeDatos],
})
export class BaseDeDatosModule {}
