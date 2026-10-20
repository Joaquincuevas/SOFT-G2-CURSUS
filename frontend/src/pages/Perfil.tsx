import {
  LARGO_NOMBRE_USUARIO,
  type ActualizarPerfil,
  type PerfilActualizado,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { ROL_LABEL } from '../session/roles'
import { useSession } from '../session/session'
import { CambiarPassword } from './CambiarPassword'
import './Perfil.css'

// Perfil del usuario (PER-01). El Figma no tiene esta pantalla: sigue el
// estilo de las tarjetas y campos de gestión de cursos. Solo el nombre se
// edita; el Director lo ve en solo lectura (ADR 0001). Debajo, todos los roles
// pueden cambiar su contraseña (PER-02).
export function Perfil() {
  const { user, actualizarNombre } = useSession()
  const { fetchConSesion } = useAuth()
  const editable = user.rol !== 'DIRECTOR'
  const [nombre, setNombre] = useState(user.nombre)
  const [enviando, setEnviando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sinCambios = nombre.trim() === user.nombre

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEnviando(true)
    setGuardado(false)
    setError(null)
    try {
      const respuesta = await fetchConSesion('/api/perfil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre } satisfies ActualizarPerfil),
      })
      if (respuesta.ok) {
        const guardadoEnApi = (await respuesta.json()) as PerfilActualizado
        actualizarNombre(guardadoEnApi.nombre)
        setNombre(guardadoEnApi.nombre)
        setGuardado(true)
      } else if (respuesta.status === 400) {
        setError(
          `El nombre no puede quedar vacío ni tener más de ${LARGO_NOMBRE_USUARIO} caracteres.`,
        )
      } else if (respuesta.status !== 401) {
        // Con 401 la sesión ya se cerró y la app volvió al login.
        setError('No se pudo guardar el nombre. Intenta de nuevo.')
      }
    } catch {
      setError('No se pudo guardar el nombre. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="perfil" aria-label="Mi perfil">
      <form className="perfil__tarjeta" onSubmit={handleSubmit}>
        <div className="perfil__campos">
          <label className="perfil__campo">
            Nombre
            <input
              className="perfil__input"
              name="nombre"
              value={nombre}
              onChange={(event) => {
                setNombre(event.target.value)
                setGuardado(false)
              }}
              maxLength={LARGO_NOMBRE_USUARIO}
              readOnly={!editable}
              required
            />
          </label>
          <label className="perfil__campo">
            Correo institucional
            <input className="perfil__input" value={user.correo} readOnly />
          </label>
          <label className="perfil__campo">
            Rol
            <input
              className="perfil__input"
              value={ROL_LABEL[user.rol]}
              readOnly
            />
          </label>
          <label className="perfil__campo">
            Universidad
            <input
              className="perfil__input"
              value={user.universidadNombre}
              readOnly
            />
          </label>
          {user.facultadNombre && (
            <label className="perfil__campo">
              Facultad
              <input
                className="perfil__input"
                value={user.facultadNombre}
                readOnly
              />
            </label>
          )}
        </div>

        {editable ? (
          <p className="perfil__nota">
            Solo puedes cambiar tu nombre. Para corregir otros datos, contacta
            al administrativo de tu facultad.
          </p>
        ) : (
          <p className="perfil__nota">
            Como Director, tus datos son de solo lectura.
          </p>
        )}

        {error && (
          <p className="perfil__error" role="alert">
            {error}
          </p>
        )}
        {guardado && (
          <p className="perfil__exito" role="status">
            Nombre actualizado.
          </p>
        )}

        {editable && (
          <div>
            <button
              type="submit"
              className="perfil__boton"
              disabled={enviando || sinCambios || !nombre.trim()}
            >
              {enviando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </form>
      <CambiarPassword />
    </section>
  )
}
