import { createContext, useContext, useEffect } from 'react'
import type { Miga } from './migas'

// Pasos del breadcrumb que solo la página conoce (el nombre de un curso, de una
// universidad…). La página los registra y el encabezado los lee.
export interface ValorMigas {
  cola: Miga[] | null
  fijarCola: (cola: Miga[] | null) => void
  // Último paso que muestra el encabezado (el h1 de la página). Lo publica el
  // encabezado y lo leen las primitivas, como PageHeader, para no repetirlo.
  actual: string | null
  fijarActual: (etiqueta: string | null) => void
}

export const MigasContext = createContext<ValorMigas | null>(null)

export function useMigasCola(): Miga[] | null {
  return useContext(MigasContext)?.cola ?? null
}

// Una página registra sus pasos mientras está montada. Fuera del AppShell (por
// ejemplo, en una prueba que monta la página sola) no hace nada. La lista se
// compara por su contenido: la página puede armarla en cada render.
//
//   useMigas(curso ? [{ etiqueta: curso.nombre }] : null)
export function useMigas(cola: Miga[] | null) {
  const fijar = useContext(MigasContext)?.fijarCola
  const clave = cola ? JSON.stringify(cola) : null
  useEffect(() => {
    if (!fijar) return
    fijar(clave ? (JSON.parse(clave) as Miga[]) : null)
    return () => fijar(null)
  }, [fijar, clave])
}

// Atajo para una página que solo aporta el nombre del último paso.
export function useEtiquetaDeMiga(etiqueta: string | null) {
  useMigas(etiqueta ? [{ etiqueta }] : null)
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
