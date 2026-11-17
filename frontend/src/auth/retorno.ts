import type { AppAbility } from '@cursus/shared'
import { navItemFor, puedeVer } from '../navigation'

const ORIGEN = 'http://cursus.local'

// new URL lanza TypeError con valores mal formados (por ejemplo, «//»): no
// es una ruta interna.
function esInterna(ruta: string): boolean {
  try {
    return new URL(ruta, ORIGEN).origin === ORIGEN
  } catch {
    return false
  }
}

// A dónde va el usuario al iniciar sesión. Solo vuelve a `from` (la ruta que
// pidió RequireAuth sin sesión) si es de la misma cuenta, es una ruta interna
// ("/x", nunca "//x" ni con esquema) y esa cuenta tiene permiso para verla.
// En cualquier otro caso, al Dashboard.
export function destinoTrasLogin(
  from: unknown,
  mismoUsuario: boolean,
  ability: AppAbility,
): string {
  if (!mismoUsuario || typeof from !== 'string') return '/'
  // new URL resuelve como el navegador (quita tabs y saltos, trata "\\" como
  // "/"): si el destino saldría del origen, no es una ruta interna.
  if (!from.startsWith('/') || !esInterna(from)) return '/'
  const item = navItemFor(from.split(/[?#]/)[0])
  return item && puedeVer(item, ability) ? from : '/'
}
