import { Module } from '@nestjs/common'
import { PerfilController } from './perfil.controller.js'
import { PerfilService } from './perfil.service.js'

@Module({ controllers: [PerfilController], providers: [PerfilService] })
export class PerfilModule {}
