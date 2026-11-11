import { DIAS_SEMANA, type BloqueHorario } from '@cursus/shared'

// ESP-01: secciones del dashboard del profesor y la vista que abre cada una.
export const RUTA_MIS_SECCIONES = '/api/dashboard/mis-secciones'

export const rutaSeccion = (id: string) => `/mis-cursos/secciones/${id}`

// NOT-10: evaluaciones en revisión del profesor y la página que las lista.
export const RUTA_PENDIENTES_REVISION = '/api/dashboard/pendientes-revision'
export const RUTA_PAGINA_PENDIENTES = '/mis-cursos/pendientes-revision'

export const textoPendientes = (n: number) =>
  `${n} ${n === 1 ? 'evaluación pendiente' : 'evaluaciones pendientes'} de revisión`

export const textoSinNota = (n: number) =>
  `${n} ${n === 1 ? 'alumno sin nota' : 'alumnos sin nota'}`

export const textoBloque = (b: BloqueHorario) =>
  `${DIAS_SEMANA[b.dia - 1]} ${b.inicio}–${b.termino} · ${b.sala}`

export const textoAlumnos = (n: number) =>
  `${n} ${n === 1 ? 'alumno' : 'alumnos'}`

// GES-25: nombres de los profesores. Si la respuesta no trae profesores (un
// backend anterior durante un deploy desfasado), usa el campo deprecado.
export function nombresProfesores(seccion: {
  profesores?: string[]
  profesor?: { nombre: string } | string | null
}): string[] {
  if (seccion.profesores) return seccion.profesores
  if (!seccion.profesor) return []
  return [
    typeof seccion.profesor === 'string'
      ? seccion.profesor
      : seccion.profesor.nombre,
  ]
}

// GES-25: los profesores de una sección, separados por coma. Una tarjeta con
// un solo profesor se lee como antes.
export function textoProfesores(profesores: string[]): string {
  if (profesores.length === 0) return 'Sin profesor asignado'
  return `${profesores.length === 1 ? 'Profesor' : 'Profesores'} a cargo: ${profesores.join(', ')}`
}
