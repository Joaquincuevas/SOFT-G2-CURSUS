import { Module } from '@nestjs/common'
import { GestionController } from './gestion.controller.js'
import { GestionService } from './gestion.service.js'

@Module({
  controllers: [GestionController],
  providers: [GestionService],
})
export class GestionModule {}
