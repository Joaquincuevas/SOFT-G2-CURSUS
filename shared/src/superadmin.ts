// MT-04: el superadmin elige una universidad y una facultad, y dentro de ella
// trabaja con las vistas del Administrativo.

export interface FacultadElegible {
  id: string
  nombre: string
}

// Respuesta de GET /api/superadmin/universidades: las universidades vigentes,
// cada una con sus facultades vigentes.
export interface UniversidadElegible {
  id: string
  nombre: string
  facultades: FacultadElegible[]
}

// Body de PUT /api/superadmin/contexto. Responde con el UsuarioSesion nuevo.
export interface ElegirContexto {
  universidadId: string
  facultadId: string
}
