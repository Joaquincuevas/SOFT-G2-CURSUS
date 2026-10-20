import type { FilaCargaAlumnos, ResultadoCargaAlumnos } from '@cursus/shared'
import { LARGO_NOMBRE_USUARIO } from '@cursus/shared'
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
import { GestionService } from './gestion.service.js'

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
    for (const { fila, celdas } of filas) {
      const datos = plainToInstance(AgregarAlumnoDto, {
        correo: celdas[0],
        nombre: celdas[1],
      })
      const correo = typeof datos.correo === 'string' ? datos.correo : ''
      const errores = await validate(datos)
      if (celdas.length !== 2 || errores.length) {
        resultados.push({
          fila,
          correo,
          estado: 'error',
          mensaje:
            celdas.length !== 2
              ? 'La fila debe tener dos columnas: correo,nombre'
              : `Revisa el correo y el nombre (máximo ${LARGO_NOMBRE_USUARIO} caracteres)`,
        })
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
      } catch (error) {
        const estado = error instanceof HttpException ? error.getStatus() : 500
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
        const respuesta =
          error instanceof HttpException ? error.getResponse() : null
        const mensaje =
          typeof respuesta === 'string'
            ? respuesta
            : (respuesta as { message?: unknown } | null)?.message
        resultados.push({
          fila,
          correo,
          estado: 'error',
          mensaje:
            error instanceof HttpException &&
            error.getStatus() < 500 &&
            typeof mensaje === 'string'
              ? mensaje
              : 'No se pudo cargar esta fila. Intenta nuevamente.',
        })
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
