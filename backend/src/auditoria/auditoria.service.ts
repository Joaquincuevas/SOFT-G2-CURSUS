import {
  TAMANO_PAGINA_EVENTOS,
  type EventoAcceso,
  type FiltroEventos,
  type PaginaEventos,
  type UniversidadDelFiltro,
} from '@cursus/shared'
import { Injectable } from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

interface Fila {
  id: string
  tipo: EventoAcceso['tipo']
  resultado: EventoAcceso['resultado']
  fecha: Date
  ip: string | null
  detalle: EventoAcceso['detalle']
  usuario_id: string | null
  usuario_nombre: string | null
  usuario_rol: string | null
  universidad_id: string | null
  universidad_nombre: string | null
}

// Filtros opcionales: un parámetro null no filtra. Un usuario o universidad que
// no existe da una lista vacía. $4 y $5 son instantes con zona horaria.
const DONDE = `
  WHERE ($1::uuid IS NULL OR e.usuario_id = $1::uuid)
    AND ($2::uuid IS NULL OR e.universidad_id = $2::uuid)
    AND ($3::text IS NULL OR e.tipo = $3::text)
    AND ($4::timestamptz IS NULL OR e.fecha >= $4::timestamptz)
    AND ($5::timestamptz IS NULL OR e.fecha <= $5::timestamptz)`

// SEG-05: lectura del registro de SEG-04 en la transacción READ ONLY del
// Director (consultarEnTodasLasUniversidades): la política de evento_auditoria
// deja leer a DIRECTOR y SUPERADMIN, y el Director ve todas las universidades
// (ADR 0001). Del usuario solo se toman el nombre y el rol; nunca el correo ni
// el hash. Orden (fecha DESC, id DESC), que cubren los índices de SEG-04.
@Injectable()
export class AuditoriaService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Opciones del filtro de universidad: las vigentes, por nombre.
  universidades(
    contexto: ContextoUniversidad,
  ): Promise<UniversidadDelFiltro[]> {
    return this.bd.consultarEnTodasLasUniversidades<UniversidadDelFiltro>(
      contexto,
      `SELECT id, nombre FROM universidad
        WHERE archived_at IS NULL ORDER BY nombre, id`,
    )
  }

  async eventos(
    contexto: ContextoUniversidad,
    filtro: FiltroEventos,
  ): Promise<PaginaEventos> {
    const pagina = filtro.pagina ?? 1
    const tamano = filtro.tamano ?? TAMANO_PAGINA_EVENTOS
    const parametros = [
      filtro.usuarioId ?? null,
      filtro.universidadId ?? null,
      filtro.tipo ?? null,
      filtro.desde ?? null,
      filtro.hasta ?? null,
    ]
    const [{ total }] = await this.bd.consultarEnTodasLasUniversidades<{
      total: string
    }>(
      contexto,
      `SELECT count(*) AS total FROM evento_auditoria e ${DONDE}`,
      parametros,
    )
    const filas = await this.bd.consultarEnTodasLasUniversidades<Fila>(
      contexto,
      `SELECT e.id, e.tipo, e.resultado, e.fecha, host(e.ip) AS ip, e.detalle,
              u.id AS usuario_id, u.nombre AS usuario_nombre,
              u.rol::text AS usuario_rol,
              un.id AS universidad_id, un.nombre AS universidad_nombre
         FROM evento_auditoria e
         LEFT JOIN usuario u ON u.id = e.usuario_id
         LEFT JOIN universidad un ON un.id = e.universidad_id
         ${DONDE}
        ORDER BY e.fecha DESC, e.id DESC
        LIMIT $6 OFFSET $7`,
      [...parametros, tamano, (pagina - 1) * tamano],
    )
    return {
      total: Number(total),
      pagina,
      tamano,
      eventos: filas.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        resultado: f.resultado,
        fecha: f.fecha.toISOString(),
        ip: f.ip,
        usuario: f.usuario_id
          ? {
              id: f.usuario_id,
              nombre: f.usuario_nombre as string,
              rol: f.usuario_rol as string,
            }
          : null,
        universidad: f.universidad_id
          ? { id: f.universidad_id, nombre: f.universidad_nombre as string }
          : null,
        detalle: f.detalle,
      })),
    }
  }
}
