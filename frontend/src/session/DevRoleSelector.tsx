import { ROLES, type Rol } from '@cursus/shared'
import { useSession } from './session'
import './DevRoleSelector.css'

// Solo para desarrollo: cambia el rol de la sesión simulada. AppShell lo
// monta únicamente si import.meta.env.DEV.
export function DevRoleSelector() {
  const { user, setRol } = useSession()

  return (
    <label className="dev-role-selector">
      Rol (dev)
      <select value={user.rol} onChange={(e) => setRol(e.target.value as Rol)}>
        {ROLES.map((rol) => (
          <option key={rol} value={rol}>
            {rol}
          </option>
        ))}
      </select>
    </label>
  )
}
