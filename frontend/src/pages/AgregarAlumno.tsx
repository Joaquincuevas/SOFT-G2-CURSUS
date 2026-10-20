import {
  type AgregarAlumno,
  type AlumnoAgregado,
  LARGO_NOMBRE_USUARIO,
} from '@cursus/shared'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'

// Mensaje del backend cuando el alumno no tiene cuenta y falta su nombre.
const FALTA_NOMBRE = 'Ingresa el nombre del alumno'

// Diálogo para agregar un alumno a una sección por su correo (GES-15). El
// nombre se pide solo si el backend responde que hay que crear la cuenta. Si
// se creó, muestra la contraseña provisoria una sola vez: vive solo en el
// estado de este diálogo, que se descarta al cerrarlo.
export function AgregarAlumnoDialogo({
  seccionId,
  numero,
  onAgregado,
  onCerrar,
}: {
  seccionId: string
  numero: number
  onAgregado: (resultado: AlumnoAgregado) => void
  onCerrar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const dialogo = useRef<HTMLDialogElement>(null)
  const [pedirNombre, setPedirNombre] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creado, setCreado] = useState<AlumnoAgregado | null>(null)
  const [copiada, setCopiada] = useState(false)

  // Modal nativo: atrapa el foco y cierra con Escape (evento close).
  useEffect(() => {
    dialogo.current?.showModal()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulario = new FormData(event.currentTarget)
    const datos: AgregarAlumno = { correo: String(formulario.get('correo')) }
    if (pedirNombre) datos.nombre = String(formulario.get('nombre'))
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion(
        `/api/secciones/${seccionId}/alumnos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(datos),
        },
      )
      const cuerpo = (await respuesta.json().catch(() => ({}))) as Partial<
        AlumnoAgregado & { message: unknown }
      >
      if (respuesta.ok) {
        const resultado = cuerpo as AlumnoAgregado
        onAgregado(resultado)
        if (!resultado.cuentaCreada) return onCerrar()
        setCreado(resultado)
      } else {
        if (cuerpo.message === FALTA_NOMBRE) setPedirNombre(true)
        // El 400 y el 409 traen un mensaje para el usuario; el de validación
        // del DTO llega como lista.
        const mensaje = Array.isArray(cuerpo.message)
          ? (cuerpo.message as unknown[])[0]
          : cuerpo.message
        setError(
          typeof mensaje === 'string' && respuesta.status < 500
            ? mensaje
            : 'No se pudo agregar al alumno.',
        )
      }
    } catch {
      setError('No se pudo agregar al alumno.')
    }
    setEnviando(false)
  }

  async function copiar(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      setCopiada(true)
    } catch {
      setError('No se pudo copiar; cópiala a mano.')
    }
  }

  return (
    <dialog
      ref={dialogo}
      className="cursos__dialogo"
      aria-labelledby="agregar-alumno-titulo"
      onClose={onCerrar}
    >
      <h3 id="agregar-alumno-titulo" className="cursos__titulo-dialogo">
        Agregar alumno a la sección {numero}
      </h3>
      {creado?.passwordProvisoria ? (
        <>
          <p className="cursos__mensaje">
            Se creó la cuenta de {creado.alumno.nombre} ({creado.alumno.correo}
            ). Su contraseña provisoria es:
          </p>
          <p className="cursos__password">
            <code>{creado.passwordProvisoria}</code>
          </p>
          <p className="cursos__error">
            <strong>No se volverá a mostrar.</strong> Cópiala y entrégasela al
            alumno.
          </p>
          {copiada && (
            <p className="cursos__exito" role="status">
              Contraseña copiada.
            </p>
          )}
          {error && (
            <p className="cursos__error" role="alert">
              {error}
            </p>
          )}
          <div className="cursos__acciones">
            <button
              className="cursos__boton cursos__boton--secundario"
              type="button"
              onClick={() => void copiar(creado.passwordProvisoria as string)}
            >
              Copiar
            </button>
            <button className="cursos__boton" type="button" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        </>
      ) : (
        <form className="cursos__formulario" onSubmit={handleSubmit}>
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
          {pedirNombre && (
            <label className="cursos__campo">
              Nombre
              <input
                className="cursos__input"
                name="nombre"
                required
                maxLength={LARGO_NOMBRE_USUARIO}
                autoComplete="off"
              />
            </label>
          )}
          {error && (
            <p className="cursos__error" role="alert">
              {error}
            </p>
          )}
          <div className="cursos__acciones">
            <button
              className="cursos__boton cursos__boton--secundario"
              type="button"
              onClick={onCerrar}
            >
              Cancelar
            </button>
            <button className="cursos__boton" type="submit" disabled={enviando}>
              Agregar
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
