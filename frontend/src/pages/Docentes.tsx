import type { CrearDocente, DocenteCreado, RolDocente } from '@cursus/shared'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'
import './Cursos.css'
import { PasswordProvisoria } from './PasswordProvisoria'

const ROL_LABEL: Record<RolDocente, string> = {
  PROFESOR: 'Profesor',
  AYUDANTE: 'Ayudante',
}

// Profesores y ayudantes (GES-21): el administrativo crea sus cuentas en su
// facultad. La contraseña provisoria se muestra una sola vez en un diálogo y
// se descarta del estado al cerrarlo. No hay listado (fuera de alcance).
export function Docentes() {
  const { fetchConSesion } = useAuth()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creado, setCreado] = useState<DocenteCreado | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulario = event.currentTarget
    const campos = new FormData(formulario)
    const docente: CrearDocente = {
      nombre: String(campos.get('nombre')),
      correo: String(campos.get('correo')),
      rol: String(campos.get('rol')) as RolDocente,
    }
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docente),
      })
      const cuerpo = (await respuesta.json().catch(() => ({}))) as Partial<
        DocenteCreado & { message: unknown }
      >
      if (respuesta.ok) {
        formulario.reset()
        setCreado(cuerpo as DocenteCreado)
      } else {
        // El 400 y el 409 traen un mensaje para el usuario; el de validación
        // del DTO llega como lista.
        const mensaje = Array.isArray(cuerpo.message)
          ? (cuerpo.message as unknown[])[0]
          : cuerpo.message
        setError(
          typeof mensaje === 'string' && respuesta.status < 500
            ? mensaje
            : 'No se pudo crear la cuenta.',
        )
      }
    } catch {
      setError('No se pudo crear la cuenta.')
    }
    setEnviando(false)
  }

  return (
    <section className="cursos" aria-label="Profesores y ayudantes">
      <div className="cursos__encabezado">
        <h2 className="cursos__titulo">Crear cuenta de profesor o ayudante</h2>
        <p className="cursos__subtitulo">
          La cuenta queda en tu facultad, con una contraseña provisoria.
        </p>
      </div>
      <form className="cursos__tarjeta" onSubmit={handleSubmit}>
        <div className="cursos__campos">
          <label className="cursos__campo">
            Nombre
            <input
              className="cursos__input"
              name="nombre"
              required
              maxLength={120}
              autoComplete="off"
            />
          </label>
          <label className="cursos__campo">
            Correo institucional
            <input
              className="cursos__input"
              name="correo"
              type="email"
              required
              autoComplete="off"
            />
          </label>
        </div>
        <fieldset className="cursos__opciones">
          <legend className="cursos__campo">Rol</legend>
          {(['PROFESOR', 'AYUDANTE'] as const).map((rol) => (
            <label key={rol} className="cursos__opcion">
              <input
                type="radio"
                name="rol"
                value={rol}
                required
                defaultChecked={rol === 'PROFESOR'}
              />
              {ROL_LABEL[rol]}
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="cursos__error" role="alert">
            {error}
          </p>
        )}
        <div className="cursos__acciones">
          <button className="cursos__boton" type="submit" disabled={enviando}>
            Crear cuenta
          </button>
        </div>
      </form>
      {creado && (
        <CuentaCreada creado={creado} onCerrar={() => setCreado(null)} />
      )}
    </section>
  )
}

function CuentaCreada({
  creado,
  onCerrar,
}: {
  creado: DocenteCreado
  onCerrar: () => void
}) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const { usuario } = creado

  // Modal nativo: atrapa el foco y cierra con Escape (evento close).
  useEffect(() => {
    dialogo.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialogo}
      className="cursos__dialogo"
      aria-labelledby="cuenta-creada-titulo"
      onClose={onCerrar}
    >
      <h3 id="cuenta-creada-titulo" className="cursos__titulo-dialogo">
        {ROL_LABEL[usuario.rol]} creado
      </h3>
      <PasswordProvisoria
        nombre={usuario.nombre}
        correo={usuario.correo}
        password={creado.passwordProvisoria}
        destinatario={
          usuario.rol === 'PROFESOR' ? 'al profesor' : 'al ayudante'
        }
        onCerrar={onCerrar}
      />
    </dialog>
  )
}
