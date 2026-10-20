import { randomBytes } from 'node:crypto'
import type {
  AlumnoAgregado,
  AlumnosSeccion,
  CursoCreado,
  CursoDetalle,
  CursoListado,
  FiltroCursos,
  OpcionPeriodo,
  SeccionDetalle,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { hash } from 'argon2'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { AgregarAlumnoDto } from './agregar-alumno.dto.js'
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
  p.id AS periodo_id, p.anio, p.semestre, un.id AS universidad_id,
  un.nombre AS universidad_nombre`

const DESDE_CURSO = `
  FROM curso c
  JOIN carrera ca ON ca.id = c.carrera_id
  JOIN periodo p ON p.id = c.periodo_id
  JOIN universidad un ON un.id = c.universidad_id`

// Secciones vigentes del curso (GES-08): la cantidad para el listado y la
// lista ordenada por número para el detalle.
const CANTIDAD_SECCIONES = `
  (SELECT count(*)::int FROM seccion s
    WHERE s.curso_id = c.id AND s.archived_at IS NULL) AS secciones`
// GES-15: alumnos es la cantidad de inscripciones activas de la sección.
const LISTA_SECCIONES = `
  COALESCE((SELECT json_agg(json_build_object(
                     'id', s.id, 'numero', s.numero,
                     'ayudantes', (SELECT COALESCE(json_agg(u.nombre ORDER BY u.nombre, u.correo, u.id), '[]')
                                     FROM ayudante_seccion a JOIN usuario u ON u.id = a.usuario_id
                                    WHERE a.seccion_id = s.id AND a.archived_at IS NULL
                                      AND u.archived_at IS NULL AND u.rol = 'AYUDANTE'),
                     'alumnos', (SELECT count(*) FROM inscripcion i
                                  WHERE i.seccion_id = s.id
                                    AND i.archived_at IS NULL))
                   ORDER BY s.numero)
              FROM seccion s
             WHERE s.curso_id = c.id AND s.archived_at IS NULL), '[]') AS secciones`

const COLUMNAS_LISTADO = `${COLUMNAS_CURSO}, ${CANTIDAD_SECCIONES} ${DESDE_CURSO}`

// Horario y profesor llegan con GES-10 y 12. Una sección
// recién creada no tiene alumnos.
const seccionDetalle = ({
  id,
  numero,
  alumnos = 0,
  ayudantes = [],
}: {
  id: string
  numero: number
  alumnos?: number
  ayudantes?: string[]
}): SeccionDetalle => ({
  id,
  numero,
  horario: null,
  profesor: null,
  ayudantes,
  alumnos,
})

// Contraseña provisoria de una cuenta creada por el administrativo (GES-15):
// 16 caracteres sin los que se confunden al leerlos (0/O, 1/I). Son 32
// símbolos, así que cada byte aleatorio elige uno sin sesgo (256 % 32 = 0).
const SIMBOLOS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const generarPasswordProvisoria = () =>
  Array.from(randomBytes(16), (byte) => SIMBOLOS[byte % SIMBOLOS.length]).join(
    '',
  )

// Sección vigente (ella y su curso sin archivar) de la universidad de la
// sesión ($1 = universidad, $2 = sección), para agregar y listar alumnos. Le
// sigue el filtro de facultad, salvo para el Director.
const SECCION_VIGENTE = `
  FROM seccion s
  JOIN curso c ON c.id = s.curso_id
  JOIN carrera ca ON ca.id = c.carrera_id
 WHERE s.universidad_id = $1 AND s.id = $2
   AND s.archived_at IS NULL AND c.archived_at IS NULL`

const SECCION_INSCRIBIBLE = `SELECT ca.facultad_id,
  (SELECT dominio_correo FROM universidad WHERE id = $1) AS dominio_correo
  ${SECCION_VIGENTE} AND ca.facultad_id = ${facultadDe('$3')}`

// Alumnos con inscripción activa en la sección s, en orden alfabético en
// español (la collation ICU ordena bien tildes y ñ) y después por correo.
const ALUMNOS_SECCION = `
  COALESCE((SELECT json_agg(json_build_object(
                     'id', u.id, 'nombre', u.nombre, 'correo', u.correo)
                   ORDER BY u.nombre COLLATE "es-CL-x-icu", u.correo)
              FROM inscripcion i JOIN usuario u ON u.id = i.usuario_id
             WHERE i.seccion_id = s.id AND i.archived_at IS NULL), '[]') AS alumnos`

interface FilaAlumnosSeccion {
  id: string
  numero: number
  curso_id: string
  codigo: string
  curso_nombre: string
  alumnos: AlumnosSeccion['alumnos']
}

interface FilaSeccionInscripcion {
  facultad_id: string
  dominio_correo: string
}

interface FilaAlumno {
  id: string
  nombre: string
  correo: string
  rol: string
  archived_at: string | null
}

interface FilaDetalle extends Omit<FilaListado, 'secciones'> {
  secciones: {
    id: string
    numero: number
    alumnos: number
    ayudantes: string[]
  }[]
}

interface FilaListado {
  id: string
  codigo: string
  nombre: string
  carrera_nombre: string
  periodo_id: string
  anio: number
  semestre: number
  universidad_id: string
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
      ...(esDirector && {
        universidadId: fila.universidad_id,
        universidadNombre: fila.universidad_nombre,
      }),
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

  // GES-18. Alumnos inscritos en una sección vigente, con el mismo criterio
  // que agregarAlumno: de la facultad del usuario (si no, 404). El Director
  // ve las secciones de toda su universidad, pero no las de otras (404).
  async listarAlumnos(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
  ): Promise<AlumnosSeccion> {
    const esDirector = contexto.rol === 'DIRECTOR'
    const [fila] = await this.bd.consultarEnUniversidad<FilaAlumnosSeccion>(
      contexto,
      `SELECT s.id, s.numero, c.id AS curso_id, c.codigo,
              c.nombre AS curso_nombre, ${ALUMNOS_SECCION}
         ${SECCION_VIGENTE}
         ${esDirector ? '' : `AND ca.facultad_id = ${facultadDe('$3')}`}`,
      esDirector ? [seccionId] : [seccionId, usuarioId],
    )
    if (!fila) {
      throw new NotFoundException('La sección no existe')
    }
    return {
      seccion: {
        id: fila.id,
        numero: fila.numero,
        curso: {
          id: fila.curso_id,
          codigo: fila.codigo,
          nombre: fila.curso_nombre,
        },
      },
      alumnos: fila.alumnos,
      total: fila.alumnos.length,
    }
  }

  // GES-15. Inscribe a un alumno en una sección por su correo institucional,
  // en una transacción. La sección (no archivada) debe ser de un curso vigente
  // de la facultad del usuario; si no, 404. El correo debe ser del dominio de
  // la universidad. Si el alumno no tiene cuenta, se crea con una contraseña
  // provisoria, que solo va en esta respuesta (en la base queda su hash).
  async agregarAlumno(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
    datos: AgregarAlumnoDto,
  ): Promise<AlumnoAgregado> {
    try {
      return await this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
        const universidad = contexto.universidadId
        const [seccion] = await bd.query<FilaSeccionInscripcion>(
          SECCION_INSCRIBIBLE,
          [universidad, seccionId, usuarioId],
        )
        if (!seccion) {
          throw new NotFoundException('La sección no existe')
        }
        if (datos.correo.split('@')[1] !== seccion.dominio_correo) {
          throw new BadRequestException(
            `El correo debe ser @${seccion.dominio_correo}`,
          )
        }

        let [alumno] = await bd.query<FilaAlumno>(
          `SELECT id, nombre, correo, rol, archived_at FROM usuario
            WHERE universidad_id = $1 AND lower(correo) = $2`,
          [universidad, datos.correo],
        )
        if (alumno && alumno.rol !== 'ALUMNO') {
          throw new ConflictException(
            `Ese correo pertenece a un ${alumno.rol.toLowerCase()}`,
          )
        }
        // Una cuenta archivada no se reactiva desde aquí.
        if (alumno?.archived_at) {
          throw new ConflictException('La cuenta de ese alumno está archivada')
        }

        let passwordProvisoria: string | undefined
        if (!alumno) {
          if (!datos.nombre) {
            throw new BadRequestException('Ingresa el nombre del alumno')
          }
          passwordProvisoria = generarPasswordProvisoria()
          ;[alumno] = await bd.query<FilaAlumno>(
            `INSERT INTO usuario (universidad_id, facultad_id, nombre, correo, password_hash, rol)
             VALUES ($1, $2, $3, $4, $5, 'ALUMNO')
             RETURNING id, nombre, correo, rol, archived_at`,
            [
              universidad,
              seccion.facultad_id,
              datos.nombre,
              datos.correo,
              await hash(passwordProvisoria),
            ],
          )
        }

        await bd.query(
          `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
           VALUES ($1, $2, $3)`,
          [universidad, seccionId, alumno.id],
        )
        return {
          alumno: {
            id: alumno.id,
            nombre: alumno.nombre,
            correo: alumno.correo,
          },
          cuentaCreada: passwordProvisoria !== undefined,
          ...(passwordProvisoria && { passwordProvisoria }),
        }
      })
    } catch (error) {
      const { code, constraint } = error as {
        code?: string
        constraint?: string
      }
      if (code === UNIQUE && constraint === 'ux_inscripcion_seccion_usuario') {
        throw new ConflictException(
          'El alumno ya está inscrito en esta sección',
        )
      }
      // Otra petición creó la misma cuenta al mismo tiempo.
      if (code === UNIQUE) {
        throw new ConflictException(
          'No se pudo agregar al alumno, intenta de nuevo',
        )
      }
      throw error
    }
  }

  async validarSeccionInscripcion(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
  ): Promise<void> {
    await this.bd.obtenerEnUniversidad<FilaSeccionInscripcion>(
      contexto,
      SECCION_INSCRIBIBLE,
      [seccionId, usuarioId],
    )
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
