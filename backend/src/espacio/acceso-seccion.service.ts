import type { Rol, SeccionEspacio } from '@cursus/shared'
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'

interface FilaSeccion {
  id: string
  numero: number
  curso_id: string
  codigo: string
  curso_nombre: string
  periodo_id: string
  anio: number
  semestre: number
  rol: Rol | null
}

const COLUMNAS = `
  s.id, s.numero, c.id AS curso_id, c.codigo, c.nombre AS curso_nombre,
  p.id AS periodo_id, p.anio, p.semestre`

// Sección vigente: ni ella ni su curso están archivados.
const DESDE_SECCION = `
  FROM seccion s
  JOIN curso c ON c.id = s.curso_id
  JOIN carrera ca ON ca.id = c.carrera_id
  JOIN periodo p ON p.id = c.periodo_id`

// Rol con el que el usuario ($3) entra a la sección s, o NULL si no es
// integrante. Solo cuentan las asignaciones e inscripciones activas, y el
// Administrativo solo entra a las secciones de su facultad (facultad_actual,
// que para el superadmin es la que eligió: MT-04).
const ROL_EN_SECCION = `
  CASE
    WHEN s.profesor_id = $3 THEN 'PROFESOR'
    WHEN EXISTS (SELECT 1 FROM ayudante_seccion a
                  WHERE a.seccion_id = s.id AND a.usuario_id = $3
                    AND a.archived_at IS NULL) THEN 'AYUDANTE'
    WHEN EXISTS (SELECT 1 FROM inscripcion i
                  WHERE i.seccion_id = s.id AND i.usuario_id = $3
                    AND i.archived_at IS NULL) THEN 'ALUMNO'
    WHEN facultad_actual($3) = ca.facultad_id THEN 'ADMINISTRATIVO'
  END AS rol`

// ESP-06 (RE-01): solo los integrantes de una sección acceden a sus datos.
@Injectable()
export class AccesoSeccionService {
  constructor(private readonly bd: BaseDeDatos) {}

  // Devuelve la sección si el usuario puede entrar a su espacio.
  // - 404 si no existe, está archivada o es de otra universidad: desde fuera
  //   no se distinguen, igual que en gestión.
  // - 403 si es de su universidad pero el usuario no es integrante.
  // El Director lee cualquier sección, en una transacción READ ONLY.
  async verificar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccionId: string,
  ): Promise<SeccionEspacio> {
    const [fila] =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<FilaSeccion>(
            contexto,
            `SELECT ${COLUMNAS}, 'DIRECTOR' AS rol ${DESDE_SECCION}
              WHERE s.id = $1
                AND s.archived_at IS NULL AND c.archived_at IS NULL`,
            [seccionId],
          )
        : await this.bd.consultarEnUniversidad<FilaSeccion>(
            contexto,
            `SELECT ${COLUMNAS}, ${ROL_EN_SECCION} ${DESDE_SECCION}
              WHERE s.universidad_id = $1 AND s.id = $2
                AND s.archived_at IS NULL AND c.archived_at IS NULL`,
            [seccionId, usuarioId],
          )
    if (!fila) {
      throw new NotFoundException('La sección no existe')
    }
    if (!fila.rol) {
      throw new ForbiddenException('No eres integrante de esta sección')
    }
    return {
      id: fila.id,
      numero: fila.numero,
      curso: {
        id: fila.curso_id,
        codigo: fila.codigo,
        nombre: fila.curso_nombre,
      },
      periodo: {
        id: fila.periodo_id,
        anio: fila.anio,
        semestre: fila.semestre,
      },
      rol: fila.rol,
    }
  }
}
