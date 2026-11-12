import type {
  DescargaArchivo,
  SeccionEspacio,
  SilaboVigente,
} from '@cursus/shared'
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AlmacenamientoService } from '../archivos/almacenamiento.service.js'
import {
  BaseDeDatos,
  fijarUsuario,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

interface ArchivoSilabo {
  version: number
  subido_en: Date
  clave: string
  nombre: string
  version_objeto: string
}

@Injectable()
export class SilaboVigenteService {
  constructor(
    private readonly bd: BaseDeDatos,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  async obtener(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    usuarioId: string,
  ): Promise<SilaboVigente> {
    const fila = await this.buscar(contexto, seccion, usuarioId)
    return {
      silabo: fila
        ? { version: fila.version, subidoEn: fila.subido_en.toISOString() }
        : null,
    }
  }

  async descargar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    usuarioId: string,
  ): Promise<DescargaArchivo> {
    const fila = await this.buscar(contexto, seccion, usuarioId)
    if (!fila)
      throw new NotFoundException('El curso aún no tiene un sílabo disponible')
    const { url, expiraEn } = await this.almacenamiento.firmarDescarga(
      fila.clave,
      fila.nombre,
      fila.version_objeto,
    )
    return { url, expiraEn: expiraEn.toISOString() }
  }

  private async buscar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
    usuarioId: string,
  ) {
    if (
      contexto.rol !== seccion.rol ||
      !['PROFESOR', 'AYUDANTE', 'ALUMNO'].includes(seccion.rol)
    ) {
      throw new ForbiddenException()
    }
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await fijarUsuario(bd, usuarioId)

      // El curso comparte el PDF entre sus secciones. Se comprueba la
      // pertenencia a la sección solicitada, no a la que subió el archivo.
      const [fila] = await bd.query<ArchivoSilabo>(
        `SELECT si.version, si.subido_en, si.version_objeto, a.clave, a.nombre
           FROM seccion s
           JOIN curso c ON c.id = s.curso_id AND c.universidad_id = s.universidad_id
           JOIN silabo si ON si.curso_id = c.id AND si.universidad_id = c.universidad_id
           JOIN archivo a ON a.id = si.archivo_id AND a.universidad_id = si.universidad_id
           JOIN seccion origen ON origen.id = a.seccion_id AND origen.universidad_id = a.universidad_id
          WHERE s.universidad_id = $1 AND s.id = $2
            AND s.archived_at IS NULL AND c.archived_at IS NULL
            AND origen.curso_id = c.id
            AND a.subido_como = 'PROFESOR' AND a.tipo = 'application/pdf'
            AND a.subido_at IS NOT NULL AND a.archived_at IS NULL
            AND CASE $4::text
                  WHEN 'PROFESOR' THEN es_profesor_de_seccion(s.id, $3)
                  WHEN 'AYUDANTE' THEN EXISTS (
                    SELECT 1 FROM ayudante_seccion ay
                     WHERE ay.seccion_id = s.id AND ay.universidad_id = s.universidad_id
                       AND ay.usuario_id = $3 AND ay.archived_at IS NULL)
                  WHEN 'ALUMNO' THEN EXISTS (
                    SELECT 1 FROM inscripcion i
                     WHERE i.seccion_id = s.id AND i.universidad_id = s.universidad_id
                       AND i.usuario_id = $3 AND i.archived_at IS NULL)
                  ELSE false
                END
          ORDER BY si.version DESC LIMIT 1`,
        [contexto.universidadId, seccion.id, usuarioId, seccion.rol],
      )
      return fila ?? null
    })
  }
}
