import {
  LARGO_INSTRUCCIONES_ACTIVIDAD,
  LARGO_TITULO_ACTIVIDAD,
  ZONA_HORARIA_UNIVERSIDAD,
  type Actividad,
  type CrearActividad,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import './PestanaEntregas.css'
import { useDatos } from './useDatos'
import type { PropsPestana } from './VistaSeccion'

// Fecha y hora límite en la zona de la universidad, con el año completo y
// la hora de 0 a 23 (por ejemplo, 14-11-2026, 23:59).
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    timeZone: ZONA_HORARIA_UNIVERSIDAD,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

// MAT-08 (RN-08): actividades de entrega de la sección, por plazo. Las crea
// solo el profesor de la sección; el ayudante, el alumno y el Director ven la
// lista. Una actividad cuyo plazo pasó se muestra como cerrada.
export function PestanaEntregas({ seccionId, rol }: PropsPestana) {
  const ruta = `/api/espacio/secciones/${seccionId}/actividades`
  const [actividades, recargar] = useDatos<Actividad[]>(ruta)

  return (
    <section className="entregas" aria-label="Actividades de entrega">
      <h3 className="vista-seccion__subtitulo">Actividades de entrega</h3>
      {rol === 'PROFESOR' && (
        <FormularioActividad ruta={ruta} alCrear={recargar} />
      )}
      {actividades === undefined ? (
        <Cargando texto="Cargando actividades…" />
      ) : actividades === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar las actividades."
          onReintentar={recargar}
        />
      ) : actividades.length === 0 ? (
        <p className="dashboard__texto">Aún no hay actividades de entrega</p>
      ) : (
        <ul className="entregas__lista" aria-label="Actividades">
          {actividades.map((actividad) => (
            <li key={actividad.id} className="entregas__actividad">
              <article aria-label={actividad.titulo}>
                <div className="entregas__encabezado">
                  <h4 className="entregas__titulo">{actividad.titulo}</h4>
                  <span
                    className={`entregas__estado ${
                      actividad.cerrada
                        ? 'entregas__estado--cerrada'
                        : 'entregas__estado--abierta'
                    }`}
                  >
                    {actividad.cerrada ? 'Cerrada' : 'Abierta'}
                  </span>
                </div>
                <p className="entregas__plazo">
                  Plazo: {fechaHora(actividad.plazo)}
                </p>
                <p className="entregas__instrucciones">
                  {actividad.instrucciones}
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const VACIO = { titulo: '', instrucciones: '', fecha: '', hora: '' }

function FormularioActividad({
  ruta,
  alCrear,
}: {
  ruta: string
  alCrear: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [campos, setCampos] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setError(null)
    setAviso(null)
    const datos: CrearActividad = { ...campos }
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!res.ok) {
        // Los 400 por el plazo (pasado o fuera del período) traen el motivo.
        const cuerpo = (await res.json().catch(() => null)) as {
          message?: unknown
        } | null
        setError(
          res.status === 400 && typeof cuerpo?.message === 'string'
            ? cuerpo.message
            : 'No pudimos crear la actividad. Revisa los datos e inténtalo nuevamente.',
        )
        return
      }
      setCampos(VACIO)
      setAviso('Actividad creada')
      alCrear()
    } catch {
      setError(
        'No pudimos crear la actividad. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  const cambiar =
    (campo: keyof typeof VACIO) => (event: { target: { value: string } }) => {
      // El aviso de éxito se borra al empezar la siguiente actividad.
      setAviso(null)
      setCampos((actuales) => ({ ...actuales, [campo]: event.target.value }))
    }

  return (
    <form
      className="entregas__formulario"
      aria-label="Nueva actividad"
      onSubmit={(event) => void crear(event)}
    >
      <label className="entregas__campo entregas__campo--ancho">
        Título
        <input
          value={campos.titulo}
          onChange={cambiar('titulo')}
          maxLength={LARGO_TITULO_ACTIVIDAD}
          required
        />
      </label>
      <label className="entregas__campo entregas__campo--ancho">
        Instrucciones
        <textarea
          value={campos.instrucciones}
          onChange={cambiar('instrucciones')}
          maxLength={LARGO_INSTRUCCIONES_ACTIVIDAD}
          rows={4}
          required
        />
      </label>
      <label className="entregas__campo">
        Fecha límite
        <input
          type="date"
          value={campos.fecha}
          onChange={cambiar('fecha')}
          required
        />
      </label>
      <label className="entregas__campo">
        Hora límite
        <input
          type="time"
          value={campos.hora}
          onChange={cambiar('hora')}
          required
        />
      </label>
      <button className="entregas__boton" type="submit" disabled={guardando}>
        Crear actividad
      </button>
      <p className="entregas__ayuda">
        La fecha y hora límite son de Chile continental.
      </p>
      {error && (
        <p className="entregas__error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="entregas__aviso" role="status">
          {aviso}
        </p>
      )}
    </form>
  )
}
