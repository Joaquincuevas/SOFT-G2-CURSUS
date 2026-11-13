import { Module } from '@nestjs/common'
import { MetricasController } from './metricas.controller.js'
import { MetricasService } from './metricas.service.js'

@Module({
  controllers: [MetricasController],
  providers: [MetricasService],
})
export class MetricasModule {}
