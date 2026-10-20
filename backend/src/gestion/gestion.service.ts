import type {
  CursoCreado,
  CursoDetalle,
  CursoListado,
  FiltroCursos,
  OpcionPeriodo,
  ProfesorOpcion,
  SeccionDetalle,
} from '@cursus/shared'
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

// Columnas de un curso, comunes al listado y al detalle.
const COLUMNAS_CURSO = `
  c.id, c.codigo, c.nombre, ca.nombre AS carrera_nombre,
  p.id AS periodo_id, p.anio, p.semestre, un.nombre AS universidad_nombre`

const DESDE_CURSO = `
  FROM curso c
  JOIN carrera ca ON ca.id = c.carrera_id
  JOIN periodo p ON p.id = c.periodo_id
  JOIN universidad un ON un.id = c.universidad_id`

// Secciones vigentes del curso (GES-08): la cantidad para el listado y la
// lista ordenada por número para el detalle, con el nombre del profesor a
// cargo (GES-12).
const CANTIDAD_SECCIONES = `
  (SELECT count(*)::int FROM seccion s
    WHERE s.curso_id = c.id AND s.archived_at IS NULL) AS secciones`
const LISTA_SECCIONES = `
  COALESCE((SELECT json_agg(json_build_object('id', s.id, 'numero', s.numero,
                                              'profesor', u.nombre)
                            ORDER BY s.numero)
              FROM seccion s
              LEFT JOIN usuario u ON u.id = s.profesor_id
             WHERE s.curso_id = c.id AND s.archived_at IS NULL), '[]') AS secciones`

const COLUMNAS_LISTADO = `${COLUMNAS_CURSO}, ${CANTIDAD_SECCIONES} ${DESDE_CURSO}`

interface FilaSeccion {
  id: string
  numero: number
  profesor?: string | null
}

// Horario, ayudantes y alumnos llegan con GES-10, 13 y 15.
const seccionDetalle = ({
  id,
  numero,
  profesor = null,
}: FilaSeccion): SeccionDetalle => ({
  id,
  numero,
  horario: null,
  profesor,
  ayudantes: [],
  alumnos: 0,
})

interface FilaDetalle extends Omit<FilaListado, 'secciones'> {
  secciones: FilaSeccion[]
}

