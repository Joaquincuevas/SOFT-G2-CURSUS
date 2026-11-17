import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/auth'

// GET /api/espacio/secciones/:id/<recurso> de cada sección, en paralelo (no
// hay un endpoint que junte las de todas). undefined mientras carga y null si
// alguna falla; `recargar` vuelve a pedir todas. Con `ids` null no pide nada.
export function useDeSecciones<T>(
  ids: readonly string[] | null | undefined,
  recurso: string,
) {
  const { fetchConSesion } = useAuth()
  const [intento, setIntento] = useState(0)
  const [resultado, setResultado] = useState<{
    clave: string
    datos: [string, T][] | null
  } | null>(null)
  const claveIds = ids ? ids.join(',') : null
  const lista = useMemo(() => (claveIds ? claveIds.split(',') : []), [claveIds])
  const clave = `${intento}:${claveIds}`

  useEffect(() => {
    if (lista.length === 0) return
    let vigente = true
    void Promise.all(
      lista.map(async (id): Promise<[string, T]> => {
        const respuesta = await fetchConSesion(
          `/api/espacio/secciones/${id}/${recurso}`,
        )
        if (!respuesta.ok) throw new Error(String(respuesta.status))
        return [id, (await respuesta.json()) as T]
      }),
    ).then(
      (datos) => vigente && setResultado({ clave, datos }),
      () => vigente && setResultado({ clave, datos: null }),
    )
    return () => {
      vigente = false
    }
  }, [fetchConSesion, lista, recurso, clave])

  const recargar = () => setIntento((n) => n + 1)
  if (ids === null || ids === undefined) return [undefined, recargar] as const
  if (ids.length === 0) return [[] as [string, T][], recargar] as const
  return [
    resultado?.clave === clave ? resultado.datos : undefined,
    recargar,
  ] as const
}
