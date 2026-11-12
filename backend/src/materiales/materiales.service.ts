import type {
  CategoriaMaterial,
  DescargaArchivo,
  Material,
  SeccionEspacio,
  VersionMaterial,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
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
const VERSION_DEL_ARCHIVO = 'material_version_archivo_id_key'
const ARCHIVO_USADO = [MATERIAL_DEL_ARCHIVO, VERSION_DEL_ARCHIVO]

interface FilaMaterial {
  id: string
  categoria: CategoriaMaterial
  titulo: string
  descripcion: string | null
  created_at: Date
  version: number
  version_en: Date
  archivo_id: string
  archivo_nombre: string
  archivo_tipo: string
  archivo_tamano: number
  archivo_subido_at: Date | null
}

// `m` es el material, `v` su versión vigente y `a`, el archivo de esa versión.
const COLUMNAS = `m.id, m.categoria, m.titulo, m.descripcion, m.created_at,
  v.version, v.subido_en AS version_en, a.id AS archivo_id, a.nombre AS archivo_nombre, a.tipo AS archivo_tipo,
  a.tamano AS archivo_tamano, a.subido_at AS archivo_subido_at`

// MAT-07: la vigente es la de mayor número. El profesor ve todas; el resto
// solo la vigente (RLS de material_version). Los PDF publicados como sílabo
// se leen por las rutas de sílabo, que requieren pertenencia a la sección y
// firman la versión publicada.
const DESDE_MATERIAL = `FROM material m
  CROSS JOIN LATERAL (
    SELECT mv.version, mv.archivo_id, mv.version_objeto, mv.subido_en
      FROM material_version mv
     WHERE mv.material_id = m.id AND mv.universidad_id = m.universidad_id
     ORDER BY mv.version DESC LIMIT 1) v
  JOIN archivo a ON a.id = v.archivo_id AND a.universidad_id = m.universidad_id
 WHERE m.curso_id = $1 AND m.archived_at IS NULL
   AND a.subido_at IS NOT NULL AND a.archived_at IS NULL
   AND NOT es_archivo_silabo(a.id)`

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
  version: fila.version,
  versionEn: fila.version_en.toISOString(),
})

interface FilaVersion {
  version: number
  subido_en: Date
  responsable: string
  archivo_id: string
  archivo_nombre: string
  archivo_tipo: string
  archivo_tamano: number
  archivo_subido_at: Date | null
}

// Versiones de un material del curso ($1) por id ($2). Solo para el profesor:
// la RLS no le muestra al resto las anteriores.
const DESDE_VERSIONES = `FROM material_version mv
  JOIN material m ON m.id = mv.material_id AND m.universidad_id = mv.universidad_id
  JOIN usuario u ON u.id = mv.subido_por AND u.universidad_id = mv.universidad_id
  JOIN archivo a ON a.id = mv.archivo_id AND a.universidad_id = mv.universidad_id
 WHERE m.curso_id = $1 AND m.id = $2 AND m.archived_at IS NULL`

const COLUMNAS_VERSION = `mv.version, mv.subido_en, u.nombre AS responsable,
  a.id AS archivo_id, a.nombre AS archivo_nombre, a.tipo AS archivo_tipo,
  a.tamano AS archivo_tamano, a.subido_at AS archivo_subido_at`

const versionDe = (fila: FilaVersion): VersionMaterial => ({
  version: fila.version,
  archivo: {
    id: fila.archivo_id,
    nombre: fila.archivo_nombre,
    tipo: fila.archivo_tipo,
    tamano: fila.archivo_tamano,
    subidoEn: fila.archivo_subido_at?.toISOString() ?? null,
  },
  subidoEn: fila.subido_en.toISOString(),
  responsable: fila.responsable,
})

