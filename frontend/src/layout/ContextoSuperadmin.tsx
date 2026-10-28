import type { UsuarioSesion } from '@cursus/shared'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { debeElegirFacultad, useSession } from '../session/session'
import './ContextoSuperadmin.css'

// MT-04: barra sobre el contenido de cada página. Le recuerda al superadmin
// dónde está trabajando (sus cambios quedan auditados), con atajos para
// cambiar de facultad o salir a la vista global.
export function ContextoSuperadmin() {
  const { fetchConSesion } = useAuth()
  const { user, reemplazarUsuario } = useSession()
  const navigate = useNavigate()
  const [saliendo, setSaliendo] = useState(false)
  const [error, setError] = useState(false)

  if (user.rol !== 'SUPERADMIN') return null

  if (debeElegirFacultad(user)) {
    return (
      <div className="contexto-superadmin" role="region" aria-label="Contexto">
        <p className="contexto-superadmin__texto">
          Vista global: no estás trabajando en ninguna universidad.
        </p>
      </div>
    )
  }

  async function salir() {
    setSaliendo(true)
    setError(false)
    try {
      const respuesta = await fetchConSesion('/api/superadmin/contexto', {
        method: 'DELETE',
      })
      if (respuesta.ok) {
        reemplazarUsuario((await respuesta.json()) as UsuarioSesion)
        void navigate('/')
        setSaliendo(false)
        return
      }
    } catch {
      // Se informa abajo.
    }
    setError(true)
    setSaliendo(false)
  }

  return (
    <div className="contexto-superadmin" role="region" aria-label="Contexto">
      <p className="contexto-superadmin__texto">
        Trabajando en{' '}
        <strong>
          {user.facultadNombre}, {user.universidadNombre}
        </strong>
      </p>
      {error && (
        <p className="contexto-superadmin__error" role="alert">
          No se pudo salir de la universidad.
        </p>
      )}
      <div className="contexto-superadmin__acciones">
        <Link className="contexto-superadmin__accion" to="/">
          Cambiar
        </Link>
        <button
          type="button"
          className="contexto-superadmin__accion"
          disabled={saliendo}
          onClick={() => void salir()}
        >
          Salir de la universidad
        </button>
      </div>
    </div>
  )
}
