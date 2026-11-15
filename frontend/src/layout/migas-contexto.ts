import { createContext, useContext, useEffect } from 'react'

// Nombre del último paso del breadcrumb cuando solo la página lo conoce (por
// ejemplo, «ICC101 · Sección 1»). La página lo registra y el encabezado lo lee.
export interface ValorMigas {
  dinamica: string | null
  fijarDinamica: (etiqueta: string | null) => void
  // Último paso que muestra el encabezado (el h1 de la página). Lo publica el
  // encabezado y lo leen las primitivas, como PageHeader, para no repetirlo.
  actual: string | null
  fijarActual: (etiqueta: string | null) => void
}

export const MigasContext = createContext<ValorMigas | null>(null)

export function useMigasDinamica(): string | null {
  return useContext(MigasContext)?.dinamica ?? null
}

// Una página registra su nombre mientras está montada. Fuera del AppShell (por
// ejemplo, en una prueba que monta la página sola) no hace nada.
export function useEtiquetaDeMiga(etiqueta: string | null) {
  const fijar = useContext(MigasContext)?.fijarDinamica
  useEffect(() => {
    if (!fijar) return
    fijar(etiqueta)
    return () => fijar(null)
  }, [fijar, etiqueta])
}

// Último paso del breadcrumb que muestra el encabezado, o null fuera del
// AppShell.
export function useMigaActual(): string | null {
  return useContext(MigasContext)?.actual ?? null
}

// El encabezado publica su último paso mientras está montado.
export function usePublicarMigaActual(etiqueta: string) {
  const fijar = useContext(MigasContext)?.fijarActual
  useEffect(() => {
    if (!fijar) return
    fijar(etiqueta)
    return () => fijar(null)
  }, [fijar, etiqueta])
}
