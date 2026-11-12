import type { AlumnosSeccion } from './cursos.js'

export const ROLES_INTEGRANTES = ['PROFESOR', 'AYUDANTE', 'ALUMNO'] as const
export type RolIntegrante = (typeof ROLES_INTEGRANTES)[number]
export interface PersonaIntegrante {
  id: string
  nombre: string
  correo: string
  rol: RolIntegrante
}
export interface IntegrantesSeccion {
  seccion: AlumnosSeccion['seccion']
  integrantes: PersonaIntegrante[]
}
export interface BusquedaIntegrantes {
  personas: PersonaIntegrante[]
  hayMas: boolean
}
export interface AgregarIntegrante {
  rol: RolIntegrante
  usuarioId: string
}
export interface QuitarIntegrante {
  rol: RolIntegrante
  motivo: string
}
