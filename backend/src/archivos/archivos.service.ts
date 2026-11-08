import { randomUUID } from 'node:crypto'
import {
  tipoDeArchivo,
  type ArchivoResumen,
  type DescargaArchivo,
  type SeccionEspacio,
  type SubidaArchivo,
} from '@cursus/shared'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  BaseDeDatos,
  type ContextoUniversidad,
} from '../database/base-de-datos.service.js'
import { AlmacenamientoService } from './almacenamiento.service.js'
import type { PedirSubidaDto } from './pedir-subida.dto.js'

interface FilaArchivo {
  id: string
  nombre: string
  tipo: string
  tamano: number
  clave: string
  subido_por: string
  subido_como: string
  subido_at: Date | null
}

const COLUMNAS = `id, nombre, tipo, tamano, clave, subido_por, subido_como, subido_at`

const resumenDe = (fila: FilaArchivo): ArchivoResumen => ({
  id: fila.id,
  nombre: fila.nombre,
  tipo: fila.tipo,
  tamano: fila.tamano,
  subidoEn: fila.subido_at?.toISOString() ?? null,
})

// El usuario ($3) sigue siendo integrante de la sección ($2) con el rol ($4)
// que verificó IntegranteSeccionGuard, y ella y su curso siguen vigentes. Se
// vuelve a revisar al escribir, por si cambió después del guard.
const SIGUE_INTEGRANTE = `
  EXISTS (
    SELECT 1 FROM seccion s JOIN curso c ON c.id = s.curso_id
     WHERE s.universidad_id = $1 AND s.id = $2
       AND s.archived_at IS NULL AND c.archived_at IS NULL
       AND CASE $4::text
             WHEN 'PROFESOR' THEN s.profesor_id = $3
             WHEN 'AYUDANTE' THEN EXISTS (
               SELECT 1 FROM ayudante_seccion a
                WHERE a.seccion_id = s.id AND a.usuario_id = $3
                  AND a.archived_at IS NULL)
             WHEN 'ALUMNO' THEN EXISTS (
               SELECT 1 FROM inscripcion i
                WHERE i.seccion_id = s.id AND i.usuario_id = $3
                  AND i.archived_at IS NULL)
             ELSE false
           END)`

// MAT-01: archivos de una sección que IntegranteSeccionGuard ya verificó.
// Los archivos van directo entre el navegador y S3 con URLs firmadas; aquí se
// registra cada archivo, se firma y se decide quién puede descargarlo. El
// controlador decide qué roles suben y descargan.
@Injectable()
export class ArchivosService {
  constructor(
    private readonly bd: BaseDeDatos,
    private readonly almacenamiento: AlmacenamientoService,
  ) {}

  // Registra el archivo sin confirmar y firma su subida. El tipo sale de la
  // extensión (el DTO ya la validó). La llave del objeto no usa el nombre.
  async pedirSubida(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    datos: PedirSubidaDto,
  ): Promise<SubidaArchivo> {
    const tipo = tipoDeArchivo(datos.nombre)
    if (!tipo) {
      throw new BadRequestException('Tipo de archivo no permitido')
    }
    const id = randomUUID()
    const clave = `${contexto.universidadId}/${seccion.id}/${id}`
    // Primero la firma: si el almacenamiento no está disponible (503), no
    // queda una fila que nadie va a poder subir.
    const subida = await this.almacenamiento.firmarSubida(
      clave,
      tipo,
      datos.tamano,
    )
    const [fila] = await this.bd.consultarEnUniversidad<FilaArchivo>(
      contexto,
      `INSERT INTO archivo
         (id, universidad_id, seccion_id, subido_por, subido_como, nombre, tipo, tamano, clave)
       SELECT $5, $1, $2, $3, $4, $6, $7, $8, $9
        WHERE ${SIGUE_INTEGRANTE}
       RETURNING ${COLUMNAS}`,
      [
        seccion.id,
        usuarioId,
        seccion.rol,
        id,
        datos.nombre,
        tipo,
        datos.tamano,
        clave,
      ],
    )
    if (!fila) {
      throw new ForbiddenException('Ya no perteneces a esta sección')
    }
    return {
      archivo: resumenDe(fila),
      subida: {
        url: subida.url,
        campos: subida.campos,
        expiraEn: subida.expiraEn.toISOString(),
      },
    }
  }

