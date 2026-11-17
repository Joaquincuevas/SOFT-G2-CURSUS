import { createContext, useContext, useEffect } from 'react'

// Curso que la página abierta muestra, para que el menú lateral arme sus
// ítems (código, nombre y sección). La vista de la sección lo registra
// mientras está montada.
export interface InfoCurso {
  seccionId: string
  codigo: string
  nombre: string
  numero: number
}

export interface ValorCurso {
  curso: InfoCurso | null
  fijarCurso: (curso: InfoCurso | null) => void
}

export const CursoContext = createContext<ValorCurso | null>(null)

// Curso abierto, o null fuera de una sección (o fuera del AppShell).
export function useCursoActual(): InfoCurso | null {
  return useContext(CursoContext)?.curso ?? null
}

// Fuera del AppShell (una prueba que monta la página sola) no hace nada.
export function useRegistrarCurso(
  seccionId: string,
  codigo: string | undefined,
  nombre: string | undefined,
  numero: number | undefined,
) {
  const fijar = useContext(CursoContext)?.fijarCurso
  useEffect(() => {
    if (!fijar || codigo === undefined || nombre === undefined || !numero)
      return
    fijar({ seccionId, codigo, nombre, numero })
    return () => fijar(null)
  }, [fijar, seccionId, codigo, nombre, numero])
}
