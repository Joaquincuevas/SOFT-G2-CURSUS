import { useMemo, useState, type ReactNode } from 'react'
import { MigasContext } from './migas-contexto'

export function MigasProvider({ children }: { children: ReactNode }) {
  const [dinamica, fijarDinamica] = useState<string | null>(null)
  const valor = useMemo(() => ({ dinamica, fijarDinamica }), [dinamica])
  return <MigasContext value={valor}>{children}</MigasContext>
}
