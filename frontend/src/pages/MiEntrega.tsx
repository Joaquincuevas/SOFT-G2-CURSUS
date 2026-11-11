import {
  TAMANO_MAXIMO_ARCHIVO,
  TIPOS_ARCHIVO,
  tipoDeArchivo,
  ZONA_HORARIA_UNIVERSIDAD,
  type Actividad,
  type ArchivoResumen,
  type MiEntregaActividad,
  type SubidaArchivo,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    timeZone: ZONA_HORARIA_UNIVERSIDAD,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
const ACEPTA = Object.keys(TIPOS_ARCHIVO)
  .map((extension) => `.${extension}`)
  .join(',')

class ErrorEntrega extends Error {}

// Cada paso confirmado se conserva para reintentar sin volver a subir el
// archivo. Solo el PUT final acredita la entrega; subir a S3 no basta.
export function MiEntrega({
  ruta,
  actividad,
}: {
  ruta: string
  actividad: Actividad
}) {
  const { fetchConSesion } = useAuth()
  const [datos, recargar, , fijar] = useDatos<MiEntregaActividad>(
    `${ruta}/mi-entrega`,
  )
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subida, setSubida] = useState<SubidaArchivo | null>(null)
  const [subido, setSubido] = useState(false)
  const [confirmado, setConfirmado] = useState<ArchivoResumen | null>(null)
  const [paso, setPaso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cerradaPorServidor, setCerradaPorServidor] = useState(false)
  const cerrada = actividad.cerrada || datos?.cerrada || cerradaPorServidor
  const ocupado = paso !== null
  const rutaArchivos =
    ruta.slice(0, ruta.indexOf('/actividades/')) + '/archivos'

  async function pedir<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetchConSesion(url, init)
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as {
        message?: unknown
      } | null
      if (url.endsWith('/mi-entrega') && res.status === 409) {
        // 409 puede indicar un archivo inválido, no solo un plazo vencido.
        // Releer el estado evita bloquear una actividad que sigue abierta.
        recargar()
        if (
          typeof cuerpo?.message === 'string' &&
          cuerpo.message.startsWith('La actividad está cerrada.')
        )
          setCerradaPorServidor(true)
      }
      const mensaje = Array.isArray(cuerpo?.message)
        ? cuerpo.message[0]
        : cuerpo?.message
      throw new ErrorEntrega(
        typeof mensaje === 'string' &&
          [400, 403, 404, 409, 503].includes(res.status)
          ? mensaje
          : 'No pudimos completar la entrega. Inténtalo nuevamente.',
      )
    }
    return res.json() as Promise<T>
  }

  async function entregar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formulario = event.currentTarget
    if (!archivo || ocupado || cerrada) return
    if (
      !tipoDeArchivo(archivo.name) ||
      archivo.size < 1 ||
      archivo.size > TAMANO_MAXIMO_ARCHIVO
    ) {
      setError(
        'Elige un archivo de un tipo permitido, de hasta 20 MB y que no esté vacío.',
      )
      return
    }
    setError(null)
    setAviso(null)
    try {
      setPaso('Preparando archivo…')
      const preparada =
        subida ??
        (await pedir<SubidaArchivo>(rutaArchivos, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: archivo.name, tamano: archivo.size }),
        }))
      setSubida(preparada)
      if (!subido) {
        setPaso('Subiendo archivo…')
        const cuerpo = new FormData()
        for (const [nombre, valor] of Object.entries(preparada.subida.campos))
          cuerpo.append(nombre, valor)
        cuerpo.append('file', archivo)
        // La firma autentica S3. Nunca enviar el JWT de la sesión al bucket.
        const respuesta = await fetch(preparada.subida.url, {
          method: 'POST',
          body: cuerpo,
        })
        if (!respuesta.ok) {
          // La firma puede haber vencido: el próximo intento pide otra.
          setSubida(null)
          throw new ErrorEntrega(
            'No pudimos subir el archivo. Reintenta antes del plazo.',
          )
        }
        setSubido(true)
      }
      setPaso('Confirmando archivo…')
      const lista =
        confirmado ??
        (await pedir<ArchivoResumen>(
          `${rutaArchivos}/${preparada.archivo.id}/confirmar`,
          { method: 'POST' },
        ))
      setConfirmado(lista)
      setPaso('Registrando entrega…')
      const resultado = await pedir<MiEntregaActividad>(`${ruta}/mi-entrega`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoId: lista.id }),
      })
      fijar(resultado)
      setAviso('Entrega confirmada.')
      setArchivo(null)
      setSubida(null)
      setSubido(false)
      setConfirmado(null)
      formulario.reset()
    } catch (fallo) {
      setError(
        fallo instanceof ErrorEntrega
          ? fallo.message
          : 'No pudimos completar la entrega. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setPaso(null)
    }
  }

  if (datos === undefined) return <Cargando texto="Cargando mi entrega…" />
  if (datos === null)
    return (
      <ErrorEstado
        mensaje="No pudimos cargar tu entrega."
        onReintentar={recargar}
      />
    )
  return (
    <section
      className="entregas__propia"
      aria-label={`Mi entrega de ${actividad.titulo}`}
    >
      {datos.entrega ? (
        <div className="entregas__confirmacion">
          <p>
            <strong>Informe entregado</strong>: {datos.entrega.archivo.nombre}
          </p>
          <p>
            Fecha y hora de entrega:{' '}
            <time dateTime={datos.entrega.entregadaEn}>
              {fechaHora(datos.entrega.entregadaEn)}
            </time>{' '}
            (Chile continental)
          </p>
        </div>
      ) : (
        <p className="entregas__ayuda">Aún no has entregado tu informe.</p>
      )}
      {cerrada ? (
        <p className="entregas__ayuda">
          La actividad está cerrada. No se aceptan nuevas entregas ni
          reemplazos.
        </p>
      ) : (
        <form
          aria-label={`Entregar informe de ${actividad.titulo}`}
          className="entregas__informe"
          onSubmit={(event) => void entregar(event)}
        >
          <label className="entregas__campo">
            {datos.entrega ? 'Archivo de reemplazo' : 'Archivo del informe'}
            <input
              type="file"
              accept={ACEPTA}
              disabled={ocupado}
              onChange={(event) => {
                setArchivo(event.target.files?.[0] ?? null)
                setSubida(null)
                setSubido(false)
                setConfirmado(null)
                setError(null)
                setAviso(null)
              }}
            />
          </label>
          <p className="entregas__ayuda">
            Hasta 20 MB. Puedes reemplazar tu informe hasta el plazo. La entrega
            se confirma al terminar la subida.
          </p>
          <button
            type="submit"
            className="entregas__boton"
            disabled={!archivo || ocupado}
          >
            {paso ??
              (datos.entrega ? 'Reemplazar entrega' : 'Entregar informe')}
          </button>
        </form>
      )}
      {aviso && (
        <p className="entregas__aviso" role="status">
          {aviso}
        </p>
      )}
      {error && (
        <p className="entregas__error" role="alert">
          {error}
        </p>
      )}
      {ocupado && (
        <p className="entregas__ayuda" role="status">
          {paso}
        </p>
      )}
    </section>
  )
}
