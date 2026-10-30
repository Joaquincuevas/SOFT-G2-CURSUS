import {
  LARGO_CUERPO_ANUNCIO,
  LARGO_TITULO_ANUNCIO,
  type Anuncio,
  type CambioAnuncio,
  type EditarAnuncio,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { useDatos } from './useDatos'
import { fechaAnuncio } from './anuncios'
import { ErrorEstado } from '../components/ErrorEstado'
import { Cargando } from '../components/Cargando'

export function EdicionAnuncio({
  anuncio,
  ruta,
  recargar,
}: {
  anuncio: Anuncio
  ruta: string
  recargar: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [historial, setHistorial] = useState(false)
  const [aviso, setAviso] = useState(false)
  const destino = `${ruta}/${anuncio.id}`
  return (
    <div className="anuncios__edicion">
      {!editando ? (
        <button
          type="button"
          onClick={() => {
            setAviso(false)
            setEditando(true)
          }}
        >
          Editar anuncio
        </button>
      ) : (
        <FormularioEdicion
          anuncio={anuncio}
          ruta={destino}
          cancelar={() => setEditando(false)}
          guardar={() => {
            setEditando(false)
            setHistorial(false)
            setAviso(true)
            recargar()
          }}
        />
      )}
      <button
        type="button"
        aria-expanded={historial}
        onClick={() => setHistorial(!historial)}
      >
        {historial ? 'Ocultar historial' : 'Ver historial'}
      </button>
      {aviso && <p role="status">Anuncio guardado</p>}
      {historial && <HistorialAnuncio ruta={`${destino}/historial`} />}
    </div>
  )
}

function FormularioEdicion({
  anuncio,
  ruta,
  cancelar,
  guardar,
}: {
  anuncio: Anuncio
  ruta: string
  cancelar: () => void
  guardar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [campos, setCampos] = useState<EditarAnuncio>({
    titulo: anuncio.titulo,
    cuerpo: anuncio.cuerpo,
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando) return
    setGuardando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion(ruta, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos),
      })
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as {
          message?: unknown
        } | null
        const mensaje = cuerpo?.message
        setError(
          respuesta.status === 400 && typeof mensaje === 'string'
            ? mensaje
            : respuesta.status === 400 &&
                Array.isArray(mensaje) &&
                typeof mensaje[0] === 'string'
              ? mensaje[0]
              : 'No pudimos guardar el anuncio. Inténtalo nuevamente.',
        )
        return
      }
      guardar()
    } catch {
      setError(
        'No pudimos guardar el anuncio. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }
  return (
    <form
      className="anuncios__formulario"
      aria-label="Editar anuncio"
      onSubmit={(event) => void enviar(event)}
    >
      <label className="anuncios__campo">
        Título del anuncio
        <input
          required
          maxLength={LARGO_TITULO_ANUNCIO}
          disabled={guardando}
          value={campos.titulo}
          onChange={(e) => setCampos({ ...campos, titulo: e.target.value })}
        />
      </label>
      <label className="anuncios__campo">
        Cuerpo del anuncio
        <textarea
          required
          rows={4}
          maxLength={LARGO_CUERPO_ANUNCIO}
          disabled={guardando}
          value={campos.cuerpo}
          onChange={(e) => setCampos({ ...campos, cuerpo: e.target.value })}
        />
      </label>
      <button type="submit" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>
      <button type="button" disabled={guardando} onClick={cancelar}>
        Cancelar edición
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}

function HistorialAnuncio({ ruta }: { ruta: string }) {
  const [versiones, recargar] = useDatos<CambioAnuncio[]>(ruta)
  return (
    <section aria-label="Historial del anuncio">
      <h5>Historial del anuncio</h5>
      {versiones === undefined ? (
        <Cargando texto="Cargando historial…" />
      ) : versiones === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar el historial."
          onReintentar={recargar}
        />
      ) : !versiones.length ? (
        <p>Este anuncio aún no tiene ediciones.</p>
      ) : (
        <ol>
          {versiones.map((version, indice) => (
            <li key={version.id}>
              <p>
                <strong>
                  {indice === 0
                    ? 'Versión original'
                    : `Versión anterior ${indice + 1}`}
                </strong>
              </p>
              <p>
                Reemplazada el{' '}
                <time dateTime={version.fecha}>
                  {fechaAnuncio(version.fecha)}
                </time>{' '}
                por {version.responsable.nombre}
              </p>
              <p>{version.titulo}</p>
              <p className="anuncios__cuerpo">{version.cuerpo}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
