import { NOTA_MAXIMA, NOTA_MINIMA, type TipoEventoNota } from '@cursus/shared'
import { Injectable } from '@nestjs/common'
import type { BaseDeDatos } from '../database/base-de-datos.service.js'

// Un evento de la auditoría de notas (NOT-04). Las notas van de 1,0 a 7,0
// con un decimal; se aceptan como número o como el string que PostgreSQL
// devuelve para un numeric.
export interface EventoNota {
  universidadId: string
  evaluacionId: string
  // Solo en PROPUESTA y RECORRECCION; nulo en los eventos de la evaluación.
  alumnoId?: string | null
  tipo: TipoEventoNota
  notaAnterior?: number | string | null
  notaNueva?: number | string | null
  // Obligatorio en DEVOLUCION y RECORRECCION.
  motivo?: string | null
  // Quien hizo la acción.
  usuarioId: string
}

// Nota en décimas (por ejemplo, 5,5 -> 55), o null. Rechaza lo que no es una
// nota de 1,0 a 7,0 con un decimal: la columna numeric(2,1) la redondearía
// (0,95 quedaría como 1,0) y la auditoría guardaría una nota que nadie puso.
function enDecimas(nota: number | string | null | undefined): number | null {
  if (nota === null || nota === undefined) return null
  const valor = Number(nota)
  const decimas = Math.round(valor * 10)
  if (
    !Number.isFinite(valor) ||
    Math.abs(valor * 10 - decimas) > 1e-9 ||
    decimas < NOTA_MINIMA * 10 ||
    decimas > NOTA_MAXIMA * 10
  ) {
    throw new RangeError(
      `Nota inválida (${String(nota)}): debe ir de 1,0 a 7,0 con un decimal`,
    )
  }
  return decimas
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
  // distinta de la nueva, comparadas ya normalizadas): guardar varias veces el
  // mismo borrador (NOT-07) no llena la auditoría de filas iguales. Devuelve
  // el id del evento, o null si no se registró nada. Una nota mal formada
  // lanza RangeError antes de tocar la base, para no abortar la transacción
  // de quien llama con un error de CHECK.
  async registrar(
    bd: Pick<BaseDeDatos, 'query'>,
    evento: EventoNota,
  ): Promise<string | null> {
    const anterior = enDecimas(evento.notaAnterior)
    const nueva = enDecimas(evento.notaNueva)
    if (evento.tipo === 'PROPUESTA' && nueva !== null && anterior === nueva) {
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
        anterior === null ? null : anterior / 10,
        nueva === null ? null : nueva / 10,
        evento.motivo ?? null,
        evento.usuarioId,
      ],
    )
    return fila.id
  }
}
