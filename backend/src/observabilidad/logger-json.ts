import type { LoggerService } from '@nestjs/common'
import { requestIdActual } from './contexto-solicitud.js'
import {
  errorSeguro,
  redactar,
  redactarTexto,
  stackSeguro,
} from './redaccion.js'

// Niveles de más a menos importante. LOG_LEVEL deja pasar ese y los anteriores.
const NIVELES = ['fatal', 'error', 'warn', 'info', 'debug', 'verbose'] as const
export type Nivel = (typeof NIVELES)[number]

export function nivelDesde(valor: string | undefined): Nivel {
  const nivel = valor?.trim().toLowerCase()
  const normal = nivel === 'log' ? 'info' : nivel
  return (NIVELES as readonly string[]).includes(normal ?? '')
    ? (normal as Nivel)
    : 'info'
}

export function entornoActual(entorno: NodeJS.ProcessEnv = process.env) {
  return entorno.ENTORNO || entorno.NODE_ENV || 'desconocido'
}

interface Opciones {
  nivel?: Nivel
  entorno?: string
  // Una línea por llamada, sin salto final. Por defecto, stdout.
  escribir?: (linea: string) => void
}

// El arranque de Nest escribe una línea por ruta mapeada (cientos). Es útil
// al depurar y ruido en CloudWatch: se baja a debug.
const CONTEXTOS_DE_ARRANQUE = new Set([
  'RouterExplorer',
  'RoutesResolver',
  'InstanceLoader',
])

// Claves que el log fija él mismo: lo que llegue con esos nombres no las pisa.
const RESERVADAS = ['timestamp', 'level', 'environment', 'requestId', 'context']

// OBS-01. Logger de NestJS que escribe una línea JSON por evento en stdout,
// donde el driver awslogs de ECS la lleva a CloudWatch. Todo lo que escribe
// pasa por redactar().
export class LoggerJson implements LoggerService {
  private readonly nivel: Nivel
  private readonly entorno: string
  private readonly escribir: (linea: string) => void

  constructor({ nivel, entorno, escribir }: Opciones = {}) {
    this.nivel = nivel ?? nivelDesde(process.env.LOG_LEVEL)
    this.entorno = entorno ?? entornoActual()
    this.escribir = escribir ?? ((linea) => process.stdout.write(`${linea}\n`))
  }

  log(mensaje: unknown, ...resto: unknown[]) {
    this.emitir('info', mensaje, resto)
  }
  error(mensaje: unknown, ...resto: unknown[]) {
    this.emitir('error', mensaje, resto)
  }
  warn(mensaje: unknown, ...resto: unknown[]) {
    this.emitir('warn', mensaje, resto)
  }
  debug(mensaje: unknown, ...resto: unknown[]) {
    this.emitir('debug', mensaje, resto)
  }
  verbose(mensaje: unknown, ...resto: unknown[]) {
    this.emitir('verbose', mensaje, resto)
  }
  fatal(mensaje: unknown, ...resto: unknown[]) {
    this.emitir('fatal', mensaje, resto)
  }

  private emitir(nivelPedido: Nivel, mensaje: unknown, resto: unknown[]) {
    const nivel =
      nivelPedido === 'info' &&
      CONTEXTOS_DE_ARRANQUE.has(resto.at(-1) as string)
        ? 'debug'
        : nivelPedido
    if (NIVELES.indexOf(nivel) > NIVELES.indexOf(this.nivel)) return
    // Convención de Nest: el último texto es el contexto (nombre de la clase);
    // en error(), un texto con "    at " antes es el stack.
    const textos = [...resto]
    const contexto =
      typeof textos.at(-1) === 'string' ? (textos.pop() as string) : undefined
    const stack = textos.find((t): t is string => typeof t === 'string')
    const extras: Record<string, unknown> =
      mensaje !== null &&
      typeof mensaje === 'object' &&
      !(mensaje instanceof Error)
        ? { ...(mensaje as Record<string, unknown>) }
        : {}
    const texto =
      typeof mensaje === 'string'
        ? mensaje
        : mensaje instanceof Error
          ? // El texto de un error no se escribe (ver errorSeguro).
            'error no controlado'
          : typeof extras.message === 'string'
            ? extras.message
            : JSON.stringify(redactar(mensaje))
    delete extras.message
    // Un Error en un campo (error: …) también se reduce a tipo, código y
    // frames, y no pasa por la redacción por clave (que ocultaría "code").
    const errorExtra =
      extras.error instanceof Error ? errorSeguro(extras.error) : undefined
    if (errorExtra) delete extras.error
    for (const clave of RESERVADAS) delete extras[clave]
    const requestId = requestIdActual()
    // Primero las claves fijas, para leer la línea de corrido; los campos del
    // llamador ya no traen ninguna de ellas.
    const linea = {
      timestamp: new Date().toISOString(),
      level: nivel,
      environment: this.entorno,
      ...(contexto ? { context: redactarTexto(contexto) } : {}),
      ...(requestId ? { requestId } : {}),
      message: redactarTexto(texto),
      ...(redactar(extras) as Record<string, unknown>),
      ...(errorExtra ? { error: errorExtra } : {}),
      ...(mensaje instanceof Error
        ? { error: errorSeguro(mensaje) }
        : stack
          ? { stack: stackSeguro(stack) }
          : {}),
    }
    // JSON.stringify escapa los saltos de línea: es una sola línea.
    this.escribir(JSON.stringify(linea))
  }
}
