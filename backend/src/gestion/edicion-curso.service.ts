import type { CambioCurso, CursoEditable } from '@cursus/shared'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { CrearCursoDto } from './crear-curso.dto.js'

const CAMPOS = `c.id, c.codigo, c.nombre, c.carrera_id AS "carreraId", c.periodo_id AS "periodoId",
  ca.nombre AS "carreraNombre", json_build_object('id', p.id, 'anio', p.anio, 'semestre', p.semestre) AS periodo`
const DESDE = `FROM curso c JOIN carrera ca ON ca.id = c.carrera_id
  JOIN periodo p ON p.id = c.periodo_id`
const facultadDe = (
  parametro: string,
) => `(SELECT u.facultad_id FROM usuario u JOIN facultad f ON f.id = u.facultad_id
  WHERE u.id = ${parametro} AND u.universidad_id = $1 AND u.rol = 'ADMINISTRATIVO'
    AND u.archived_at IS NULL AND f.universidad_id = $1 AND f.archived_at IS NULL)`
const VISIBLE = `c.universidad_id = $1 AND c.id = $2 AND c.archived_at IS NULL
  AND ca.archived_at IS NULL AND ca.facultad_id = ${facultadDe('$3')}`

@Injectable()
export class EdicionCursoService {
  constructor(private readonly bd: BaseDeDatos) {}

  async obtener(
    contexto: ContextoUniversidad,
    usuario: string,
    id: string,
  ): Promise<CursoEditable> {
    this.exigirAdministrativo(contexto)
    return this.bd.obtenerEnUniversidad<CursoEditable>(
      contexto,
      `SELECT ${CAMPOS} ${DESDE} WHERE ${VISIBLE}`,
      [id, usuario],
    )
  }

  async historial(
    contexto: ContextoUniversidad,
    usuario: string,
    id: string,
  ): Promise<CambioCurso[]> {
    await this.obtener(contexto, usuario, id)
    // Se vuelve a aplicar el ámbito en la sentencia que lee el historial.
    return this.bd.consultarEnUniversidad<CambioCurso>(
      contexto,
      `SELECT h.id, h.fecha, json_build_object('id', u.id, 'nombre', u.nombre) AS responsable,
              h.anterior, h.nuevo
       FROM curso_cambio h JOIN usuario u ON u.id = h.responsable_id
       JOIN curso c ON c.id = h.curso_id JOIN carrera ca ON ca.id = c.carrera_id
       WHERE h.universidad_id = $1 AND ${VISIBLE} ORDER BY h.fecha DESC, h.id DESC`,
      [id, usuario],
    )
  }

  async editar(
    contexto: ContextoUniversidad,
    usuario: string,
    id: string,
    datos: CrearCursoDto,
  ): Promise<CursoEditable> {
    this.exigirAdministrativo(contexto)
    datos = {
      ...datos,
      carreraId: datos.carreraId.toLowerCase(),
      periodoId: datos.periodoId.toLowerCase(),
    }
    try {
      return await this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
        const parametros = [contexto.universidadId, id, usuario]
        // El mismo bloqueo que usa crearSeccion: serializa modificaciones del
        // curso y permite que cada entrada tenga el anterior realmente vigente.
        const [anterior] = await bd.query<CursoEditable>(
          `SELECT ${CAMPOS} ${DESDE}
          WHERE ${VISIBLE} FOR UPDATE OF c`,
          parametros,
        )
        if (!anterior) throw new NotFoundException('El curso no existe')
        const [destino] = await bd.query<{ carrera: string; periodo: string }>(
          `SELECT ca.id AS carrera, p.id AS periodo FROM carrera ca, periodo p
           WHERE ca.universidad_id = $1 AND ca.id = $3 AND ca.archived_at IS NULL
             AND ca.facultad_id = ${facultadDe('$2')} AND p.universidad_id = $1 AND p.id = $4`,
          [contexto.universidadId, usuario, datos.carreraId, datos.periodoId],
        )
        if (!destino)
          throw new NotFoundException('La carrera o el período no existen')
        const cambio = (
          ['codigo', 'nombre', 'carreraId', 'periodoId'] as const
        ).some((campo) => anterior[campo] !== datos[campo])
        if (!cambio) return anterior
        await bd.query(
          `UPDATE curso SET codigo = $3, nombre = $4, carrera_id = $5, periodo_id = $6
          WHERE universidad_id = $1 AND id = $2`,
          [
            contexto.universidadId,
            id,
            datos.codigo,
            datos.nombre,
            datos.carreraId,
            datos.periodoId,
          ],
        )
        const [nuevo] = await bd.query<CursoEditable>(
          `SELECT ${CAMPOS} ${DESDE} WHERE ${VISIBLE}`,
          parametros,
        )
        await bd.query(
          `INSERT INTO curso_cambio (universidad_id, curso_id, responsable_id, anterior, nuevo)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
          [...parametros, JSON.stringify(anterior), JSON.stringify(nuevo)],
        )
        return nuevo
      })
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          'Ya existe un curso con ese código en el período seleccionado',
        )
      }
      throw error
    }
  }

  private exigirAdministrativo(contexto: ContextoUniversidad) {
    if (contexto.rol !== 'ADMINISTRATIVO') throw new ForbiddenException()
  }
}
