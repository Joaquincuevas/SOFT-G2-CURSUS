import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { BaseDeDatos } from '../database/base-de-datos.service.js'

export const MAX_FALLOS_CUENTA = 5
export const MAX_FALLOS_IP = 20
export const VENTANA_LOGIN_MS = 15 * 60 * 1000

export const claveIntentos = (tipo: 'cuenta' | 'ip', valor: string) =>
  createHash('sha256').update(`${tipo}:${valor}`).digest('hex')

@Injectable()
export class LimiteLogin {
  constructor(private readonly bd: BaseDeDatos) {}

  // Ejecuta `autenticar` con el límite de fallos de la cuenta (y de la IP, si
  // viene). `autenticar` devuelve null si la contraseña no es correcta, lo que
  // cuenta como fallo; cualquier otro resultado reinicia los contadores. Lo usan
  // el login y el cambio de contraseña (PER-02), que comparten el contador de
  // la cuenta.
  async intentar<T>(
    correo: string,
    ip: string | null,
    autenticar: (bd: Pick<BaseDeDatos, 'query'>) => Promise<T | null>,
  ): Promise<{ resultado: T | null; retryAfter: number }> {
    const limites = new Map([
      [claveIntentos('cuenta', correo.trim().toLowerCase()), MAX_FALLOS_CUENTA],
    ])
    if (ip !== null) limites.set(claveIntentos('ip', ip), MAX_FALLOS_IP)
    const claves = [...limites.keys()].sort()
    // Los dos bloqueos se toman siempre en el mismo orden. Autenticación y
    // contadores usan la misma conexión para no agotar el pool al esperar.
    return this.bd.enTransaccion(async (bd) => {
      for (const clave of claves) {
        await bd.query(
          `INSERT INTO limite_login (clave) VALUES ($1) ON CONFLICT DO NOTHING`,
          [clave],
        )
        await bd.query(
          `SELECT clave FROM limite_login WHERE clave = $1 FOR UPDATE`,
          [clave],
        )
      }
      // now() sería el comienzo de la transacción, anterior a la espera por
      // los bloqueos; necesitamos la hora real del servidor de base de datos.
      const [{ ahora }] = await bd.query<{ ahora: Date }>(
        `SELECT clock_timestamp() AS ahora`,
      )
      const filas = await bd.query<{ clave: string; fallos: Date[] }>(
        `SELECT clave, fallos FROM limite_login WHERE clave = ANY($1)`,
        [claves],
      )
      const vigentes = filas.map((fila) => ({
        ...fila,
        fallos: fila.fallos.filter(
          (fecha) => fecha.getTime() > ahora.getTime() - VENTANA_LOGIN_MS,
        ),
      }))
      const espera = () =>
        Math.max(
          0,
          ...vigentes.map(({ clave, fallos }) =>
            fallos.length >= limites.get(clave)!
              ? Math.max(
                  1,
                  Math.ceil(
                    (fallos[0].getTime() + VENTANA_LOGIN_MS - ahora.getTime()) /
                      1000,
                  ),
                )
              : 0,
          ),
        )
      if (espera()) return { resultado: null, retryAfter: espera() }

      const resultado = await autenticar(bd)
      const valido = resultado !== null
      for (const fila of vigentes) {
        fila.fallos = valido ? [] : [...fila.fallos, ahora]
        await bd.query(`UPDATE limite_login SET fallos = $2 WHERE clave = $1`, [
          fila.clave,
          fila.fallos,
        ])
      }
      // El controller genera 401/429 después del commit: lanzar aquí una
      // excepción HTTP desharía los fallos registrados.
      return { resultado, retryAfter: valido ? 0 : espera() }
    })
  }
}
