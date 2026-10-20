import type { AlumnoAgregado } from './cursos.js'

export const MAX_FILAS_ALUMNOS_CSV = 100
export const MAX_BYTES_ALUMNOS_CSV = 48 * 1024
export interface CargarAlumnosCsv {
  csv: string
}
// Motivo estable de una fila con error (GES-17). El frontend y el CSV de
// errores muestran MENSAJES_MOTIVO_CSV; `mensaje` trae el texto del backend.
export type MotivoErrorCsv =
  | 'formato'
  | 'correo_invalido'
  | 'nombre_invalido'
  | 'dominio_distinto'
  | 'duplicado_en_archivo'
  | 'ya_inscrito'
  | 'rol_distinto'
  | 'falta_nombre'
  | 'cuenta_archivada'
  | 'error_interno'

export const MENSAJES_MOTIVO_CSV: Record<MotivoErrorCsv, string> = {
  formato: 'La fila debe tener dos columnas: correo,nombre',
  correo_invalido: 'Correo inválido',
  nombre_invalido: 'Nombre inválido o demasiado largo',
  dominio_distinto: 'El correo no es del dominio de la universidad',
  duplicado_en_archivo: 'Correo repetido en el archivo',
  ya_inscrito: 'Ya está inscrito en esta sección',
  rol_distinto: 'El correo pertenece a una cuenta que no es de alumno',
  falta_nombre: 'Falta el nombre para crear la cuenta',
  cuenta_archivada: 'La cuenta del alumno está archivada',
  error_interno: 'No se pudo cargar esta fila. Intenta nuevamente.',
}

export type FilaCargaAlumnos =
  | ({ fila: number; correo: string; estado: 'cargado' } & AlumnoAgregado)
  | {
      fila: number
      correo: string
      // El nombre tal como venía en la fila, para rearmar el CSV.
      nombre: string
      estado: 'error'
      motivo: MotivoErrorCsv
      mensaje: string
    }
export interface ResultadoCargaAlumnos {
  total: number
  cargados: number
  errores: number
  filas: FilaCargaAlumnos[]
}

// --- CSV de errores (GES-17) ---

// Celda CSV (RFC 4180): entre comillas si trae comillas, coma o salto de
// línea, con las comillas duplicadas.
export const celdaCsv = (valor: string) =>
  /[",\r\n]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor

// Una hoja de cálculo interpreta como fórmula una celda que empieza con
// =, +, -, @, tabulación o retorno de carro (CSV injection, OWASP). Al
// exportar se antepone un apóstrofo, que la fuerza a texto; al volver a subir
// el archivo, la carga lo quita, así el valor no cambia.
const INICIO_FORMULA = /^[=+\-@\t\r]/
export const neutralizarFormula = (valor: string) =>
  INICIO_FORMULA.test(valor) ? `'${valor}` : valor
export const quitarNeutralizacion = (valor: string) =>
  valor.startsWith("'") && INICIO_FORMULA.test(valor.slice(1))
    ? valor.slice(1)
    : valor

const bytesUtf8 = (texto: string) => new TextEncoder().encode(texto).length

// MAX_BYTES_ALUMNOS_CSV (48 KiB) limita el contenido: el backend lo mide tras
// leer el archivo, como correo,nombre con LF, sin BOM, sin apóstrofos ni
// motivo (bytesContenidoCsv). MAX_BYTES_ARCHIVO_CSV limita el archivo tal como
// llega y cubre lo que el CSV de errores agrega a un contenido de 48 KiB:
// - BOM (3 B) y ",motivo" en la cabecera (7 B);
// - CRLF en vez de LF: +1 B por línea (cabecera + 100 filas);
// - por fila, la coma y el mensaje más largo de MENSAJES_MOTIVO_CSV (52 B);
// - por celda (correo y nombre), dos comillas y el apóstrofo (3 B).
// Con 100 filas (MAX_FILAS_ALUMNOS_CSV): 49 152 + 6 011 = 55 163 B.
export const MAX_BYTES_ARCHIVO_CSV =
  MAX_BYTES_ALUMNOS_CSV +
  bytesUtf8('\uFEFF,motivo') +
  (MAX_FILAS_ALUMNOS_CSV + 1) +
  MAX_FILAS_ALUMNOS_CSV *
    (1 +
      Math.max(
        ...Object.values(MENSAJES_MOTIVO_CSV).map((mensaje) =>
          bytesUtf8(celdaCsv(mensaje)),
        ),
      ) +
      2 * 3)

// Bytes del contenido normalizado: cabecera correo,nombre y una línea
// correo,nombre por fila, con LF.
export const bytesContenidoCsv = (filas: string[][]) =>
  bytesUtf8(
    [
      'correo,nombre',
      ...filas.map(([correo = '', nombre = '']) => `${correo},${nombre}`),
    ]
      .map((linea) => `${linea}\n`)
      .join(''),
  )

export type FilaConError = Extract<FilaCargaAlumnos, { estado: 'error' }>

// CSV de las filas con error (GES-17), con la cabecera correo,nombre,motivo
// que acepta la carga para volver a subirlo corregido. Sin contraseñas ni
// filas cargadas. El BOM hace que Excel lea bien las tildes. Las celdas que una
// hoja de cálculo tomaría como fórmula llevan un apóstrofo, que la carga quita.
export function csvDeErrores(filas: FilaConError[]): string {
  const lineas = [
    'correo,nombre,motivo',
    ...filas.map((fila) =>
      [fila.correo, fila.nombre, MENSAJES_MOTIVO_CSV[fila.motivo]]
        .map((valor) => celdaCsv(neutralizarFormula(valor)))
        .join(','),
    ),
  ]
  return `\uFEFF${lineas.join('\r\n')}\r\n`
}
