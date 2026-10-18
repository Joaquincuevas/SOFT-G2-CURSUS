import { Controller, Get } from '@nestjs/common'
import { AppService } from './app.service.js'
import { SoloSesion } from './auth/permisos.decorator.js'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @SoloSesion()
  @Get()
  getHello(): string {
    return this.appService.getHello()
  }
}
