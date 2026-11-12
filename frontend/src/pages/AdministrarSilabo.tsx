import {
  MAX_TAMANO_SILABO_BYTES,
  type DescargaArchivo,
  type SubidaArchivo,
  type VersionSilabo,
} from '@cursus/shared'
import { useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { ErrorEstado } from '../components/ErrorEstado'
import { subirAS3 } from './subirArchivo'
import { useDatos } from './useDatos'

// MAT-02. El historial y la descarga son de todos los integrantes; publicar
// es solo del profesor (MAT-06 abre la pestaña Material al resto).
export function AdministrarSilabo({
  ruta,
  puedePublicar,
  alPublicar,
}: {
  ruta: string
  puedePublicar: boolean
  alPublicar?: () => void
}) {
  const { fetchConSesion } = useAuth()
  const destino = `${ruta}/silabo`
  const [historial, recargar, , fijar] = useDatos<VersionSilabo[]>(destino)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const confirmado = useRef<{ archivo: File; id: string } | null>(null)
  const enCurso = useRef(false)

  async function publicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!archivo || enCurso.current) return
    setAviso('')
    if (
      !archivo.name.toLowerCase().endsWith('.pdf') ||
      archivo.type !== 'application/pdf' ||
      archivo.size < 5 ||
      archivo.size > MAX_TAMANO_SILABO_BYTES
    ) {
      setError('Selecciona un PDF válido de hasta 10 MiB.')
      return
    }
    enCurso.current = true
    setOcupado(true)
    setError('')
    try {
      if (confirmado.current?.archivo !== archivo) {
        const solicitud = await fetchConSesion(`${ruta}/archivos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: archivo.name, tamano: archivo.size }),
        })
        if (!solicitud.ok) throw new Error('No pudimos preparar la subida.')
        const subida = (await solicitud.json()) as SubidaArchivo
        await subirAS3(subida.subida, archivo, () => {})
        const confirmacion = await fetchConSesion(
          `${ruta}/archivos/${subida.archivo.id}/confirmar`,
          { method: 'POST' },
        )
        if (!confirmacion.ok) throw new Error('No pudimos confirmar el PDF.')
        confirmado.current = { archivo, id: subida.archivo.id }
      }
      const respuesta = await fetchConSesion(destino, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoId: confirmado.current.id }),
      })
      if (!respuesta.ok) {
        if (respuesta.status === 400)
          throw new Error('El archivo confirmado no es un PDF válido.')
        throw new Error('No pudimos publicar el sílabo. Inténtalo nuevamente.')
      }
      const publicada = (await respuesta.json()) as VersionSilabo
      fijar(
        [
          publicada,
          ...(historial ?? []).filter((v) => v.version !== publicada.version),
        ].sort((a, b) => b.version - a.version),
      )
      recargar()
      confirmado.current = null
      if (input.current) input.current.value = ''
      setArchivo(null)
      setAviso('Sílabo publicado.')
      alPublicar?.()
    } catch (falla) {
      setError(
        falla instanceof Error ? falla.message : 'No pudimos subir el PDF.',
      )
    } finally {
      enCurso.current = false
      setOcupado(false)
    }
  }

  async function descargar(version: number) {
    setError('')
    try {
      const respuesta = await fetchConSesion(`${destino}/${version}`)
      if (!respuesta.ok) throw new Error()
      const { url } = (await respuesta.json()) as DescargaArchivo
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.referrerPolicy = 'no-referrer'
      enlace.click()
    } catch {
      setError('No pudimos descargar esa versión del sílabo.')
    }
  }

  return (
    <section className="material" aria-label="Versiones del sílabo">
      <h3 className="vista-seccion__subtitulo">Versiones del sílabo</h3>
      {puedePublicar && (
        <form
          className="material__formulario"
          aria-label="Cargar sílabo"
          onSubmit={(evento) => void publicar(evento)}
        >
          <label className="material__campo">
            Sílabo (PDF, hasta 10 MiB)
            <input
              type="file"
              ref={input}
              accept="application/pdf,.pdf"
              disabled={ocupado}
              onChange={(evento) => {
                confirmado.current = null
                setArchivo(evento.target.files?.[0] ?? null)
                setError('')
                setAviso('')
              }}
            />
          </label>
          <button
            className="material__boton"
            type="submit"
            disabled={!archivo || ocupado}
          >
            {ocupado ? 'Publicando…' : 'Publicar sílabo'}
          </button>
          {aviso && (
            <p className="material__aviso" role="status">
              {aviso}
            </p>
          )}
        </form>
      )}
      {error && (
        <p className="material__error" role="alert">
          {error}
        </p>
      )}
      {historial === null && (
        <ErrorEstado
          mensaje="No pudimos cargar las versiones del sílabo."
          onReintentar={recargar}
        />
      )}
      {historial?.length === 0 && (
        <p className="dashboard__texto">Aún no hay un sílabo publicado.</p>
      )}
      {historial && historial.length > 0 && (
        <ol className="material__lista" aria-label="Historial del sílabo">
          {historial.map((v) => (
            <li key={v.version} className="material__item">
              <strong>Versión {v.version}</strong> · {v.responsable} ·{' '}
              <time dateTime={v.subidoEn}>
                {new Date(v.subidoEn).toLocaleDateString('es-CL', {
                  timeZone: 'America/Santiago',
                })}
              </time>{' '}
              <button
                className="material__boton"
                type="button"
                aria-label={`Descargar versión ${v.version}`}
                onClick={() => void descargar(v.version)}
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
