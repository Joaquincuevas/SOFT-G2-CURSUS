import { LARGO_NOMBRE_CARRERA, type Carrera } from '@cursus/shared'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import './Carreras.css'

const ordenar = (carreras: Carrera[]) =>
  [...carreras].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

export function Carreras() {
  const { fetchConSesion } = useAuth()
  const [carreras, setCarreras] = useState<Carrera[] | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [nombre, setNombre] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let activa = true
    async function cargar() {
      setErrorCarga(null)
      setCarreras(null)
      try {
        const respuesta = await fetchConSesion('/api/carreras')
        if (!respuesta.ok) throw new Error('carga')
        const filas = (await respuesta.json()) as Carrera[]
        if (activa) setCarreras(ordenar(filas))
      } catch {
        if (activa)
          setErrorCarga(
            'No pudimos cargar las carreras. Intenta actualizar el listado.',
          )
      }
    }
    void cargar()
    return () => {
      activa = false
    }
  }, [fetchConSesion, revision])

  function nueva() {
    setNombre('')
    setEditando(null)
    setError(null)
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const limpio = nombre.trim().replace(/\s+/gu, ' ')
    if (!limpio) {
      setError('Ingresa el nombre de la carrera')
      input.current?.focus()
      return
    }
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const respuesta = await fetchConSesion(
        editando ? `/api/carreras/${editando}` : '/api/carreras',
        {
          method: editando ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: limpio }),
        },
      )
      if (!respuesta.ok) {
        setError(
          respuesta.status === 409
            ? 'Ya existe una carrera con ese nombre en tu facultad'
            : respuesta.status === 404
              ? 'La carrera ya no está disponible. Actualiza el listado.'
              : 'No pudimos guardar la carrera. Revisa el nombre e inténtalo nuevamente.',
        )
        return
      }
      const carrera = (await respuesta.json()) as Carrera
      setCarreras((anteriores) =>
        ordenar([
          ...(anteriores ?? []).filter((c) => c.id !== carrera.id),
          carrera,
        ]),
      )
      setAviso(editando ? 'Cambios guardados' : 'Carrera creada')
      nueva()
    } catch {
      setError(
        'No pudimos guardar la carrera. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="carreras" aria-label="Gestión de carreras">
      <div className="carreras__intro">
        <div>
          <h2>Carreras de tu facultad</h2>
          <p>
            Crea y actualiza las carreras para organizar la gestión académica.
          </p>
        </div>
        <button
          type="button"
          className="carreras__secundario"
          disabled={guardando}
          onClick={() => setRevision((n) => n + 1)}
        >
          Actualizar listado
        </button>
      </div>
      {aviso && (
        <p className="carreras__aviso" role="status">
          {aviso}
        </p>
      )}
      <div className="carreras__columnas">
        <div className="carreras__panel">
          {errorCarga ? (
            <div>
              <p className="carreras__error" role="alert">
                {errorCarga}
              </p>
              <button
                type="button"
                className="carreras__secundario"
                onClick={() => setRevision((n) => n + 1)}
              >
                Reintentar
              </button>
            </div>
          ) : carreras === null ? (
            <p role="status">Cargando carreras…</p>
          ) : carreras.length === 0 ? (
            <p>Aún no hay carreras en tu facultad. Crea la primera.</p>
          ) : (
            <table className="carreras__tabla">
              <caption>Listado de carreras</caption>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {carreras.map((carrera) => (
                  <tr key={carrera.id}>
                    <td>{carrera.nombre}</td>
                    <td>
                      <button
                        type="button"
                        className="carreras__secundario"
                        disabled={guardando}
                        aria-label={`Editar ${carrera.nombre}`}
                        onClick={() => {
                          setEditando(carrera.id)
                          setNombre(carrera.nombre)
                          setError(null)
                          setAviso(null)
                          input.current?.focus()
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form
          className="carreras__panel carreras__formulario"
          aria-label={editando ? 'Editar carrera' : 'Nueva carrera'}
          onSubmit={(event) => void guardar(event)}
        >
          <h2>{editando ? 'Editar carrera' : 'Nueva carrera'}</h2>
          <p>La carrera se guardará en tu facultad.</p>
          {error && (
            <p className="carreras__error" id="carrera-error" role="alert">
              {error}
            </p>
          )}
          <label htmlFor="carrera-nombre">Nombre de la carrera</label>
          <input
            ref={input}
            id="carrera-nombre"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            maxLength={LARGO_NOMBRE_CARRERA}
            required
            disabled={guardando}
            aria-describedby={error ? 'carrera-error' : undefined}
          />
          <div className="carreras__acciones">
            <button
              className="carreras__primario"
              type="submit"
              disabled={guardando || carreras === null}
            >
              {guardando
                ? 'Guardando…'
                : editando
                  ? 'Guardar cambios'
                  : 'Crear carrera'}
            </button>
            {editando && (
              <button
                className="carreras__secundario"
                type="button"
                disabled={guardando}
                onClick={nueva}
              >
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}
