import {
  type FilaCargaAlumnos,
  MENSAJES_MOTIVO_CSV,
  type MotivoErrorCsv,
  type ResultadoCargaAlumnos,
} from '@cursus/shared'
import {
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { ContextoUniversidad } from '../database/base-de-datos.service.js'
import { AgregarAlumnoDto } from './agregar-alumno.dto.js'
import { leerCsvAlumnos } from './csv-alumnos.js'
import { GestionService, motivoDe } from './gestion.service.js'

@Injectable()
export class CargaAlumnosService {
  private readonly logger = new Logger(CargaAlumnosService.name)

  constructor(private readonly gestion: GestionService) {}

  async cargar(
    contexto: ContextoUniversidad,
    usuario: string,
    seccion: string,
    csv: string,
  ): Promise<ResultadoCargaAlumnos> {
    if (contexto.rol !== 'ADMINISTRATIVO') throw new ForbiddenException()
    await this.gestion.validarSeccionInscripcion(contexto, usuario, seccion)
    const filas = leerCsvAlumnos(csv)
    const resultados: FilaCargaAlumnos[] = []
    const error = (
      fila: number,
      correo: string,
      nombre: string,
      motivo: MotivoErrorCsv,
      mensaje = MENSAJES_MOTIVO_CSV[motivo],
    ) =>
      resultados.push({
        fila,
        correo,
        nombre,
        estado: 'error',
        motivo,
        mensaje,
      })
    // GES-17: la primera aparición de un correo (sin espacios ni mayúsculas)
    // se procesa; las siguientes son duplicados y no tocan la base.
    const vistos = new Set<string>()
    for (const { fila, celdas } of filas) {
      const nombre = celdas[1] ?? ''
      const clave = (celdas[0] ?? '').trim().toLowerCase()
      if (clave && vistos.has(clave)) {
        error(fila, clave, nombre, 'duplicado_en_archivo')
        continue
      }
      if (clave) vistos.add(clave)

      const datos = plainToInstance(AgregarAlumnoDto, {
        correo: celdas[0],
        nombre: celdas[1],
      })
      const correo = typeof datos.correo === 'string' ? datos.correo : ''
      if (celdas.length !== 2) {
        error(fila, correo, nombre, 'formato')
        continue
      }
      const invalidas = (await validate(datos)).map((e) => e.property)
      if (invalidas.length) {
        error(
          fila,
          correo,
          nombre,
          invalidas.includes('correo') ? 'correo_invalido' : 'nombre_invalido',
        )
        continue
      }
      try {
        // Cada fila reutiliza la transacción y las reglas de GES-15.
        const alumno = await this.gestion.agregarAlumno(
          contexto,
          usuario,
          seccion,
          datos,
        )
        resultados.push({ fila, correo, estado: 'cargado', ...alumno })
      } catch (excepcion) {
        const estado =
          excepcion instanceof HttpException ? excepcion.getStatus() : 500
        if (estado >= 500) {
          // No pasar la excepción: los mensajes/consultas de BD pueden contener
          // correos o contraseñas. El contexto permite ubicar la fila afectada.
          this.logger.error({
            mensaje: 'Error interno al cargar una fila del CSV',
            fila,
            seccionId: seccion,
            universidadId: contexto.universidadId,
            estado,
          })
        }
        const motivo = (estado < 500 && motivoDe(excepcion)) || 'error_interno'
        const respuesta =
          excepcion instanceof HttpException ? excepcion.getResponse() : null
        const mensaje =
          typeof respuesta === 'string'
            ? respuesta
            : (respuesta as { message?: unknown } | null)?.message
        // El mensaje de GES-15 en los 4xx (por ejemplo, el dominio exacto); en
        // los 5xx, el genérico. Un 4xx sin motivo conocido queda como
        // error_interno, pero conserva su mensaje.
        error(
          fila,
          correo,
          nombre,
          motivo,
          estado < 500 && typeof mensaje === 'string'
            ? mensaje
            : MENSAJES_MOTIVO_CSV[motivo],
        )
      }
    }
    const cargados = resultados.filter(
      (fila) => fila.estado === 'cargado',
    ).length
    return {
      total: resultados.length,
      cargados,
      errores: resultados.length - cargados,
      filas: resultados,
    }
  }
}
