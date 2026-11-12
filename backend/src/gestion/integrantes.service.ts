import type {
  AgregarIntegrante,
  BusquedaIntegrantes,
  IntegrantesSeccion,
  PersonaIntegrante,
  QuitarIntegrante,
  RolIntegrante,
} from '@cursus/shared'
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { AsignacionesService } from './asignaciones.service.js'
import { AyudantesService } from './ayudantes.service.js'
import { GestionService } from './gestion.service.js'
import { ProfesoresService } from './profesores.service.js'

const ASIGNACIONES = {
  PROFESOR: 'seccion_profesor',
  AYUDANTE: 'ayudante_seccion',
  ALUMNO: 'inscripcion',
} as const

// Repite el alcance en cada lectura por si la sección cambia de facultad
// entre la validación inicial y la consulta de personas.
const EN_FACULTAD = (usuario: string) => `EXISTS (
  SELECT 1 FROM seccion s JOIN curso c ON c.id=s.curso_id AND c.universidad_id=s.universidad_id
  JOIN carrera ca ON ca.id=c.carrera_id AND ca.universidad_id=c.universidad_id
  WHERE s.universidad_id=$1 AND s.id=$2 AND s.archived_at IS NULL AND c.archived_at IS NULL
    AND ca.facultad_id=facultad_actual(${usuario}))`

@Injectable()
export class IntegrantesService {
  constructor(
    private readonly bd: BaseDeDatos,
    private readonly profesores: ProfesoresService,
    private readonly ayudantes: AyudantesService,
    private readonly gestion: GestionService,
    private readonly asignaciones: AsignacionesService,
  ) {}

  private async seccion(
    contexto: ContextoUniversidad,
    usuario: string,
    id: string,
  ): Promise<IntegrantesSeccion['seccion']> {
    if (contexto.rol !== 'ADMINISTRATIVO') throw new ForbiddenException()
    const [fila] = await this.bd.consultarEnUniversidad<{
      id: string
      numero: number
      curso: IntegrantesSeccion['seccion']['curso']
    }>(
      contexto,
      `SELECT s.id,s.numero,json_build_object('id',c.id,'codigo',c.codigo,'nombre',c.nombre) AS curso
       FROM seccion s JOIN curso c ON c.id=s.curso_id AND c.universidad_id=s.universidad_id
       JOIN carrera ca ON ca.id=c.carrera_id AND ca.universidad_id=c.universidad_id
       WHERE s.universidad_id=$1 AND s.id=$2 AND s.archived_at IS NULL AND c.archived_at IS NULL
         AND ca.facultad_id=facultad_actual($3)`,
      [id, usuario],
    )
    if (!fila) throw new NotFoundException('La sección no existe')
    return fila
  }

  async listar(
    contexto: ContextoUniversidad,
    usuario: string,
    id: string,
  ): Promise<IntegrantesSeccion> {
    const seccion = await this.seccion(contexto, usuario, id)
    const integrantes = await this.bd.consultarEnUniversidad<PersonaIntegrante>(
      contexto,
      `WITH asignados AS (
        SELECT usuario_id,universidad_id,'PROFESOR' AS rol FROM seccion_profesor WHERE seccion_id=$2 AND archived_at IS NULL
        UNION ALL SELECT usuario_id,universidad_id,'AYUDANTE' FROM ayudante_seccion WHERE seccion_id=$2 AND archived_at IS NULL
        UNION ALL SELECT usuario_id,universidad_id,'ALUMNO' FROM inscripcion WHERE seccion_id=$2 AND archived_at IS NULL)
       SELECT u.id,u.nombre,u.correo,a.rol FROM asignados a JOIN usuario u ON u.id=a.usuario_id AND u.universidad_id=a.universidad_id
       WHERE a.universidad_id=$1 AND u.archived_at IS NULL AND u.rol::text=a.rol AND ${EN_FACULTAD('$3')}
       ORDER BY a.rol,u.nombre COLLATE "es-CL-x-icu",u.correo,u.id`,
      [id, usuario],
    )
    return { seccion, integrantes }
  }

  async buscar(
    contexto: ContextoUniversidad,
    usuario: string,
    id: string,
    filtro: { rol: RolIntegrante; q: string },
  ): Promise<BusquedaIntegrantes> {
    await this.seccion(contexto, usuario, id)
    // Los nombres de tabla salen de una lista cerrada; la búsqueda es literal,
    // parametrizada y acotada, sin descargar todas las cuentas de la universidad.
    const tabla = ASIGNACIONES[filtro.rol]
    const patron = `%${filtro.q.replace(/[\\%_]/g, '\\$&')}%`
    const personas = await this.bd.consultarEnUniversidad<PersonaIntegrante>(
      contexto,
      `SELECT u.id,u.nombre,u.correo,u.rol FROM usuario u
       WHERE u.universidad_id=$1 AND u.rol=$3 AND u.archived_at IS NULL
         AND (u.nombre ILIKE $4 OR u.correo ILIKE $4) AND ${EN_FACULTAD('$5')}
         AND NOT EXISTS (SELECT 1 FROM ${tabla} a WHERE a.universidad_id=u.universidad_id AND a.seccion_id=$2 AND a.usuario_id=u.id AND a.archived_at IS NULL)
       ORDER BY u.nombre COLLATE "es-CL-x-icu",u.correo,u.id LIMIT 21`,
      [id, filtro.rol, patron, usuario],
    )
    return { personas: personas.slice(0, 20), hayMas: personas.length > 20 }
  }

  async agregar(
    contexto: ContextoUniversidad,
    usuario: string,
    id: string,
    datos: AgregarIntegrante,
  ): Promise<void> {
    await this.seccion(contexto, usuario, id)
    switch (datos.rol) {
      case 'PROFESOR':
        await this.profesores.agregar(contexto, usuario, id, datos.usuarioId)
        return
      case 'AYUDANTE':
        await this.ayudantes.asignar(contexto, usuario, id, {
          ayudanteIds: [datos.usuarioId],
        })
        return
      case 'ALUMNO': {
        const [alumno] = await this.bd.consultarEnUniversidad<{
          correo: string
        }>(
          contexto,
          `SELECT correo FROM usuario WHERE universidad_id=$1 AND id=$2 AND rol='ALUMNO' AND archived_at IS NULL`,
          [datos.usuarioId],
        )
        if (!alumno) throw new NotFoundException('El alumno no existe')
        await this.gestion.agregarAlumno(
          contexto,
          usuario,
          id,
          { correo: alumno.correo },
          datos.usuarioId,
        )
      }
    }
  }

  async quitar(
    contexto: ContextoUniversidad,
    usuario: string,
    id: string,
    persona: string,
    datos: QuitarIntegrante,
  ): Promise<void> {
    await this.seccion(contexto, usuario, id)
    switch (datos.rol) {
      case 'PROFESOR':
        await this.asignaciones.quitarUnProfesor(
          contexto,
          usuario,
          id,
          persona,
          datos.motivo,
        )
        return
      case 'AYUDANTE':
        await this.asignaciones.quitarAyudante(
          contexto,
          usuario,
          id,
          persona,
          datos.motivo,
        )
        return
      case 'ALUMNO':
        await this.gestion.quitarAlumno(
          contexto,
          usuario,
          id,
          persona,
          datos.motivo,
        )
    }
  }
}
