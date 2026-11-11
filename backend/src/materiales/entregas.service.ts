import type {
  EntregaInforme,
  EntregarInforme,
  MiEntregaActividad,
  SeccionEspacio,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { AlmacenamientoService } from '../archivos/almacenamiento.service.js'
import {
  BaseDeDatos,
  type ContextoUniversidad,
  fijarUsuario,
} from '../database/base-de-datos.service.js'

type Consulta = Pick<BaseDeDatos, 'query'>
const CERRADA =
  'La actividad está cerrada. No se aceptan nuevas entregas ni reemplazos.'

@Injectable()
export class EntregasService {
  constructor(
    private readonly bd: BaseDeDatos,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  private exigirAlumno(contexto: ContextoUniversidad, seccion: SeccionEspacio) {
    if (contexto.rol !== 'ALUMNO' || seccion.rol !== 'ALUMNO') {
      throw new ForbiddenException(
        'Solo el alumno inscrito puede consultar y entregar su informe',
      )
    }
  }

  private async actividad(
    bd: Consulta,
    universidad: string,
    seccion: string,
    actividad: string,
    alumno: string,
  ) {
    const [fila] = await bd.query<{ plazo: Date }>(
      `SELECT a.plazo FROM actividad a
        JOIN seccion s ON s.id=a.seccion_id AND s.universidad_id=a.universidad_id
        JOIN curso c ON c.id=s.curso_id AND c.universidad_id=s.universidad_id
       WHERE a.universidad_id=$1 AND s.id=$2 AND a.id=$3
         AND a.archived_at IS NULL AND s.archived_at IS NULL AND c.archived_at IS NULL
       FOR SHARE OF s,c`,
      [universidad, seccion, actividad],
    )
    if (!fila) throw new NotFoundException('La actividad no existe')
    const [inscrito] = await bd.query(
      `SELECT i.id FROM inscripcion i JOIN usuario u ON u.id=i.usuario_id AND u.universidad_id=i.universidad_id
        WHERE i.universidad_id=$1 AND i.seccion_id=$2 AND i.usuario_id=$3
          AND i.archived_at IS NULL AND u.archived_at IS NULL AND u.rol='ALUMNO'
        FOR SHARE OF i,u`,
      [universidad, seccion, alumno],
    )
    if (!inscrito)
      throw new ForbiddenException('Ya no estás inscrito en esta sección')
    return fila
  }

  private async respuesta(
    bd: Consulta,
    universidad: string,
    actividad: string,
    alumno: string,
  ): Promise<MiEntregaActividad> {
    const [fila] = await bd.query<EntregaInforme>(
      `SELECT e.id, e.entregada_at AS "entregadaEn",
        json_build_object('id',f.id,'nombre',f.nombre,'tipo',f.tipo,'tamano',f.tamano,'subidoEn',f.subido_at) AS archivo
       FROM entrega e JOIN archivo f ON f.id=e.archivo_id AND f.universidad_id=e.universidad_id
       WHERE e.universidad_id=$1 AND e.actividad_id=$2 AND e.alumno_id=$3
       ORDER BY e.entregada_at DESC,e.id DESC LIMIT 1`,
      [universidad, actividad, alumno],
    )
    const [{ cerrada }] = await bd.query<{ cerrada: boolean }>(
      'SELECT plazo <= clock_timestamp() AS cerrada FROM actividad WHERE universidad_id=$1 AND id=$2',
      [universidad, actividad],
    )
    // pg entrega los timestamptz como Date; la respuesta pública usa ISO.
    return {
      entrega: fila
        ? { ...fila, entregadaEn: new Date(fila.entregadaEn).toISOString() }
        : null,
      cerrada,
    }
  }

  async obtener(
    contexto: ContextoUniversidad,
    alumno: string,
    seccion: SeccionEspacio,
    actividad: string,
  ): Promise<MiEntregaActividad> {
    this.exigirAlumno(contexto, seccion)
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await fijarUsuario(bd, alumno)
      await this.actividad(
        bd,
        contexto.universidadId,
        seccion.id,
        actividad,
        alumno,
      )
      return this.respuesta(bd, contexto.universidadId, actividad, alumno)
    })
  }

  async entregar(
    contexto: ContextoUniversidad,
    alumno: string,
    seccion: SeccionEspacio,
    actividad: string,
    datos: EntregarInforme,
  ): Promise<MiEntregaActividad> {
    this.exigirAlumno(contexto, seccion)
    try {
      return await this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
        await fijarUsuario(bd, alumno)
        await bd.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `entrega:${actividad.toLowerCase()}:${alumno.toLowerCase()}`,
        ])
        await this.actividad(
          bd,
          contexto.universidadId,
          seccion.id,
          actividad,
          alumno,
        )
        // Reintentar una confirmación aceptada no crea otra versión ni cambia
        // su hora, incluso si después cerró o S3 está temporalmente caído.
        const [aceptada] = await bd.query(
          'SELECT id FROM entrega WHERE universidad_id=$1 AND actividad_id=$2 AND alumno_id=$3 AND archivo_id=$4',
          [contexto.universidadId, actividad, alumno, datos.archivoId],
        )
        if (aceptada)
          return this.respuesta(bd, contexto.universidadId, actividad, alumno)
        if (
          (await this.respuesta(bd, contexto.universidadId, actividad, alumno))
            .cerrada
        )
          throw new ConflictException(CERRADA)
        const [archivo] = await bd.query<{
          clave: string
          tipo: string
          tamano: number
        }>(
          `SELECT clave,tipo,tamano FROM archivo WHERE universidad_id=$1 AND seccion_id=$2 AND id=$3
            AND subido_por=$4 AND subido_como='ALUMNO' AND subido_at IS NOT NULL AND archived_at IS NULL FOR SHARE`,
          [contexto.universidadId, seccion.id, datos.archivoId, alumno],
        )
        if (!archivo)
          throw new BadRequestException(
            'Elige un archivo propio, subido y confirmado en esta sección',
          )
        const objeto = await this.almacenamiento.objetoSubido(archivo.clave)
        if (
          !objeto ||
          objeto.tamano !== archivo.tamano ||
          objeto.tipo !== archivo.tipo
        ) {
          throw new ConflictException(
            'No pudimos verificar el archivo subido. Intenta subirlo nuevamente.',
          )
        }
        if (!objeto.version || objeto.version === 'null')
          throw new ServiceUnavailableException(
            'El almacenamiento no está listo para recibir entregas',
          )
        await bd.query(
          `INSERT INTO entrega (universidad_id,actividad_id,alumno_id,archivo_id,version_objeto)
          VALUES ($1,$2,$3,$4,$5)`,
          [
            contexto.universidadId,
            actividad,
            alumno,
            datos.archivoId,
            objeto.version,
          ],
        )
        return this.respuesta(bd, contexto.universidadId, actividad, alumno)
      })
    } catch (error) {
      if (
        (error as { driverError?: { constraint?: string } }).driverError
          ?.constraint === 'ck_entrega_plazo'
      )
        throw new ConflictException(CERRADA)
      throw error
    }
  }
}
