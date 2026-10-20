import { MAX_BYTES_ALUMNOS_CSV, MAX_FILAS_ALUMNOS_CSV } from '@cursus/shared'
import { BadRequestException } from '@nestjs/common'

export interface FilaCsv {
  fila: number
  celdas: string[]
}

// Coma como separador, CRLF/LF, BOM, comillas dobles y comillas escapadas.
// Se analiza todo antes de escribir: un archivo mal formado no carga filas.
export function leerCsvAlumnos(texto: string): FilaCsv[] {
  if (Buffer.byteLength(texto, 'utf8') > MAX_BYTES_ALUMNOS_CSV)
    throw new BadRequestException('El CSV supera el máximo de 48 KiB')
  texto = texto.replace(/^\uFEFF/, '')
  const filas: FilaCsv[] = []
  let celdas: string[] = [],
    celda = '',
    estado: 'inicio' | 'texto' | 'comillas' | 'cerrado' = 'inicio'
  let linea = 1,
    inicioFila = 1
  const terminarCelda = () => {
    celdas.push(celda)
    celda = ''
    estado = 'inicio'
  }
  const terminarFila = () => {
    terminarCelda()
    if (!(celdas.length === 1 && !celdas[0].trim()))
      filas.push({ fila: inicioFila, celdas })
    celdas = []
    if (filas.length > MAX_FILAS_ALUMNOS_CSV + 1)
      throw new BadRequestException(
        `El CSV admite hasta ${MAX_FILAS_ALUMNOS_CSV} alumnos`,
      )
  }
  for (let i = 0; i < texto.length; i++) {
    const char = texto[i]
    if (estado === 'comillas') {
      if (char === '"') {
        if (texto[i + 1] === '"') {
          celda += '"'
          i++
        } else estado = 'cerrado'
      } else {
        celda += char
        if (char === '\n' || (char === '\r' && texto[i + 1] !== '\n')) linea++
      }
    } else if (char === ',') terminarCelda()
    else if (char === '\n' || char === '\r') {
      terminarFila()
      if (char === '\r' && texto[i + 1] === '\n') i++
      linea++
      inicioFila = linea
    } else if (char === '"') {
      if (estado !== 'inicio')
        throw new BadRequestException(`Comillas inválidas en la línea ${linea}`)
      estado = 'comillas'
    } else {
      if (estado === 'cerrado') {
        if (char === ' ' || char === '\t') continue
        throw new BadRequestException(
          `Contenido después de comillas en la línea ${linea}`,
        )
      }
      celda += char
      estado = 'texto'
    }
  }
  if (estado === 'comillas')
    throw new BadRequestException('El CSV contiene comillas sin cerrar')
  if (celda || celdas.length || estado === 'cerrado') terminarFila()
  const cabecera = filas.shift()
  if (
    !cabecera ||
    cabecera.celdas.length !== 2 ||
    cabecera.celdas[0].trim() !== 'correo' ||
    cabecera.celdas[1].trim() !== 'nombre'
  ) {
    throw new BadRequestException(
      'El CSV debe comenzar con el encabezado correo,nombre',
    )
  }
  if (!filas.length) throw new BadRequestException('El CSV no contiene alumnos')
  return filas
}
