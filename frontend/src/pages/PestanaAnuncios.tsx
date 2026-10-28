import {
  LARGO_CUERPO_ANUNCIO,
  LARGO_TITULO_ANUNCIO,
  MAX_ANUNCIOS_LECTURA,
  type Anuncio,
  type PublicarAnuncio,
} from '@cursus/shared'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { EVENTO_LECTURA_ANUNCIOS, fechaAnuncio } from './anuncios'
import './PestanaAnuncios.css'
import { useDatos } from './useDatos'
import type { PropsPestana } from './VistaSeccion'

// ANU-03: la API filtra los destinatarios y ordena por fecha antes de responder.
// Se conserva ese orden; no se consultan anuncios de otras secciones.
export function PestanaAnuncios({
  seccionId,
  numeroSeccion,
  rol,
}: PropsPestana) {
  const ruta = `/api/espacio/secciones/${seccionId}/anuncios`
  const [anuncios, recargar] = useDatos<Anuncio[]>(ruta)

  return (
    <section className="anuncios" aria-label="Anuncios del curso">
      <h3 className="vista-seccion__subtitulo">Anuncios del curso</h3>
      {rol === 'ALUMNO' && (
        <p className="anuncios__ayuda">
          Anuncios de todo el curso y de tu sección, del más reciente al más
          antiguo.
        </p>
      )}
      {rol === 'PROFESOR' && (
        <FormularioAnuncio
          ruta={ruta}
          seccionId={seccionId}
          numeroSeccion={numeroSeccion}
          alPublicar={recargar}
        />
      )}
      {rol === 'ALUMNO' && anuncios && (
        <RegistrarLectura ruta={ruta} anuncios={anuncios} />
      )}
      {anuncios === undefined ? (
        <Cargando texto="Cargando anuncios…" />
      ) : anuncios === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar los anuncios."
          onReintentar={recargar}
        />
      ) : anuncios.length === 0 ? (
        <p className="dashboard__texto">Aún no hay anuncios</p>
      ) : (
        <ol className="anuncios__lista" aria-label="Anuncios publicados">
          {anuncios.map((anuncio) => (
            <li key={anuncio.id} className="anuncios__anuncio">
              <article aria-labelledby={`anuncio-${anuncio.id}`}>
                <h4 id={`anuncio-${anuncio.id}`} className="anuncios__titulo">
                  {anuncio.titulo}
                  {rol === 'ALUMNO' && anuncio.nuevo && (
                    <span className="anuncios__nuevo">Nuevo</span>
                  )}
                </h4>
                <p className="anuncios__meta">
                  {anuncio.autor.nombre} ·{' '}
                  <time dateTime={anuncio.publicadoEn}>
                    {fechaAnuncio(anuncio.publicadoEn)}
                  </time>
                </p>
                <p className="anuncios__destinatario">
                  {anuncio.seccion
                    ? `Sección ${anuncio.seccion.numero}`
                    : 'Todo el curso'}
                </p>
                <p className="anuncios__cuerpo">{anuncio.cuerpo}</p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// El GET no escribe. Solo después de mostrar una lista correcta se registran
// sus IDs, por lotes; un GET fallido no avanza la última visita. Las etiquetas
// de este render se conservan para que el alumno identifique lo que era nuevo.
function RegistrarLectura({
  ruta,
  anuncios,
}: {
  ruta: string
  anuncios: Anuncio[]
}) {
  const { fetchConSesion } = useAuth()
  const [fallo, setFallo] = useState(false)
  const [intento, setIntento] = useState(0)
  const [guardando, setGuardando] = useState(true)
  useEffect(() => {
    let vigente = true
    const ids = anuncios.filter((anuncio) => anuncio.nuevo).map((a) => a.id)
    async function registrar() {
      for (let desde = 0; desde < ids.length; desde += MAX_ANUNCIOS_LECTURA) {
        const respuesta = await fetchConSesion(`${ruta}/lecturas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            anuncioIds: ids.slice(desde, desde + MAX_ANUNCIOS_LECTURA),
          }),
        })
        if (!respuesta.ok) throw new Error('No se registró la lectura')
        window.dispatchEvent(new Event(EVENTO_LECTURA_ANUNCIOS))
        if (!vigente) return
      }
    }
    void registrar()
      .then(() => {
        if (vigente) setFallo(false)
      })
      .catch(() => {
        if (vigente) setFallo(true)
      })
      .finally(() => {
        if (vigente) setGuardando(false)
      })
    return () => {
      vigente = false
    }
  }, [anuncios, fetchConSesion, ruta, intento])
  if (!fallo) return null
  return (
    <div role="alert" className="anuncios__error">
      <p>No pudimos actualizar los anuncios leídos.</p>
      <button
        type="button"
        disabled={guardando}
        onClick={() => {
          setGuardando(true)
          setIntento((actual) => actual + 1)
        }}
      >
        Reintentar actualización
      </button>
    </div>
  )
}

const VACIO: PublicarAnuncio = { titulo: '', cuerpo: '' }

// El 400 de la API trae los mensajes de validación (class-validator) como
// lista; se muestra el primero.
function mensajeDe(cuerpo: { message?: unknown } | null): string | null {
  const mensaje = cuerpo?.message
  if (typeof mensaje === 'string') return mensaje
  if (Array.isArray(mensaje) && typeof mensaje[0] === 'string')
    return mensaje[0]
  return null
}

function FormularioAnuncio({
  ruta,
  seccionId,
  numeroSeccion,
  alPublicar,
}: {
  ruta: string
  seccionId: string
  numeroSeccion?: number
  alPublicar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [campos, setCampos] = useState(VACIO)
  const [soloSeccion, setSoloSeccion] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function publicar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando) return
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...campos,
          ...(soloSeccion ? { seccionId } : {}),
        } satisfies PublicarAnuncio),
      })
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as {
          message?: unknown
        } | null
        setError(
          (res.status === 400 && mensajeDe(cuerpo)) ||
            'No pudimos publicar el anuncio. Inténtalo nuevamente.',
        )
        return
      }
      setCampos(VACIO)
      setAviso(
        soloSeccion
          ? `Anuncio publicado para la sección ${numeroSeccion ?? 'actual'}`
          : 'Anuncio publicado para todas las secciones del curso',
      )
      setSoloSeccion(false)
      alPublicar()
    } catch {
      setError(
        'No pudimos publicar el anuncio. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  const cambiar =
    (campo: keyof PublicarAnuncio) =>
    (event: { target: { value: string } }) => {
      // El aviso de éxito se borra al empezar el siguiente anuncio.
      setAviso(null)
      setCampos((actuales) => ({ ...actuales, [campo]: event.target.value }))
    }

  return (
    <form
      className="anuncios__formulario"
      aria-label="Nuevo anuncio"
      onSubmit={(event) => void publicar(event)}
    >
      <label className="anuncios__campo">
        Dirigido a
        <select
          value={soloSeccion ? seccionId : ''}
          disabled={guardando}
          onChange={(event) => {
            setAviso(null)
            setSoloSeccion(event.target.value === seccionId)
          }}
        >
          <option value="">Todo el curso</option>
          <option value={seccionId}>Sección {numeroSeccion ?? 'actual'}</option>
        </select>
      </label>
      <label className="anuncios__campo">
        Título
        <input
          disabled={guardando}
          value={campos.titulo}
          onChange={cambiar('titulo')}
          maxLength={LARGO_TITULO_ANUNCIO}
          required
        />
      </label>
      <label className="anuncios__campo">
        Mensaje
        <textarea
          disabled={guardando}
          value={campos.cuerpo}
          onChange={cambiar('cuerpo')}
          maxLength={LARGO_CUERPO_ANUNCIO}
          rows={4}
          required
        />
      </label>
      <p className="anuncios__ayuda">
        {soloSeccion
          ? 'Lo verán solo los integrantes de esta sección.'
          : 'Lo verán los alumnos y ayudantes de todas las secciones del curso.'}
      </p>
      <button className="anuncios__boton" type="submit" disabled={guardando}>
        Publicar anuncio
      </button>
      {error && (
        <p className="anuncios__error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="anuncios__aviso" role="status">
          {aviso}
        </p>
      )}
    </form>
  )
}
