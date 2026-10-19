import { Module } from '@nestjs/common'
import { CarrerasController } from './carreras.controller.js'
import { CarrerasService } from './carreras.service.js'

@Module({ controllers: [CarrerasController], providers: [CarrerasService] })
export class CarrerasModule {}
