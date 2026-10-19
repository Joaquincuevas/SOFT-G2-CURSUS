import { Module } from '@nestjs/common'
import { PeriodosController } from './periodos.controller.js'
import { PeriodosService } from './periodos.service.js'

@Module({ controllers: [PeriodosController], providers: [PeriodosService] })
export class PeriodosModule {}
