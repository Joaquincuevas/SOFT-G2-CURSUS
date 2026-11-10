import type { UsuarioSesion } from '@cursus/shared'
import { useLayoutEffect } from 'react'
import { coloresDelTema } from './colores'

// Se aplica antes de pintar, también al restaurar la sesión o reemplazar el
// contexto del superadmin. El cleanup devuelve el login al tema de CURSUS.
export function TemaUniversidad({
  usuario,
}: {
  usuario: UsuarioSesion | null
}) {
  const color =
    usuario?.universidadId && usuario.rol !== 'DIRECTOR'
      ? usuario.universidadColor
      : null

  useLayoutEffect(() => {
    const colores = coloresDelTema(color)
    if (!colores) return
    const { style } = document.documentElement
    for (const [variable, valor] of Object.entries(colores))
      style.setProperty(variable, valor)
    return () => {
      for (const variable of Object.keys(colores))
        style.removeProperty(variable)
    }
  }, [color])

  return null
}
