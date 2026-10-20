// GES-10: horario semanal, en hora local de la universidad.
export const DIAS_SEMANA = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const

export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7
export const MAX_BLOQUES_HORARIO = 100
export const LARGO_SALA = 100

export interface BloqueHorario {
  dia: DiaSemana
  inicio: string // HH:mm
  termino: string // HH:mm, posterior al inicio en el mismo día
  sala: string
}

export interface GuardarHorario {
  version: number
  bloques: BloqueHorario[]
}

export interface HorarioSeccion extends GuardarHorario {
  resumen: string | null
}

export function resumirHorario(
  bloques: readonly BloqueHorario[],
): string | null {
  if (bloques.length === 0) return null
  return [...bloques]
    .sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio))
    .map(
      (b) => `${DIAS_SEMANA[b.dia - 1]} ${b.inicio}–${b.termino} · ${b.sala}`,
    )
    .join('; ')
}
