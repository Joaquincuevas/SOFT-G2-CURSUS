import type {
  AsignacionQuitada,
  AyudanteQuitado,
  AyudanteResumen,
} from '@cursus/shared'
import { Injectable, NotFoundException } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

// Sección vigente (ella y su curso sin archivar) de un curso de la facultad
// del usuario de la sesión ($1 = universidad, $2 = sección, $3 = usuario), con
// el mismo criterio que asignar profesor (GES-12) y ayudantes (GES-13). La
// bloquea para serializar los cambios de asignación de la sección.
const SECCION_EDITABLE = `
  SELECT s.id, s.profesor_id FROM seccion s
    JOIN curso c ON c.id = s.curso_id
    JOIN carrera ca ON ca.id = c.carrera_id
   WHERE s.universidad_id = $1 AND s.id = $2
     AND s.archived_at IS NULL AND c.archived_at IS NULL
     AND ca.facultad_id = (SELECT facultad_id FROM usuario
                            WHERE universidad_id = $1 AND id = $3)
   FOR UPDATE OF s, c`

// Registra el cambio en el historial y devuelve la entrada con los nombres.
// $1 = universidad, $2 = sección, $3 = tipo, $4 = persona quitada,
// $5 = responsable, $6 = motivo. nuevo_id queda en NULL: es una baja.
const REGISTRAR_QUITADA = `
  WITH registro AS (
    INSERT INTO asignacion_cambio
      (universidad_id, seccion_id, tipo, anterior_id, nuevo_id, responsable_id, motivo)
    VALUES ($1, $2, $3, $4, NULL, $5, $6)
    RETURNING anterior_id, responsable_id, motivo, fecha
  )
  SELECT q.id AS quitado_id, q.nombre AS quitado_nombre,
         r.id AS por_id, r.nombre AS por_nombre, registro.motivo, registro.fecha
    FROM registro
    JOIN usuario q ON q.id = registro.anterior_id
    JOIN usuario r ON r.id = registro.responsable_id`

interface FilaRegistro {
  quitado_id: string
  quitado_nombre: string
  por_id: string
  por_nombre: string
  motivo: string
  fecha: Date
}

const aQuitada = (fila: FilaRegistro): AsignacionQuitada => ({
  quitado: { id: fila.quitado_id, nombre: fila.quitado_nombre },
  quitadoEn: fila.fecha.toISOString(),
  quitadoPor: { id: fila.por_id, nombre: fila.por_nombre },
  motivo: fila.motivo,
})

// GES-14. Quitar al profesor o a un ayudante de una sección para corregir una
// asignación equivocada. Nada se borra: el profesor queda en NULL, la
// asignación del ayudante se archiva, y cada baja queda en asignacion_cambio
// con fecha, responsable, persona quitada y motivo, en la misma transacción.
@Injectable()
export class AsignacionesService {
  constructor(private readonly bd: BaseDeDatos) {}

  async quitarProfesor(
    contexto: ContextoUniversidad,
    responsableId: string,
    seccionId: string,
    motivo: string,
  ): Promise<AsignacionQuitada> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const universidad = contexto.universidadId
      const [seccion] = await bd.query<{ profesor_id: string | null }>(
        SECCION_EDITABLE,
        [universidad, seccionId, responsableId],
      )
      if (!seccion) throw new NotFoundException('La sección no existe')
      if (!seccion.profesor_id) {
        throw new NotFoundException('La sección no tiene profesor asignado')
      }
      await bd.query(
        `UPDATE seccion SET profesor_id = NULL
          WHERE universidad_id = $1 AND id = $2`,
        [universidad, seccionId],
      )
      const [fila] = await bd.query<FilaRegistro>(REGISTRAR_QUITADA, [
        universidad,
        seccionId,
        'PROFESOR',
        seccion.profesor_id,
        responsableId,
        motivo,
      ])
      return aQuitada(fila)
    })
  }

  async quitarAyudante(
    contexto: ContextoUniversidad,
    responsableId: string,
    seccionId: string,
    ayudanteId: string,
    motivo: string,
  ): Promise<AyudanteQuitado> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const universidad = contexto.universidadId
      const [seccion] = await bd.query(SECCION_EDITABLE, [
        universidad,
        seccionId,
        responsableId,
      ])
      if (!seccion) throw new NotFoundException('La sección no existe')
      // Archivar deja volver a asignarlo: el índice único es solo de las
      // asignaciones activas. En un CTE porque TypeORM devuelve
      // [filas, afectadas] para un UPDATE suelto.
      const archivadas = await bd.query<{ usuario_id: string }>(
        `WITH archivada AS (
           UPDATE ayudante_seccion SET archived_at = now()
            WHERE universidad_id = $1 AND seccion_id = $2 AND usuario_id = $3
              AND archived_at IS NULL
           RETURNING usuario_id
         )
         SELECT usuario_id FROM archivada`,
        [universidad, seccionId, ayudanteId],
      )
      if (archivadas.length === 0) {
        throw new NotFoundException(
          'El ayudante no está asignado a esta sección',
        )
      }
      const [fila] = await bd.query<FilaRegistro>(REGISTRAR_QUITADA, [
        universidad,
        seccionId,
        'AYUDANTE',
        ayudanteId,
        responsableId,
        motivo,
      ])
      // Los que siguen asignados, con el mismo criterio que GES-13.
      const ayudantes = await bd.query<AyudanteResumen>(
        `SELECT u.id, u.nombre, u.correo FROM ayudante_seccion a
           JOIN usuario u ON u.id = a.usuario_id
          WHERE a.universidad_id = $1 AND a.seccion_id = $2
            AND a.archived_at IS NULL AND u.archived_at IS NULL
            AND u.rol = 'AYUDANTE'
          ORDER BY u.nombre, u.correo, u.id`,
        [universidad, seccionId],
      )
      return { ...aQuitada(fila), ayudantes }
    })
  }
}
