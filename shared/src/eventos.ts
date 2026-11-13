// SEG-05: GET /api/auditoria/eventos, solo para el Director. Consulta el
// registro de solo adición de SEG-04 (evento_auditoria), del más reciente al
// más antiguo. No expone contraseñas, tokens, correos digitados ni valores de
// notas: solo lo que SEG-04 define como visible.

export const TIPOS_EVENTO = [
  'INICIO_SESION',
  'CAMBIO_NOTA',
  'ASIGNACION',
  'CIERRE_CURSO',
] as const
export type TipoEvento = (typeof TIPOS_EVENTO)[number]

export const RESULTADOS_EVENTO = ['EXITOSO', 'FALLIDO', 'BLOQUEADO'] as const
export type ResultadoEvento = (typeof RESULTADOS_EVENTO)[number]

export const TAMANO_PAGINA_EVENTOS = 25
export const TAMANO_MAXIMO_EVENTOS = 100

// Query de la consulta. Todo es opcional y se combina. desde y hasta son
// instantes ISO 8601 con zona horaria (ambos inclusive).
export interface FiltroEventos {
  usuarioId?: string
  universidadId?: string
  tipo?: TipoEvento
  desde?: string
  hasta?: string
  pagina?: number
  tamano?: number
}

export interface EventoAcceso {
  id: string
  tipo: TipoEvento
  resultado: ResultadoEvento
  // Instante ISO 8601 en UTC.
  fecha: string
  // Solo los inicios de sesión; null si no había una IP confiable.
  ip: string | null
  // null: el intento no corresponde a ninguna cuenta vigente (o es un
  // superadmin, que no tiene universidad).
  usuario: { id: string; nombre: string; rol: string } | null
  universidad: { id: string; nombre: string } | null
  // Solo las claves que SEG-04 permite: credencialProvisoria, subtipo,
  // origen y origenId.
  detalle: Record<string, string | boolean>
}

export interface PaginaEventos {
  total: number
  pagina: number
  tamano: number
  eventos: EventoAcceso[]
}

// GET /api/auditoria/universidades: las opciones del filtro de universidad.
export interface UniversidadDelFiltro {
  id: string
  nombre: string
}
