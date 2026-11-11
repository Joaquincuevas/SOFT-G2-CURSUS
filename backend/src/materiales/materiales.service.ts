import type {
  CategoriaMaterial,
  DescargaArchivo,
  Material,
  SeccionEspacio,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AlmacenamientoService } from '../archivos/almacenamiento.service.js'
import {
  BaseDeDatos,
  type ContextoUniversidad,
  fijarUsuario,
} from '../database/base-de-datos.service.js'
import type { CrearMaterialDto } from './crear-material.dto.js'

// Códigos de PostgreSQL: restricción única violada, restricción CHECK
// violada (también la usa tg_material_validar) y falta de privilegio (RLS).
const UNIQUE = '23505'
const CHECK = '23514'
const SIN_PERMISO = '42501'
const MATERIAL_DEL_ARCHIVO = 'uq_material_archivo'

interface FilaMaterial {
  id: string
  categoria: CategoriaMaterial
  titulo: string
  descripcion: string | null
  created_at: Date
  archivo_id: string
  archivo_nombre: string
  archivo_tipo: string
  archivo_tamano: number
  archivo_subido_at: Date | null
}

// `m` es el material (la tabla o el CTE del INSERT) y `a`, su archivo.
const COLUMNAS = `m.id, m.categoria, m.titulo, m.descripcion, m.created_at,
  a.id AS archivo_id, a.nombre AS archivo_nombre, a.tipo AS archivo_tipo,
  a.tamano AS archivo_tamano, a.subido_at AS archivo_subido_at`

// Materiales activos de un curso ($1) con su archivo confirmado y vigente.
const DESDE_MATERIAL = `FROM material m
  JOIN archivo a ON a.id = m.archivo_id AND a.universidad_id = m.universidad_id
 WHERE m.curso_id = $1 AND m.archived_at IS NULL
   AND a.subido_at IS NOT NULL AND a.archived_at IS NULL`

const material = (fila: FilaMaterial): Material => ({
  id: fila.id,
  categoria: fila.categoria,
  titulo: fila.titulo,
  descripcion: fila.descripcion,
  archivo: {
    id: fila.archivo_id,
    nombre: fila.archivo_nombre,
    tipo: fila.archivo_tipo,
    tamano: fila.archivo_tamano,
    subidoEn: fila.archivo_subido_at?.toISOString() ?? null,
  },
  creadoEn: fila.created_at.toISOString(),
})

interface FilaArchivo {
  seccion_id: string
  subido_por: string
  subido_at: Date | null
  archived_at: Date | null
}

// MAT-04: materiales de un curso, registrados desde una sección que
// IntegranteSeccionGuard ya verificó. El material es del curso: lo ve y lo
// gestiona cualquier profesor vigente de cualquier sección (GES-25), lo
// decide la RLS de `material`. El contenido es un archivo de MAT-01: aquí no
// pasan bytes. El controlador decide quién registra, quién lista y quién
// descarga.
@Injectable()
export class MaterialesService {
  constructor(
    private readonly bd: BaseDeDatos,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  // Los materiales activos del curso de la sección, del más reciente al más
  // antiguo (MAT-04, y MAT-06 para el resto de los integrantes).
  async listar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
  ): Promise<Material[]> {
    const filas = await this.leerDelCurso<FilaMaterial>(
      contexto,
      usuarioId,
      seccion,
      `SELECT ${COLUMNAS} ${DESDE_MATERIAL}
        ORDER BY m.created_at DESC, m.id`,
    )
    return filas.map(material)
  }

  // MAT-06: URL firmada para descargar el archivo original de un material del
  // curso de la sección. Se busca por material y no por archivo, porque el
  // archivo es de la sección donde se subió y el material es de todo el
  // curso. 404 si el material no existe, es de otro curso o está archivado.
  async descarga(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    materialId: string,
  ): Promise<DescargaArchivo> {
    const [archivo] = await this.leerDelCurso<{
      clave: string
      nombre: string
    }>(
      contexto,
      usuarioId,
      seccion,
      `SELECT a.clave, a.nombre ${DESDE_MATERIAL} AND m.id = $2`,
      [materialId],
    )
    if (!archivo) {
      throw new NotFoundException('El material no existe')
    }
    const { url, expiraEn } = await this.almacenamiento.firmarDescarga(
      archivo.clave,
      archivo.nombre,
    )
    return { url, expiraEn: expiraEn.toISOString() }
  }

