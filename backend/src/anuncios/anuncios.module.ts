import { Module } from '@nestjs/common'
import { EspacioModule } from '../espacio/espacio.module.js'
import { AnunciosController } from './anuncios.controller.js'
import { AnunciosService } from './anuncios.service.js'

// ANU-01. Importa EspacioModule por IntegranteSeccionGuard (ESP-06).
@Module({
  imports: [EspacioModule],
  controllers: [AnunciosController],
  providers: [AnunciosService],
})
export class AnunciosModule {}
