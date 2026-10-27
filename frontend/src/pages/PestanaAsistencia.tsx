import {
  DIAS_SEMANA,
  ZONA_HORARIA_UNIVERSIDAD,
  type BloqueHorario,
  type Clase,
  type CrearClase,
  type SeccionResumen,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import './PestanaAsistencia.css'
import { useDatos } from './useDatos'
import type { PropsPestana } from './VistaSeccion'

// Roles en la sección que leen sus clases (ASI-01). El alumno ve su propia
// asistencia en ASI-06.
const LEEN = ['PROFESOR', 'AYUDANTE', 'DIRECTOR']

// ASI-01 (RN-13): clases de la sección, por fecha. Solo el profesor de la
// sección las registra; el ayudante ve la lista.
export function PestanaAsistencia({ seccionId, rol }: PropsPestana) {
  if (!LEEN.includes(rol)) {
    return (
      <p className="dashboard__texto">
        Las clases de la sección las registra su profesor.
      </p>
    )
  }
  return <ClasesSeccion seccionId={seccionId} rol={rol} />
}

function ClasesSeccion({ seccionId, rol }: PropsPestana) {
  const ruta = `/api/espacio/secciones/${seccionId}/clases`
  const [clases, recargar] = useDatos<Clase[]>(ruta)

  return (
    <section className="asistencia" aria-label="Clases">
      <h3 className="vista-seccion__subtitulo">Clases</h3>
      {rol === 'PROFESOR' && (
        <FormularioClase seccionId={seccionId} ruta={ruta} alCrear={recargar} />
      )}
      {clases === undefined ? (
        <Cargando texto="Cargando clases…" />
      ) : clases === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar las clases."
          onReintentar={recargar}
        />
      ) : clases.length === 0 ? (
        <p className="dashboard__texto">Aún no hay clases registradas</p>
      ) : (
        <table className="asistencia__tabla">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Bloque</th>
              <th scope="col">Sala</th>
            </tr>
          </thead>
          <tbody>
            {clases.map((clase) => (
              <tr key={clase.id}>
                <td>{clase.fecha}</td>
                <td>
                  {clase.inicio}–{clase.termino}
                </td>
                <td>{clase.sala}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// Hoy (YYYY-MM-DD) en la zona de la universidad. Solo sirve para mostrar
// la fecha inicial y sus bloques: si no se cambia, el backend calcula hoy.
const hoy = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_UNIVERSIDAD,
  }).format(new Date())

// Día ISO (1 = lunes) de una fecha YYYY-MM-DD.
const diaDe = (fecha: string) =>
  ((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7) + 1

function FormularioClase({
  seccionId,
  ruta,
  alCrear,
}: {
  seccionId: string
  ruta: string
  alCrear: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [seccion, recargarSeccion] = useDatos<SeccionResumen>(
    `/api/espacio/secciones/${seccionId}/resumen`,
  )
  const [inicial] = useState(hoy)
  const [fecha, setFecha] = useState(inicial)
  const [elegido, setElegido] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  if (seccion === undefined) {
    return <Cargando texto="Cargando horario…" />
  }
  if (seccion === null) {
    return (
      <ErrorEstado
        mensaje="No pudimos cargar el horario de la sección."
        onReintentar={recargarSeccion}
      />
    )
  }
  const horario: BloqueHorario[] = seccion.horario
  if (horario.length === 0) {
    return (
      <p className="dashboard__texto">
        La sección aún no tiene horario; lo carga el Administrativo.
      </p>
    )
  }
  const dia = fecha ? diaDe(fecha) : 0
  const bloques = horario.filter((b) => b.dia === dia)
  // Con un solo bloque ese día, queda elegido.
  const inicio = bloques.length === 1 ? bloques[0].inicio : elegido

  async function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setError(null)
    setAviso(null)
    // Sin cambiar la fecha, el backend usa hoy en la zona de la universidad.
    // Si pasó la medianoche con el formulario abierto, se envía la fecha que
    // se muestra.
    const datos: CrearClase =
      fecha === inicial && inicial === hoy() ? { inicio } : { fecha, inicio }
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!res.ok) {
        // 400 (fecha fuera del período o sin bloque) y 409 (clase repetida)
        // traen un mensaje para mostrar.
        const cuerpo = (await res.json().catch(() => null)) as {
          message?: unknown
        } | null
        setError(
          (res.status === 400 || res.status === 409) &&
            typeof cuerpo?.message === 'string'
            ? cuerpo.message
            : 'No pudimos registrar la clase. Inténtalo nuevamente.',
        )
        return
      }
      setAviso('Clase registrada')
      alCrear()
    } catch {
      setError(
        'No pudimos registrar la clase. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      className="asistencia__formulario"
      aria-label="Nueva clase"
      onSubmit={(event) => void crear(event)}
    >
      <label className="asistencia__campo">
        Fecha
        <input
          type="date"
          value={fecha}
          onChange={(event) => {
            setAviso(null)
            setElegido('')
            setFecha(event.target.value)
          }}
          required
        />
      </label>
      <label className="asistencia__campo">
        Bloque
        <select
          value={inicio}
          onChange={(event) => {
            setAviso(null)
            setElegido(event.target.value)
          }}
          disabled={bloques.length === 0}
          required
        >
          {bloques.length !== 1 && <option value="">Elige un bloque</option>}
          {bloques.map((b) => (
            <option key={b.inicio} value={b.inicio}>
              {b.inicio}–{b.termino} · {b.sala}
            </option>
          ))}
        </select>
      </label>
      <button
        className="asistencia__boton"
        type="submit"
        disabled={guardando || !inicio}
      >
        Registrar clase
      </button>
      {bloques.length === 0 && fecha && (
        <p className="dashboard__texto asistencia__nota">
          La sección no tiene bloques el {DIAS_SEMANA[dia - 1].toLowerCase()}.
        </p>
      )}
      {error && (
        <p className="asistencia__error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="asistencia__aviso" role="status">
          {aviso}
        </p>
      )}
    </form>
  )
}
