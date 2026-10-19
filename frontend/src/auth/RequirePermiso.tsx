import { Navigate } from 'react-router'
import { puedeVer, type NavItem } from '../navigation'
import { useSession } from '../session/session'

// Guard de cada ruta del menú: si el rol no tiene el permiso del ítem (por
// ejemplo, una URL de otro rol escrita a mano), vuelve a su Dashboard.
export function RequirePermiso({ item }: { item: NavItem }) {
  const { ability } = useSession()

  if (!puedeVer(item, ability)) {
    return <Navigate to="/" replace />
  }
  const Page = item.page
  return Page ? <Page /> : null
}
