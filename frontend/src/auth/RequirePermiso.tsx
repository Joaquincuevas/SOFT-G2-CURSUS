import { Navigate } from 'react-router'
import { AvisoElegirFacultad } from '../components/AvisoElegirFacultad'
import { puedeVer, type NavItem } from '../navigation'
import { debeElegirFacultad, useSession } from '../session/session'

// MT-04: rutas que el superadmin usa sin universidad elegida (su Dashboard,
// su perfil y la administración de universidades de GES-23). El resto son las
// del Administrativo, que la API le rechaza hasta que elija una.
const RUTAS_SIN_FACULTAD = ['/', '/perfil', '/superadmin']

// Guard de cada ruta del menú: si el rol no tiene el permiso del ítem (por
// ejemplo, una URL de otro rol escrita a mano), vuelve a su Dashboard.
export function RequirePermiso({ item }: { item: NavItem }) {
  const { ability, user } = useSession()

  if (!puedeVer(item, ability)) {
    return <Navigate to="/" replace />
  }
  if (debeElegirFacultad(user) && !RUTAS_SIN_FACULTAD.includes(item.to)) {
    return <AvisoElegirFacultad />
  }
  const Page = item.page
  return Page ? <Page /> : null
}