  // Lee del curso de la sección, que IntegranteSeccionGuard ya verificó ($1).
  // El Director lee en cualquier universidad, en una transacción READ ONLY,
  // como en la descarga de MAT-01. El resto, en su universidad y con su
  // usuario fijado: la RLS de `material` solo muestra los cursos donde es
  // integrante, y sin usuario fijado no hay filas.
  private leerDelCurso<T>(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    sql: string,
    parametros: unknown[] = [],
  ): Promise<T[]> {
    const todos = [seccion.curso.id, ...parametros]
    if (contexto.rol === 'DIRECTOR') {
      return this.bd.consultarEnTodasLasUniversidades<T>(contexto, sql, todos)
    }
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      await fijarUsuario(bd, usuarioId)
      return bd.query<T>(sql, todos)
    })
  }

  // Registra un archivo ya confirmado de la sección como material del curso.
  // 400 si el archivo no existe, no es de esta sección o del usuario, o no
  // está confirmado; 409 si ya es un material.
  async crear(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    datos: CrearMaterialDto,
  ): Promise<Material> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      // Antes de escribir: la RLS exige subido_por = usuario_actual().
      await fijarUsuario(bd, usuarioId)

      const [archivo] = await bd.query<FilaArchivo>(
        `SELECT seccion_id, subido_por, subido_at, archived_at
           FROM archivo
          WHERE universidad_id = $1 AND id = $2`,
        [contexto.universidadId, datos.archivoId],
      )
      // Un archivo de otra sección, de otro curso o de otra universidad (la
      // RLS no lo deja ver) responde lo mismo que uno que no existe.
      if (
        !archivo ||
        archivo.seccion_id !== seccion.id ||
        archivo.subido_por !== usuarioId ||
        archivo.archived_at
      ) {
        throw new BadRequestException(
          'El archivo no existe o no es de esta sección',
        )
      }
      if (!archivo.subido_at) {
        throw new BadRequestException(
          'El archivo todavía no está confirmado: termina de subirlo primero',
        )
      }
      const [existente] = await bd.query<{ id: string }>(
        `SELECT m.id FROM material m
          WHERE m.universidad_id = $1 AND m.archivo_id = $2`,
        [contexto.universidadId, datos.archivoId],
      )
      if (existente) {
        throw new ConflictException('El archivo ya es un material')
      }

      try {
        // En un CTE para devolver también el archivo.
        const [creado] = await bd.query<FilaMaterial>(
          `WITH m AS (
             INSERT INTO material
               (universidad_id, curso_id, archivo_id, categoria, titulo, descripcion, subido_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *
           )
           SELECT ${COLUMNAS}
             FROM m
             JOIN archivo a ON a.id = m.archivo_id
                           AND a.universidad_id = m.universidad_id`,
          [
            contexto.universidadId,
            seccion.curso.id,
            datos.archivoId,
            datos.categoria,
            datos.titulo,
            datos.descripcion ?? null,
            usuarioId,
          ],
        )
        return material(creado)
      } catch (error) {
        const { code, constraint } = error as {
          code?: string
          constraint?: string
        }
        // Otra petición lo registró entre la consulta y el INSERT.
        if (code === UNIQUE && constraint === MATERIAL_DEL_ARCHIVO) {
          throw new ConflictException('El archivo ya es un material')
        }
        // El profesor dejó la sección, o la archivaron, después del guard.
        if (code === SIN_PERMISO) {
          throw new ForbiddenException(
            'Solo un profesor del curso registra materiales',
          )
        }
        // tg_material_validar: el archivo no calza al registrarlo.
        if (code === CHECK) {
          throw new BadRequestException(
            'El archivo debe estar confirmado y ser de una sección del curso',
          )
        }
        throw error
      }
    })
  }
}
