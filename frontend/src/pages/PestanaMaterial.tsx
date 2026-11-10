import { MAX_TAMANO_SILABO_BYTES, type VersionSilabo } from '@cursus/shared'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'
import type { PropsPestana } from './VistaSeccion'
import './PestanaMaterial.css'

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

export function PestanaMaterial({ seccionId, rol }: PropsPestana) {
  const { fetchConSesion } = useAuth()
  const ruta = `/api/espacio/secciones/${seccionId}/silabo`
  const [versiones, recargar] = useDatos<VersionSilabo[]>(ruta)

  return (
    <section className="silabo" aria-label="Sílabo del curso">
      <h3 className="vista-seccion__subtitulo">Sílabo del curso</h3>
      {rol === 'PROFESOR' && (
        <FormularioSilabo
          ruta={ruta}
          hayVersiones={Boolean(versiones?.length)}
          alSubir={recargar}
        />
      )}
      {versiones === undefined ? (
        <Cargando texto="Cargando sílabo…" />
      ) : versiones === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar el historial del sílabo."
          onReintentar={recargar}
        />
      ) : versiones.length === 0 ? (
        <p className="dashboard__texto">Aún no hay un sílabo para este curso</p>
      ) : (
        <ol className="silabo__historial" aria-label="Historial del sílabo">
          {versiones.map((version) => (
            <li className="silabo__version" key={version.version}>
              <div>
                <h4 className="silabo__titulo">Versión {version.version}</h4>
                <time dateTime={version.subidoEn}>
                  Cargada el {fechaHora(version.subidoEn)}
                </time>
              </div>
              <button
                className="silabo__boton silabo__boton--secundario"
                type="button"
                onClick={() =>
                  void descargar(ruta, version.version, fetchConSesion)
                }
              >
                Descargar PDF
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

async function descargar(
  ruta: string,
  version: number,
  fetchConSesion: (ruta: string, init?: RequestInit) => Promise<Response>,
) {
  try {
    const respuesta = await fetchConSesion(ruta + `/${version}`)
    if (!respuesta.ok) return
    const url = URL.createObjectURL(await respuesta.blob())
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `silabo-v${version}.pdf`
    enlace.click()
    URL.revokeObjectURL(url)
  } catch {
    // La carga del historial permanece disponible si la descarga falla.
  }
}

function FormularioSilabo({
  ruta,
  hayVersiones,
  alSubir,
}: {
  ruta: string
  hayVersiones: boolean
  alSubir: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const inputArchivo = useRef<HTMLInputElement>(null)

  function seleccionar(event: ChangeEvent<HTMLInputElement>) {
    setError(null)
    setAviso(null)
    const seleccionado = event.target.files?.[0] ?? null
    if (!seleccionado) {
      setArchivo(null)
      return
    }
    if (
      seleccionado.type !== 'application/pdf' ||
      !seleccionado.name.toLowerCase().endsWith('.pdf')
    ) {
      setArchivo(null)
      setError('Selecciona un archivo PDF.')
      event.target.value = ''
      return
    }
    if (seleccionado.size > MAX_TAMANO_SILABO_BYTES) {
      setArchivo(null)
      setError('El PDF no puede superar los 10 MiB.')
      event.target.value = ''
      return
    }
    setArchivo(seleccionado)
  }

  async function subir(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!archivo) return
    setGuardando(true)
    setError(null)
    setAviso(null)
    const datos = new FormData()
    datos.set('archivo', archivo)
    try {
      const respuesta = await fetchConSesion(ruta, {
        method: 'POST',
        body: datos,
      })
      if (!respuesta.ok) {
        setError(
          respuesta.status === 400
            ? 'El archivo no es un PDF válido o supera el tamaño permitido.'
            : 'No pudimos cargar el sílabo. Inténtalo nuevamente.',
        )
        return
      }
      setArchivo(null)
      if (inputArchivo.current) inputArchivo.current.value = ''
      setAviso('Sílabo cargado; la versión anterior quedó en el historial.')
      alSubir()
    } catch {
      setError(
        'No pudimos cargar el sílabo. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      className="silabo__formulario"
      aria-label="Cargar sílabo"
      onSubmit={(event) => void subir(event)}
    >
      <label className="silabo__campo">
        Archivo PDF
        <input
          ref={inputArchivo}
          className="silabo__archivo"
          type="file"
          accept="application/pdf,.pdf"
          onChange={seleccionar}
          disabled={guardando}
          required
        />
      </label>
      <button
        className="silabo__boton"
        type="submit"
        disabled={!archivo || guardando}
      >
        {hayVersiones ? 'Subir nueva versión' : 'Subir sílabo'}
      </button>
      <p className="silabo__ayuda">PDF, máximo 10 MiB.</p>
      {error && (
        <p className="silabo__error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="silabo__aviso" role="status">
          {aviso}
        </p>
      )}
    </form>
  )
}