interface FilaListado {
  id: string
  codigo: string
  nombre: string
  carrera_nombre: string
  periodo_id: string
  anio: number
  semestre: number
  universidad_nombre: string
  secciones: number
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
  // GES-04: carrera y período filtran solo si vienen (NULL = sin filtro), y
  // siempre como parámetros de la consulta. Un id de otra universidad no
  // calza con ningún curso visible, así que devuelve una lista vacía.
  async listarCursos(
    contexto: ContextoUniversidad,
    usuarioId: string,
    filtro: FiltroCursos = {},
  ): Promise<CursoListado[]> {
    const esDirector = contexto.rol === 'DIRECTOR'
    const carreraId = filtro.carreraId ?? null
    const periodoId = filtro.periodoId ?? null
    const filas = esDirector
      ? await this.bd.consultarEnTodasLasUniversidades<FilaListado>(
          contexto,
          `SELECT ${COLUMNAS_LISTADO}
            WHERE c.archived_at IS NULL
              AND ($1::uuid IS NULL OR c.carrera_id = $1)
              AND ($2::uuid IS NULL OR c.periodo_id = $2)
            ORDER BY p.activo DESC, c.codigo, un.nombre`,
          [carreraId, periodoId],
        )
      : await this.bd.consultarEnUniversidad<FilaListado>(
          contexto,
          `SELECT ${COLUMNAS_LISTADO}
            WHERE c.universidad_id = $1 AND c.archived_at IS NULL
              AND ca.facultad_id = ${facultadDe('$2')}
              AND ($3::uuid IS NULL OR c.carrera_id = $3)
              AND ($4::uuid IS NULL OR c.periodo_id = $4)
            ORDER BY p.activo DESC, c.codigo`,
          [usuarioId, carreraId, periodoId],
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
      secciones: fila.secciones,
      ...(esDirector && { universidadNombre: fila.universidad_nombre }),
    }))
  }

  // GES-08. Mismo criterio que listarCursos: el Director ve cualquier curso
  // (lectura READ ONLY), el resto solo los de su facultad. Un curso que no
  // existe, está archivado, es de otra universidad o de otra facultad
  // responde 404.
  async obtenerCurso(
    contexto: ContextoUniversidad,
    usuarioId: string,
    cursoId: string,
  ): Promise<CursoDetalle> {
    const esDirector = contexto.rol === 'DIRECTOR'
    const [fila] = esDirector
      ? await this.bd.consultarEnTodasLasUniversidades<FilaDetalle>(
          contexto,
          `SELECT ${COLUMNAS_CURSO}, ${LISTA_SECCIONES} ${DESDE_CURSO}
            WHERE c.id = $1 AND c.archived_at IS NULL`,
          [cursoId],
        )
      : await this.bd.consultarEnUniversidad<FilaDetalle>(
          contexto,
          `SELECT ${COLUMNAS_CURSO}, ${LISTA_SECCIONES} ${DESDE_CURSO}
            WHERE c.universidad_id = $1 AND c.id = $2
              AND c.archived_at IS NULL
              AND ca.facultad_id = ${facultadDe('$3')}`,
          [cursoId, usuarioId],
        )
    if (!fila) {
      throw new NotFoundException('El curso no existe')
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
      ...(esDirector && { universidadNombre: fila.universidad_nombre }),
      secciones: fila.secciones.map(seccionDetalle),
    }
  }

  // GES-09. Agrega la siguiente sección del curso, con el número correlativo.
  // El curso debe ser de la facultad del usuario y no estar archivado (si no,
  // 404). El FOR UPDATE sobre el curso serializa las creaciones simultáneas,
  // así que dos no toman el mismo número; uq_seccion_curso_numero queda como
  // última defensa (409). Las archivadas cuentan: su número no se reutiliza.
  async crearSeccion(
    contexto: ContextoUniversidad,
    usuarioId: string,
    cursoId: string,
  ): Promise<SeccionDetalle> {
    try {
      return await this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
        const parametros = [contexto.universidadId, cursoId]
        const [curso] = await bd.query<{ id: string }>(
          `SELECT c.id FROM curso c JOIN carrera ca ON ca.id = c.carrera_id
            WHERE c.universidad_id = $1 AND c.id = $2
              AND c.archived_at IS NULL
              AND ca.facultad_id = ${facultadDe('$3')}
              FOR UPDATE OF c`,
          [...parametros, usuarioId],
        )
        if (!curso) {
          throw new NotFoundException('El curso no existe')
        }
        const [seccion] = await bd.query<{ id: string; numero: number }>(
          `INSERT INTO seccion (universidad_id, curso_id, numero)
           SELECT $1, $2, COALESCE(MAX(numero), 0) + 1
             FROM seccion WHERE universidad_id = $1 AND curso_id = $2
           RETURNING id, numero`,
          parametros,
        )
        return seccionDetalle(seccion)
      })
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE) {
        throw new ConflictException('La sección ya existe, intenta de nuevo')
      }
      throw error
    }
  }

  // GES-12. Profesores de la universidad de la sesión, no archivados, para
  // elegir a quién asignar una sección. Incluye los de todas las facultades:
  // la tarjeta pide los de la universidad.
  async listarProfesores(
    contexto: ContextoUniversidad,
  ): Promise<ProfesorOpcion[]> {
    return this.bd.consultarEnUniversidad<ProfesorOpcion>(
      contexto,
      `SELECT id, nombre FROM usuario
        WHERE universidad_id = $1 AND rol = 'PROFESOR' AND archived_at IS NULL
        ORDER BY nombre, id`,
      [],
    )
  }

  // GES-12. Asigna el profesor a cargo de la sección, en una sola consulta.
  // Si ya tenía uno, lo reemplaza: la confirmación se pide en el frontend. La
  // sección debe ser de un curso de la facultad del usuario, y ni ella ni su
  // curso pueden estar archivados; el profesor debe ser de su universidad,
  // con el rol PROFESOR y sin archivar. Si no, no cambia nada y responde 404.
  async asignarProfesor(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
    profesorId: string,
  ): Promise<SeccionDetalle> {
    const [fila] = await this.bd.consultarEnUniversidad<FilaSeccion>(
      contexto,
      `WITH profesor AS (
         SELECT id, nombre FROM usuario
          WHERE universidad_id = $1 AND id = $3 AND rol = 'PROFESOR'
            AND archived_at IS NULL
       ), asignada AS (
         UPDATE seccion s SET profesor_id = profesor.id
           FROM profesor, curso c JOIN carrera ca ON ca.id = c.carrera_id
          WHERE s.universidad_id = $1 AND s.id = $2 AND s.archived_at IS NULL
            AND c.id = s.curso_id AND c.archived_at IS NULL
            AND ca.facultad_id = ${facultadDe('$4')}
         RETURNING s.id, s.numero
       )
       SELECT asignada.id, asignada.numero, profesor.nombre AS profesor
         FROM asignada, profesor`,
      [seccionId, profesorId, usuarioId],
    )
    if (!fila) {
      throw new NotFoundException('La sección o el profesor no existen')
    }
    return seccionDetalle(fila)
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
