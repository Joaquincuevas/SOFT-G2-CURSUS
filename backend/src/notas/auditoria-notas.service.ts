import type { TipoEventoNota } from '@cursus/shared'
import { Injectable } from '@nestjs/common'
import type { BaseDeDatos } from '../database/base-de-datos.service.js'

// Un evento de la auditoría de notas (NOT-04). Las notas van de 1,0 a 7,0
// con un decimal.
export interface EventoNota {
  universidadId: string
  evaluacionId: string
  // Solo en PROPUESTA y RECORRECCION; nulo en los eventos de la evaluación.
  alumnoId?: string | null
  tipo: TipoEventoNota
  notaAnterior?: number | null
  notaNueva?: number | null
  // Obligatorio en DEVOLUCION y RECORRECCION.
  motivo?: string | null
  // Quien hizo la acción.
  usuarioId: string
}

// NOT-04 (RN-12): registra los eventos de la auditoría de notas en
// nota_cambio. La tabla es de solo adición: no hay forma de editar ni borrar
// un evento desde la aplicación.
@Injectable()
export class AuditoriaNotasService {
  // Registra el evento con la conexión de la transacción en curso (la de
  // BaseDeDatos.enTransaccionEnUniversidad), para que quede junto con el
  // cambio de la nota: si la transacción se revierte, el evento también.
  //
  // Una PROPUESTA solo se registra cuando la nota cambia (nota anterior
  // distinta de la nueva): guardar varias veces el mismo borrador (NOT-07) no
  // llena la auditoría de filas iguales. Devuelve el id del evento, o null si
  // no se registró nada.
  async registrar(
    bd: Pick<BaseDeDatos, 'query'>,
    evento: EventoNota,
  ): Promise<string | null> {
    const anterior = evento.notaAnterior ?? null
    const nueva = evento.notaNueva ?? null
    if (evento.tipo === 'PROPUESTA' && anterior === nueva) {
      return null
    }
    const [fila] = await bd.query<{ id: string }>(
      `INSERT INTO nota_cambio (universidad_id, evaluacion_id, alumno_id, tipo,
                                nota_anterior, nota_nueva, motivo, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        evento.universidadId,
        evento.evaluacionId,
        evento.alumnoId ?? null,
        evento.tipo,
        anterior,
        nueva,
        evento.motivo ?? null,
        evento.usuarioId,
      ],
    )
    return fila.id
  }
}
