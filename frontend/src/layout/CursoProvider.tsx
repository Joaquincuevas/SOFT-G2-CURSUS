import { useMemo, useState, type ReactNode } from 'react'
import { CursoContext, type InfoCurso } from './curso-contexto'

export function CursoProvider({ children }: { children: ReactNode }) {
  const [curso, fijarCurso] = useState<InfoCurso | null>(null)
  const valor = useMemo(() => ({ curso, fijarCurso }), [curso])
  return <CursoContext value={valor}>{children}</CursoContext>
}
