import type { CursoCreado, CursoListado, OpcionPeriodo } from '@cursus/shared'
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { CrearCursoDto } from './crear-curso.dto.js'

// Código de PostgreSQL para una restricción única violada.
const UNIQUE = '23505'

// Facultad del usuario de la sesión: ni el JWT ni ContextoUniversidad la
// traen, así que se lee de su usuario ($1 = universidad, el parámetro dado =
// id del usuario).
const facultadDe = (parametro: string) =>
  `(SELECT facultad_id FROM usuario WHERE id = ${parametro} AND universidad_id = $1)`

// Columnas comunes del listado de cursos. secciones va en 0 hasta que exista
// la tabla de secciones (GES-09).
const COLUMNAS_LISTADO = `
  c.id, c.codigo, c.nombre, ca.nombre AS carrera_nombre,
  p.id AS periodo_id, p.anio, p.semestre, un.nombre AS universidad_nombre
  FROM curso c
  JOIN carrera ca ON ca.id = c.carrera_id
  JOIN periodo p ON p.id = c.periodo_id
  JOIN universidad un ON un.id = c.universidad_id`

interface FilaListado {
  id: string
  codigo: string
  nombre: string
  carrera_nombre: string
  periodo_id: string
  anio: number
  semestre: number
  universidad_nombre: string
}

interface FilaCurso {
  id: string
  codigo: string
  nombre: string
  carrera_nombre: string
  periodo_id: string
  anio: number
  semestre: number
}

// Gestión académica (GES-05). Toda consulta pasa por consultarEnUniversidad:
// $1 es la universidad de la sesión y RLS aplica en la base.
@Injectable()
export class GestionService {
  constructor(private readonly bd: BaseDeDatos) {}

  // GES-03. El Director ve los cursos de todas las universidades (lectura
  // READ ONLY), con el nombre de la universidad; el resto, los de la facultad
  // del usuario. Sin archivados, con el período activo primero.
  async listarCursos(
    contexto: ContextoUniversidad,
    usuarioId: string,
  ): Promise<CursoListado[]> {
    const esDirector = contexto.rol === 'DIRECTOR'
    const filas = esDirector
      ? await this.bd.consultarEnTodasLasUniversidades<FilaListado>(
          contexto,
          `SELECT ${COLUMNAS_LISTADO}
            WHERE c.archived_at IS NULL
            ORDER BY p.activo DESC, c.codigo, un.nombre`,
        )
      : await this.bd.consultarEnUniversidad<FilaListado>(
          contexto,
          `SELECT ${COLUMNAS_LISTADO}
            WHERE c.universidad_id = $1 AND c.archived_at IS NULL
              AND ca.facultad_id = ${facultadDe('$2')}
            ORDER BY p.activo DESC, c.codigo`,
          [usuarioId],
        )
    return filas.map((fila) => ({
      id: fila.id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      carreraNombre: fila.carrera_nombre,
      periodo: {
        id: fila.periodo_id,
        anio: fila.anio,
        semestre: fila.semestre,
      },
      secciones: 0,
      ...(esDirector && { universidadNombre: fila.universidad_nombre }),
    }))
  }

  // Inserta el curso en una sola consulta, solo si la carrera es de la
  // facultad del usuario (y no está archivada) y el período es de su
  // universidad. Si no, no inserta nada y responde 404. Un código repetido en
  // el período responde 409.
  async crearCurso(
    contexto: ContextoUniversidad,
    usuarioId: string,
    datos: CrearCursoDto,
  ): Promise<CursoCreado> {
    let filas: FilaCurso[]
    try {
      filas = await this.bd.consultarEnUniversidad<FilaCurso>(
        contexto,
        `WITH carrera_ok AS (
           SELECT id, nombre FROM carrera
            WHERE universidad_id = $1 AND id = $2 AND archived_at IS NULL
              AND facultad_id = ${facultadDe('$4')}
         ), periodo_ok AS (
           SELECT id, anio, semestre FROM periodo
            WHERE universidad_id = $1 AND id = $3
         ), nuevo AS (
           INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
           SELECT $1, carrera_ok.id, periodo_ok.id, $5, $6
             FROM carrera_ok, periodo_ok
           RETURNING id, codigo, nombre
         )
         SELECT nuevo.id, nuevo.codigo, nuevo.nombre,
                carrera_ok.nombre AS carrera_nombre,
                periodo_ok.id AS periodo_id, periodo_ok.anio, periodo_ok.semestre
           FROM nuevo, carrera_ok, periodo_ok`,
        [
          datos.carreraId,
          datos.periodoId,
          usuarioId,
          datos.codigo,
          datos.nombre,
        ],
      )
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE) {
        throw new ConflictException(
          `Ya existe un curso con el código ${datos.codigo} en el período ${await this.nombrePeriodo(contexto, datos.periodoId)}`,
        )
      }
      throw error
    }

    const [fila] = filas
    if (!fila) {
      throw new NotFoundException('La carrera o el período no existen')
    }
    return {
      id: fila.id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      carreraNombre: fila.carrera_nombre,
      periodo: {
        id: fila.periodo_id,
        anio: fila.anio,
        semestre: fila.semestre,
      },
    }
  }

  private async nombrePeriodo(
    contexto: ContextoUniversidad,
    periodoId: string,
  ): Promise<string> {
    const { anio, semestre } = await this.bd.obtenerEnUniversidad<
      Pick<OpcionPeriodo, 'anio' | 'semestre'>
    >(
      contexto,
      'SELECT anio, semestre FROM periodo WHERE universidad_id = $1 AND id = $2',
      [periodoId],
    )
    return `${anio}-${semestre}`
  }
}
