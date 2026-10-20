import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth'

// GET con la sesión: undefined mientras carga y null si falla; en ese caso
// `status` dice cómo falló (por ejemplo, 404), o es undefined si el backend
// no respondió. `recargar` vuelve a pedir, para el botón Reintentar. Con
// `ruta` null no pide nada.
export function useDatos<T>(ruta: string | null) {
  const { fetchConSesion } = useAuth()
  const [resultado, setResultado] = useState<{
    datos: T | null | undefined
    status?: number
  }>({ datos: undefined })
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    if (ruta === null) return
    let vigente = true
    void fetchConSesion(ruta)
      .then(async (respuesta) =>
        respuesta.ok
          ? { datos: (await respuesta.json()) as T }
          : { datos: null, status: respuesta.status },
      )
      .catch(() => ({ datos: null }))
      .then((nuevo) => {
        if (vigente) setResultado(nuevo)
      })
    return () => {
      vigente = false
    }
  }, [fetchConSesion, ruta, intento])
  const recargar = () => {
    setResultado({ datos: undefined })
    setIntento((n) => n + 1)
  }
  return [resultado.datos, recargar, resultado.status] as const
}
