import {
  LARGO_MOTIVO_ASISTENCIA,
  ZONA_HORARIA_UNIVERSIDAD,
  type AlumnoAsistencia,
  type CambioAsistencia,
  type CorregirAsistencia,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

export function CorreccionAsistencia({
  alumno,
  ruta,
  alGuardar,
  alCorregir,
}: {
  alumno: AlumnoAsistencia
  ruta: string
  alGuardar: () => void
  alCorregir?: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [editando, setEditando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const [presente, setPresente] = useState('true')
  const [motivo, setMotivo] = useState('')
  const [enviada, setEnviada] = useState<AlumnoAsistencia | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState(false)
  // Otra fila puede recargar la tabla mientras este PATCH sigue pendiente.
  const guardando = enviando || enviada === alumno
  const url = `${ruta}/alumnos/${alumno.id}`

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (
      guardando ||
      !motivo.trim() ||
      alumno.presente === null ||
      (presente === 'true') === alumno.presente
    )
      return
    setEnviada(alumno)
    setEnviando(true)
    setError(null)
    const datos: CorregirAsistencia = {
      anterior: alumno.presente,
      presente: presente === 'true',
      motivo: motivo.trim(),
    }
    try {
      const res = await fetchConSesion(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[]
        } | null
        const mensaje = body?.message
        setError(
          [400, 403, 404, 409].includes(res.status) && mensaje
            ? Array.isArray(mensaje)
              ? mensaje[0]
              : mensaje
            : 'No pudimos corregir la asistencia. Inténtalo nuevamente.',
        )
        setEnviada(null)
        return
      }
      setEditando(false)
      setVerHistorial(false)
      setAviso(true)
      alGuardar()
      alCorregir?.()
    } catch {
      setError(
        'No pudimos corregir la asistencia. Comprueba tu conexión e inténtalo nuevamente.',
      )
      setEnviada(null)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="asistencia__correccion">
      {!editando ? (
        <button
          type="button"
          className="asistencia__enlace"
          disabled={guardando}
          aria-label={`Corregir asistencia de ${alumno.nombre}`}
          onClick={() => {
            setPresente(String(!alumno.presente))
            setMotivo('')
            setError(null)
            setAviso(false)
            setEditando(true)
            setVerHistorial(false)
          }}
        >
          Corregir
        </button>
      ) : (
        <form
          aria-label={`Corregir asistencia de ${alumno.nombre}`}
          onSubmit={(e) => void guardar(e)}
        >
          <p>Marca actual: {alumno.presente ? 'Presente' : 'Ausente'}</p>
          <label className="asistencia__campo">
            Nueva marca
            <select
              value={presente}
              onChange={(e) => setPresente(e.target.value)}
              disabled={guardando}
            >
              <option value="true">Presente</option>
              <option value="false">Ausente</option>
            </select>
          </label>
          <label className="asistencia__campo">
            Motivo de la corrección
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              maxLength={LARGO_MOTIVO_ASISTENCIA}
              disabled={guardando}
            />
          </label>
          <button
            className="asistencia__boton"
            type="submit"
            disabled={
              guardando ||
              !motivo.trim() ||
              (presente === 'true') === alumno.presente
            }
          >
            Guardar corrección
          </button>
          <button
            className="asistencia__enlace"
            type="button"
            disabled={guardando}
            onClick={() => {
              setEditando(false)
              setError(null)
            }}
          >
            Cancelar corrección
          </button>
        </form>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="asistencia__enlace"
            onClick={() => {
              setEditando(false)
              setError(null)
              alGuardar()
            }}
          >
            Volver a cargar asistencia
          </button>
        </div>
      )}
      {aviso && <p role="status">Corrección guardada</p>}
      <button
        type="button"
        className="asistencia__enlace"
        disabled={guardando}
        aria-label={`Historial de asistencia de ${alumno.nombre}`}
        aria-expanded={verHistorial}
        onClick={() => setVerHistorial(!verHistorial)}
      >
        {verHistorial ? 'Ocultar historial' : 'Ver historial'}
      </button>
      {verHistorial && (
        <Historial ruta={`${url}/historial`} nombre={alumno.nombre} />
      )}
    </div>
  )
}

function Historial({ ruta, nombre }: { ruta: string; nombre: string }) {
  const [datos, recargar] = useDatos<CambioAsistencia[]>(ruta)
  if (datos === undefined) return <Cargando texto="Cargando correcciones…" />
  if (datos === null)
    return (
      <ErrorEstado
        mensaje="No pudimos cargar las correcciones."
        onReintentar={recargar}
      />
    )
  if (!datos.length) return <p>Sin correcciones registradas</p>
  return (
    <ol aria-label={`Correcciones de ${nombre}`}>
      {datos.map((h) => (
        <li key={h.id}>
          <p>
            {h.anterior ? 'Presente' : 'Ausente'} →{' '}
            {h.nuevo ? 'Presente' : 'Ausente'}
          </p>
          <p>{h.motivo}</p>
          <p>
            {h.profesor.nombre} ·{' '}
            <time dateTime={h.fecha}>
              {new Date(h.fecha).toLocaleString('es-CL', {
                timeZone: ZONA_HORARIA_UNIVERSIDAD,
              })}
            </time>
          </p>
        </li>
      ))}
    </ol>
  )
}
