import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { SuperadminController } from './superadmin.controller.js'
import { SuperadminService } from './superadmin.service.js'
import { UniversidadesController } from './universidades.controller.js'
import { UniversidadesService } from './universidades.service.js'

@Module({
  imports: [AuthModule],
  controllers: [SuperadminController, UniversidadesController],
  providers: [SuperadminService, UniversidadesService],
})
export class SuperadminModule {}
