import type { CursoArchivado, CursoArchivadoListado } from '@cursus/shared'
import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common'
import type { RequestConUsuario } from '../auth/jwt-auth.guard.js'
import { Puede } from '../auth/permisos.decorator.js'
import { UniversidadActual } from '../auth/universidad-actual.decorator.js'
import {
  BaseDeDatos,
  fijarUsuario,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

@Controller('cursos-archivados')
export class CursosArchivadosController {
  constructor(private readonly bd: BaseDeDatos) {}

  @Puede('read', 'Curso')
  @Get()
  listar(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
  ): Promise<CursoArchivadoListado[]> {
    if (contexto.rol !== 'ADMINISTRATIVO') throw new ForbiddenException()
    return this.bd.consultarEnUniversidad<CursoArchivadoListado>(
      contexto,
      `SELECT c.id, c.codigo, c.nombre, ca.nombre AS "carreraNombre",
              to_json(c.archived_at) AS "archivadoEn",
              json_build_object('id', p.id, 'anio', p.anio, 'semestre', p.semestre) AS periodo
         FROM curso c
         JOIN carrera ca ON ca.id = c.carrera_id AND ca.universidad_id = c.universidad_id
         JOIN periodo p ON p.id = c.periodo_id AND p.universidad_id = c.universidad_id
        WHERE c.universidad_id = $1 AND c.archived_at IS NOT NULL
          AND ca.facultad_id = facultad_actual($2)
        ORDER BY p.anio DESC, p.semestre DESC, c.codigo`,
      [req.usuario?.sub],
    )
  }

  @Puede('read', 'Curso')
  @Get(':id')
  obtener(
    @UniversidadActual() contexto: ContextoUniversidad,
    @Req() req: RequestConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CursoArchivado> {
    if (contexto.rol !== 'ADMINISTRATIVO') throw new ForbiddenException()
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await fijarUsuario(bd, req.usuario?.sub as string)
      const [{ curso }] = await bd.query<{ curso: CursoArchivado | null }>(
        'SELECT public.consultar_curso_archivado($1) AS curso',
        [id],
      )
      if (!curso) throw new NotFoundException('El curso archivado no existe')
      return curso
    })
  }
}
