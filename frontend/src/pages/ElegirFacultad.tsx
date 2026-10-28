import type {
  ElegirContexto,
  UniversidadElegible,
  UsuarioSesion,
} from '@cursus/shared'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useSession } from '../session/session'
import './Cursos.css'
import { useDatos } from './useDatos'

// MT-04: el superadmin elige la universidad y la facultad en las que trabaja,
// con las mismas vistas del Administrativo. Llega aquí después del login y
// vuelve desde el menú para cambiarlas. No tiene vista en el Figma: sigue el
// estilo de las páginas de gestión.
export function ElegirFacultad() {
  const { fetchConSesion } = useAuth()
  const { user, reemplazarUsuario } = useSession()
  const navigate = useNavigate()
  const [universidades, recargar] = useDatos<UniversidadElegible[]>(
    '/api/superadmin/universidades',
  )
  const [universidadId, setUniversidadId] = useState(user.universidadId ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (universidades === undefined) return <Cargando />
  if (universidades === null) {
    return (
      <ErrorEstado
        mensaje="No se pudieron cargar las universidades."
        onReintentar={recargar}
      />
    )
  }

  const facultades =
    universidades.find((u) => u.id === universidadId)?.facultades ?? []

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const campos = new FormData(event.currentTarget)
    const eleccion: ElegirContexto = {
      universidadId: String(campos.get('universidad')),
      facultadId: String(campos.get('facultad')),
    }
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion('/api/superadmin/contexto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eleccion),
      })
      if (respuesta.ok) {
        reemplazarUsuario((await respuesta.json()) as UsuarioSesion)
        void navigate('/cursos')
        return
      }
      setError(
        respuesta.status === 404
          ? 'Esa facultad ya no está disponible. Recarga la lista y elige otra.'
          : 'No se pudo cambiar la facultad.',
      )
    } catch {
      setError('No se pudo cambiar la facultad.')
    }
    setEnviando(false)
  }

  return (
    <section className="cursos" aria-label="Universidad y facultad">
      <div className="cursos__encabezado">
        <h2 className="cursos__titulo">Elige dónde trabajar</h2>
        <p className="cursos__subtitulo">
          {user.facultadNombre
            ? `Ahora trabajas en ${user.facultadNombre}, ${user.universidadNombre}.`
            : 'Elige una universidad y una facultad para administrar sus cursos.'}
        </p>
      </div>
      {universidades.length === 0 ? (
        <p className="cursos__subtitulo" role="status">
          Todavía no hay universidades.
        </p>
      ) : (
        <form className="cursos__tarjeta" onSubmit={handleSubmit}>
          <div className="cursos__campos">
            <label className="cursos__campo">
              Universidad
              <select
                className="cursos__input"
                name="universidad"
                required
                value={universidadId}
                onChange={(event) => setUniversidadId(event.target.value)}
              >
                <option value="" disabled>
                  Elige una universidad
                </option>
                {universidades.map((universidad) => (
                  <option key={universidad.id} value={universidad.id}>
                    {universidad.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="cursos__campo">
              Facultad
              {/* key: al cambiar de universidad, la facultad vuelve a vacío. */}
              <select
                key={universidadId}
                className="cursos__input"
                name="facultad"
                required
                disabled={!universidadId}
                defaultValue=""
              >
                <option value="" disabled>
                  {universidadId && facultades.length === 0
                    ? 'Esta universidad no tiene facultades'
                    : 'Elige una facultad'}
                </option>
                {facultades.map((facultad) => (
                  <option key={facultad.id} value={facultad.id}>
                    {facultad.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <p className="cursos__error" role="alert">
              {error}
            </p>
          )}
          <div className="cursos__acciones">
            <button className="cursos__boton" type="submit" disabled={enviando}>
              Trabajar en esta facultad
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
