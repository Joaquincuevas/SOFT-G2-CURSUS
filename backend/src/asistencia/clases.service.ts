import {
  type Clase,
  DIAS_SEMANA,
  type SeccionEspacio,
  ZONA_HORARIA_UNIVERSIDAD,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import type { CrearClaseDto } from './crear-clase.dto.js'

// Código de PostgreSQL para una restricción única violada.
const UNIQUE = '23505'
const CLASE_UNICA = 'ux_clase_seccion_fecha_inicio_activa'

// La base devuelve fechas y horas como texto, sin conversión de zona horaria.
const COLUMNAS = `c.id, to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
  to_char(c.inicio, 'HH24:MI') AS inicio, to_char(c.termino, 'HH24:MI') AS termino,
  c.sala`

interface Validacion {
  fecha: string
  dia: number
  en_periodo: boolean
  periodo_inicio: string
  periodo_termino: string
  tiene_horario: boolean
  bloque: { inicio: string; termino: string; sala: string } | null
}

// ASI-01 (RN-13): clases de una sección que IntegranteSeccionGuard ya
// verificó. El controlador decide quién lee y quién crea.
@Injectable()
export class ClasesService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Activas, por fecha y hora de inicio. El Director las lee en cualquier
  // universidad, en una transacción READ ONLY.
  async listar(
    contexto: ContextoUniversidad,
    seccion: SeccionEspacio,
  ): Promise<Clase[]> {
    const orden = 'ORDER BY c.fecha, c.inicio, c.id'
    return contexto.rol === 'DIRECTOR'
      ? this.bd.consultarEnTodasLasUniversidades<Clase>(
          contexto,
          `SELECT ${COLUMNAS} FROM clase c
            WHERE c.seccion_id = $1 AND c.archived_at IS NULL ${orden}`,
          [seccion.id],
        )
      : this.bd.consultarEnUniversidad<Clase>(
          contexto,
          `SELECT ${COLUMNAS} FROM clase c
            WHERE c.universidad_id = $1 AND c.seccion_id = $2
              AND c.archived_at IS NULL ${orden}`,
          [seccion.id],
        )
  }

  // La fecha (por defecto, hoy en la zona de la universidad) debe estar
  // dentro del período del curso, y `inicio` debe ser un bloque activo del
  // horario en ese día de la semana; la clase copia ese bloque. Una clase
  // repetida (misma sección, fecha y bloque) responde 409.
  async crear(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    datos: CrearClaseDto,
  ): Promise<Clase> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const [v] = await bd.query<Validacion>(
        `WITH f AS (
           SELECT COALESCE($3::date, (now() AT TIME ZONE $5)::date) AS fecha
         )
         SELECT to_char(f.fecha, 'YYYY-MM-DD') AS fecha,
                EXTRACT(ISODOW FROM f.fecha)::int AS dia,
                f.fecha BETWEEN p.fecha_inicio AND p.fecha_termino AS en_periodo,
                to_char(p.fecha_inicio, 'YYYY-MM-DD') AS periodo_inicio,
                to_char(p.fecha_termino, 'YYYY-MM-DD') AS periodo_termino,
                EXISTS (SELECT 1 FROM horario_seccion h
                         WHERE h.universidad_id = $1 AND h.seccion_id = s.id
                           AND h.archived_at IS NULL) AS tiene_horario,
                (SELECT json_build_object(
                          'inicio', to_char(h.inicio, 'HH24:MI'),
                          'termino', to_char(h.termino, 'HH24:MI'),
                          'sala', h.sala)
                   FROM horario_seccion h
                  WHERE h.universidad_id = $1 AND h.seccion_id = s.id
                    AND h.archived_at IS NULL
                    AND h.dia = EXTRACT(ISODOW FROM f.fecha)
                    AND h.inicio = $4::time) AS bloque
           FROM f, seccion s
           JOIN curso c ON c.id = s.curso_id
           JOIN periodo p ON p.id = c.periodo_id
          WHERE s.universidad_id = $1 AND s.id = $2`,
        [
          contexto.universidadId,
          seccion.id,
          datos.fecha ?? null,
          datos.inicio,
          ZONA_HORARIA_UNIVERSIDAD,
        ],
      )
      if (!v.en_periodo) {
        throw new BadRequestException(
          `La fecha debe estar dentro del período del curso (del ${v.periodo_inicio} al ${v.periodo_termino})`,
        )
      }
      if (!v.tiene_horario) {
        throw new BadRequestException(
          'La sección aún no tiene horario; lo carga el Administrativo',
        )
      }
      if (!v.bloque) {
        throw new BadRequestException(
          `La sección no tiene un bloque el ${DIAS_SEMANA[v.dia - 1].toLowerCase()} a las ${datos.inicio}`,
        )
      }
      try {
        const [creada] = await bd.query<Clase>(
          `INSERT INTO clase (universidad_id, seccion_id, fecha, inicio, termino, sala, creada_por)
           VALUES ($1, $2, $3::date, $4::time, $5::time, $6, $7)
           RETURNING id, to_char(fecha, 'YYYY-MM-DD') AS fecha,
                     to_char(inicio, 'HH24:MI') AS inicio,
                     to_char(termino, 'HH24:MI') AS termino, sala`,
          [
            contexto.universidadId,
            seccion.id,
            v.fecha,
            v.bloque.inicio,
            v.bloque.termino,
            v.bloque.sala,
            usuarioId,
          ],
        )
        return creada
      } catch (error) {
        const { code, constraint } = error as {
          code?: string
          constraint?: string
        }
        if (code === UNIQUE && constraint === CLASE_UNICA) {
          throw new ConflictException(
            `Ya existe una clase de esta sección el ${v.fecha} en el bloque de las ${v.bloque.inicio}`,
          )
        }
        throw error
      }
    })
  }
}
