import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { SuperadminController } from './superadmin.controller.js'
import { SuperadminService } from './superadmin.service.js'

@Module({
  imports: [AuthModule],
  controllers: [SuperadminController],
  providers: [SuperadminService],
})
export class SuperadminModule {}