  // Confirma la subida cuando el objeto ya está en S3 con el tamaño y el tipo
  // registrados. Solo quien lo subió. Confirmar de nuevo no cambia nada.
  async confirmar(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    archivoId: string,
  ): Promise<ArchivoResumen> {
    return this.bd.enTransaccionEnUniversidad(contexto, async (bd) => {
      const [archivo] = await bd.query<FilaArchivo>(
        `SELECT ${COLUMNAS} FROM archivo
          WHERE universidad_id = $1 AND seccion_id = $2 AND id = $3
            AND subido_por = $4 AND archived_at IS NULL
          FOR UPDATE`,
        [contexto.universidadId, seccion.id, archivoId, usuarioId],
      )
      if (!archivo) {
        throw new NotFoundException('El archivo no existe')
      }
      if (archivo.subido_at) {
        return resumenDe(archivo)
      }
      const objeto = await this.almacenamiento.objetoSubido(archivo.clave)
      if (!objeto) {
        throw new ConflictException('El archivo todavía no se ha subido')
      }
      // La firma ya lo exige; si no calza, el objeto no es el registrado.
      if (objeto.tamano !== archivo.tamano || objeto.tipo !== archivo.tipo) {
        throw new ConflictException(
          'El archivo subido no coincide con el registrado',
        )
      }
      // En un CTE porque TypeORM devuelve [filas, afectadas] para un UPDATE
      // suelto.
      const [confirmado] = await bd.query<FilaArchivo>(
        `WITH confirmado AS (
           UPDATE archivo SET subido_at = now()
            WHERE universidad_id = $1 AND id = $2
            RETURNING ${COLUMNAS}
         )
         SELECT * FROM confirmado`,
        [contexto.universidadId, archivoId],
      )
      return resumenDe(confirmado)
    })
  }

  // URL firmada de descarga de un archivo confirmado de la sección. El
  // profesor, el ayudante y el Director descargan cualquiera; el alumno, solo
  // los que subió él y los del equipo docente (no las entregas de otros
  // alumnos). Para el resto responde 404, sin revelar que existe.
  async descarga(
    contexto: ContextoUniversidad,
    usuarioId: string,
    seccion: SeccionEspacio,
    archivoId: string,
  ): Promise<DescargaArchivo> {
    const vigente = 'subido_at IS NOT NULL AND archived_at IS NULL'
    // El Director lee en cualquier universidad, en una transacción READ ONLY.
    const [archivo] =
      contexto.rol === 'DIRECTOR'
        ? await this.bd.consultarEnTodasLasUniversidades<FilaArchivo>(
            contexto,
            `SELECT ${COLUMNAS} FROM archivo
              WHERE seccion_id = $1 AND id = $2 AND ${vigente}`,
            [seccion.id, archivoId],
          )
        : await this.bd.consultarEnUniversidad<FilaArchivo>(
            contexto,
            `SELECT ${COLUMNAS} FROM archivo
              WHERE universidad_id = $1 AND seccion_id = $2 AND id = $3
                AND ${vigente}`,
            [seccion.id, archivoId],
          )
    const puede =
      archivo &&
      (seccion.rol !== 'ALUMNO' ||
        archivo.subido_por === usuarioId ||
        archivo.subido_como !== 'ALUMNO')
    if (!puede) {
      throw new NotFoundException('El archivo no existe')
    }
    const { url, expiraEn } = await this.almacenamiento.firmarDescarga(
      archivo.clave,
      archivo.nombre,
    )
    return { url, expiraEn: expiraEn.toISOString() }
  }
}
