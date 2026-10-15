import type { Rol } from '@cursus/shared'
import { useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_ROL, mockUser, SessionContext } from './session'

interface Props {
  children: ReactNode
  initialRol?: Rol
}

export function SessionProvider({ children, initialRol = DEFAULT_ROL }: Props) {
  const [rol, setRol] = useState<Rol>(initialRol)

  const value = useMemo(
    () => ({
      user: mockUser(rol),
      setRol,
      // Nota: solo resetea el mock; el cierre de sesión real es de AUTH-03
      logout: () => setRol(DEFAULT_ROL),
    }),
    [rol],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}
