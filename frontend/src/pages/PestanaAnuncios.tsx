import {
  LARGO_CUERPO_ANUNCIO,
  LARGO_TITULO_ANUNCIO,
  type Anuncio,
  type PublicarAnuncio,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { fechaAnuncio } from './anuncios'
import './PestanaAnuncios.css'
import { useDatos } from './useDatos'
import type { PropsPestana } from './VistaSeccion'

// ANU-01 (RN-09): anuncios del curso, que ven los integrantes de todas sus
// secciones. Publica solo el profesor de la sección; el ayudante, el alumno
// y el Director ven la lista, del más nuevo al más antiguo.
export function PestanaAnuncios({ seccionId, rol }: PropsPestana) {
  const ruta = `/api/espacio/secciones/${seccionId}/anuncios`
  const [anuncios, recargar] = useDatos<Anuncio[]>(ruta)

  return (
    <section className="anuncios" aria-label="Anuncios del curso">
      <h3 className="vista-seccion__subtitulo">Anuncios del curso</h3>
      {rol === 'PROFESOR' && (
        <FormularioAnuncio ruta={ruta} alPublicar={recargar} />
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
        <ul className="anuncios__lista" aria-label="Anuncios publicados">
          {anuncios.map((anuncio) => (
            <li key={anuncio.id} className="anuncios__anuncio">
              <article aria-labelledby={`anuncio-${anuncio.id}`}>
                <h4 id={`anuncio-${anuncio.id}`} className="anuncios__titulo">
                  {anuncio.titulo}
                </h4>
                <p className="anuncios__meta">
                  {anuncio.autor.nombre} ·{' '}
                  <time dateTime={anuncio.publicadoEn}>
                    {fechaAnuncio(anuncio.publicadoEn)}
                  </time>
                </p>
                <p className="anuncios__cuerpo">{anuncio.cuerpo}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
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
  alPublicar,
}: {
  ruta: string
  alPublicar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [campos, setCampos] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function publicar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos satisfies PublicarAnuncio),
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
      setAviso('Anuncio publicado para todas las secciones del curso')
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
        Título
        <input
          value={campos.titulo}
          onChange={cambiar('titulo')}
          maxLength={LARGO_TITULO_ANUNCIO}
          required
        />
      </label>
      <label className="anuncios__campo">
        Mensaje
        <textarea
          value={campos.cuerpo}
          onChange={cambiar('cuerpo')}
          maxLength={LARGO_CUERPO_ANUNCIO}
          rows={4}
          required
        />
      </label>
      <p className="anuncios__ayuda">
        Lo verán los alumnos y ayudantes de todas las secciones del curso.
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
