import { useMemo, useState, type ReactNode } from 'react'
import type { Miga } from './migas'
import { MigasContext } from './migas-contexto'

export function MigasProvider({ children }: { children: ReactNode }) {
  const [cola, fijarCola] = useState<Miga[] | null>(null)
  const [actual, fijarActual] = useState<string | null>(null)
  const valor = useMemo(
    () => ({ cola, fijarCola, actual, fijarActual }),
    [cola, actual],
  )
  return <MigasContext value={valor}>{children}</MigasContext>
}