interface FilaArchivo {
  clave: string
  tipo: string
  tamano: number
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
      version_objeto: string | null
    }>(
      contexto,
      usuarioId,
      seccion,
      `SELECT a.clave, a.nombre, v.version_objeto ${DESDE_MATERIAL} AND m.id = $2`,
      [materialId],
    )
    if (!archivo) {
      throw new NotFoundException('El material no existe')
    }
    return this.firmar(archivo)
  }

  // MAT-07: firma la versión de S3 fijada al subir la versión. Solo la
  // versión 1 de los materiales anteriores a MAT-07 no la tiene: se firma la
  // última del objeto, que la aplicación nunca sobrescribe (ver la migración).
  private async firmar(archivo: {
    clave: string
    nombre: string
    version_objeto: string | null
  }): Promise<DescargaArchivo> {
    const { url, expiraEn } = await this.almacenamiento.firmarDescarga(
      archivo.clave,
      archivo.nombre,
      archivo.version_objeto ?? undefined,
    )
    return { url, expiraEn: expiraEn.toISOString() }
  }

  // MAT-07: historial de un material, de la versión más reciente a la más
  // antigua. 404 si el material no es del curso o está archivado.
  async versiones(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    materialId: string,
  ): Promise<VersionMaterial[]> {
    const filas = await this.leerDelCurso<FilaVersion>(
      contexto,
      usuarioId,
      seccion,
      `SELECT ${COLUMNAS_VERSION} ${DESDE_VERSIONES} ORDER BY mv.version DESC`,
      [materialId],
    )
    if (filas.length === 0) throw new NotFoundException('El material no existe')
    return filas.map(versionDe)
  }

  // MAT-07: URL firmada de una versión, con su versión de S3.
  async descargaVersion(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    materialId: string,
    version: number,
  ): Promise<DescargaArchivo> {
    // Fuera de integer, PostgreSQL respondería 500.
    if (version < 1 || version > 2_147_483_647) {
      throw new NotFoundException('La versión no existe')
    }
    const [archivo] = await this.leerDelCurso<{
      clave: string
      nombre: string
      version_objeto: string | null
    }>(
      contexto,
      usuarioId,
      seccion,
      `SELECT a.clave, a.nombre, mv.version_objeto ${DESDE_VERSIONES}
          AND mv.version = $3 AND a.archived_at IS NULL`,
      [materialId, version],
    )
    if (!archivo) throw new NotFoundException('La versión no existe')
    return this.firmar(archivo)
  }

  // MAT-07: un profesor vigente del curso (no solo quien lo registró) sube
  // una versión nueva con un archivo propio ya confirmado de una sección del
  // curso. El FOR UPDATE del material numera sin carreras. Reintentar con el
  // mismo archivo devuelve la versión ya registrada; 409 si el archivo es de
  // otra versión u otro material.
  async subirVersion(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    materialId: string,
    archivoId: string,
  ): Promise<VersionMaterial> {
    try {
      return await this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
        await fijarUsuario(bd, usuarioId)
        const [bloqueado] = await bd.query<{ id: string }>(
          `SELECT id FROM material
            WHERE universidad_id = $1 AND id = $2 AND curso_id = $3
              AND archived_at IS NULL
            FOR UPDATE`,
          [contexto.universidadId, materialId, seccion.curso.id],
        )
        if (!bloqueado) throw new NotFoundException('El material no existe')

        const [previa] = await bd.query<FilaVersion & { material_id: string }>(
          `SELECT mv.material_id, ${COLUMNAS_VERSION}
             FROM material_version mv
             JOIN usuario u ON u.id = mv.subido_por AND u.universidad_id = mv.universidad_id
             JOIN archivo a ON a.id = mv.archivo_id AND a.universidad_id = mv.universidad_id
            WHERE mv.universidad_id = $1 AND mv.archivo_id = $2`,
          [contexto.universidadId, archivoId],
        )
        if (previa?.material_id === materialId) return versionDe(previa)
        if (previa) throw new ConflictException('El archivo ya es un material')

        const archivo = await this.archivoPropio(
          bd,
          contexto,
          usuarioId,
          seccion,
          archivoId,
        )
        const objeto = await this.verificarObjeto(archivo)
        await bd.query(
          `INSERT INTO material_version
             (universidad_id, material_id, version, archivo_id, subido_por, version_objeto)
           SELECT $1, $2, COALESCE(MAX(version), 0) + 1, $3, $4, $5
             FROM material_version WHERE universidad_id = $1 AND material_id = $2`,
          [contexto.universidadId, materialId, archivoId, usuarioId, objeto],
        )
        const [nueva] = await bd.query<FilaVersion>(
          `SELECT ${COLUMNAS_VERSION} ${DESDE_VERSIONES} AND mv.archivo_id = $3`,
          [seccion.curso.id, materialId, archivoId],
        )
        return versionDe(nueva)
      })
    } catch (error) {
      throw traducir(error, 'Solo un profesor del curso sube versiones')
    }
  }

  // Archivo propio, vigente y confirmado de una sección del curso, que no sea
  // un sílabo. 400 si no.
  private async archivoPropio(
    bd: Pick<BaseDeDatos, 'query'>,
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    archivoId: string,
  ): Promise<FilaArchivo> {
    const [archivo] = await bd.query<FilaArchivo>(
      `SELECT a.clave, a.tipo, a.tamano, a.seccion_id, a.subido_por,
              a.subido_at, a.archived_at
         FROM archivo a
         JOIN seccion s ON s.id = a.seccion_id AND s.universidad_id = a.universidad_id
        WHERE a.universidad_id = $1 AND a.id = $2 AND s.curso_id = $3
          AND NOT es_archivo_silabo(a.id)`,
      [contexto.universidadId, archivoId, seccion.curso.id],
    )
    // Uno de otro curso o de otra universidad (la RLS no lo deja ver)
    // responde lo mismo que uno que no existe.
    if (!archivo || archivo.subido_por !== usuarioId || archivo.archived_at) {
      throw new BadRequestException(
        'El archivo no existe o no es de esta sección',
      )
    }
    if (!archivo.subido_at) {
      throw new BadRequestException(
        'El archivo todavía no está confirmado: termina de subirlo primero',
      )
    }
    return archivo
  }

  // El objeto en S3 debe calzar con lo confirmado. Devuelve su VersionId,
  // que fija la versión que se descargará.
  private async verificarObjeto(archivo: FilaArchivo): Promise<string> {
    const objeto = await this.almacenamiento.objetoSubido(archivo.clave)
    if (objeto?.tipo !== archivo.tipo || objeto.tamano !== archivo.tamano) {
      throw new BadRequestException(
        'El archivo subido no coincide con el archivo confirmado',
      )
    }
    if (!objeto.version || objeto.version === 'null') {
      throw new ServiceUnavailableException(
        'El almacenamiento debe tener versionado activo',
      )
    }
    return objeto.version
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

  // Registra un archivo ya confirmado de la sección como material del curso,
  // con su versión 1 (MAT-07). 400 si el archivo no existe, no es de esta
  // sección o del usuario, o no está confirmado; 409 si ya es un material.
  async crear(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    datos: CrearMaterialDto,
  ): Promise<Material> {
    try {
      return await this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
        // Antes de escribir: la RLS exige subido_por = usuario_actual().
        await fijarUsuario(bd, usuarioId)

        const archivo = await this.archivoPropio(
          bd,
          contexto,
          usuarioId,
          seccion,
          datos.archivoId,
        )
        if (archivo.seccion_id !== seccion.id) {
          throw new BadRequestException(
            'El archivo no existe o no es de esta sección',
          )
        }
        const [existente] = await bd.query<{ id: string }>(
          `SELECT archivo_id AS id FROM material
            WHERE universidad_id = $1 AND archivo_id = $2
           UNION ALL
           SELECT archivo_id FROM material_version
            WHERE universidad_id = $1 AND archivo_id = $2`,
          [contexto.universidadId, datos.archivoId],
        )
        if (existente) {
          throw new ConflictException('El archivo ya es un material')
        }
        const objeto = await this.verificarObjeto(archivo)
        // tg_material_version_inicial crea la versión 1 con este VersionId.
        await bd.query(`SELECT set_config('app.version_objeto', $1, true)`, [
          objeto,
        ])

        const [{ id }] = await bd.query<{ id: string }>(
          `INSERT INTO material
             (universidad_id, curso_id, archivo_id, categoria, titulo, descripcion, subido_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
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
        const [creado] = await bd.query<FilaMaterial>(
          `SELECT ${COLUMNAS} ${DESDE_MATERIAL} AND m.id = $2`,
          [seccion.curso.id, id],
        )
        return material(creado)
      })
    } catch (error) {
      throw traducir(error, 'Solo un profesor del curso registra materiales')
    }
  }
}

// Errores de PostgreSQL al escribir un material o una versión.
function traducir(error: unknown, sinPermiso: string): unknown {
  const { code, constraint } = error as { code?: string; constraint?: string }
  // Otra petición usó el archivo entre la consulta y el INSERT.
  if (code === UNIQUE && ARCHIVO_USADO.includes(constraint ?? '')) {
    return new ConflictException('El archivo ya es un material')
  }
  // Otra petición numeró la misma versión (no debería: FOR UPDATE).
  if (code === UNIQUE) return new ConflictException('Vuelve a intentarlo')
  // El profesor dejó la sección, o la archivaron, después del guard.
  if (code === SIN_PERMISO) return new ForbiddenException(sinPermiso)
  // tg_material_validar: el archivo no calza al registrarlo.
  if (code === CHECK) {
    return new BadRequestException(
      'El archivo debe estar confirmado y ser de una sección del curso',
    )
  }
  return error
}
