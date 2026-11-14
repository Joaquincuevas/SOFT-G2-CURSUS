import { useEffect, useState } from 'react'

// true mientras la consulta de medios coincide (por ejemplo, '(min-width:
// 1024px)'). Se actualiza al cambiar el tamaño de la ventana. Sin matchMedia
// (jsdom sin el polyfill) no coincide.
export function useMediaQuery(consulta: string): boolean {
  const [coincide, setCoincide] = useState(
    () => window.matchMedia?.(consulta).matches ?? false,
  )
  useEffect(() => {
    const lista = window.matchMedia?.(consulta)
    if (!lista) return
    const alCambiar = () => setCoincide(lista.matches)
    alCambiar()
    lista.addEventListener('change', alCambiar)
    return () => lista.removeEventListener('change', alCambiar)
  }, [consulta])
  return coincide
}
