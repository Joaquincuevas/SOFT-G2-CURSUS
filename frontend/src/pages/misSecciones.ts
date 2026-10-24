import { DIAS_SEMANA, type BloqueHorario } from '@cursus/shared'

// ESP-01: secciones del dashboard del profesor y la vista que abre cada una.
export const RUTA_MIS_SECCIONES = '/api/dashboard/mis-secciones'

export const rutaSeccion = (id: string) => `/mis-cursos/secciones/${id}`

export const textoBloque = (b: BloqueHorario) =>
  `${DIAS_SEMANA[b.dia - 1]} ${b.inicio}–${b.termino} · ${b.sala}`

export const textoAlumnos = (n: number) =>
  `${n} ${n === 1 ? 'alumno' : 'alumnos'}`
