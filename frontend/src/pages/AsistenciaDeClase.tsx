import {
  ZONA_HORARIA_UNIVERSIDAD,
  type AlumnoAsistencia,
  type AsistenciaClase,
  type GuardarAsistencia,
  type Rol,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

interface Props {
  seccionId: string
  claseId: string
  rol: Rol
}

// Fecha y hora del registro, en la zona de la universidad.
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    timeZone: ZONA_HORARIA_UNIVERSIDAD,
    dateStyle: 'short',
    timeStyle: 'short',
  })

// ASI-02 (RN-13): asistencia de una clase. Si ya está registrada se muestra
// en solo lectura; si no, el profesor de la sección marca presente o ausente
// a cada alumno. Corregir una marca es ASI-04.
export function AsistenciaDeClase({ seccionId, claseId, rol }: Props) {
  const ruta = `/api/espacio/secciones/${seccionId}/clases/${claseId}/asistencia`
  const [datos, recargar] = useDatos<AsistenciaClase>(ruta)

  if (datos === undefined) {
    return <Cargando texto="Cargando asistencia…" />
  }
  if (datos === null) {
    return (
      <ErrorEstado
        mensaje="No pudimos cargar la asistencia de la clase."
        onReintentar={recargar}
      />
    )
  }
  const { clase, registrada, alumnos } = datos
  return (
    <section
      className="asistencia__clase"
      aria-label={`Asistencia del ${clase.fecha}`}
    >
      <h4 className="vista-seccion__subtitulo">
        Asistencia del {clase.fecha} · {clase.inicio}–{clase.termino}
      </h4>
      {registrada ? (
        <>
          <p className="dashboard__texto">
            Registrada por {registrada.por.nombre} el {fechaHora(registrada.en)}
          </p>
          <MarcasRegistradas alumnos={alumnos} />
        </>
      ) : alumnos.length === 0 ? (
        <p className="dashboard__texto">
          La sección no tiene alumnos inscritos
        </p>
      ) : rol === 'PROFESOR' ? (
        <FormularioAsistencia
          ruta={ruta}
          alumnos={alumnos}
          alGuardar={recargar}
          recargar={recargar}
        />
      ) : (
        <p className="dashboard__texto">
          Aún no se registra la asistencia de esta clase.
        </p>
      )}
    </section>
  )
}

function MarcasRegistradas({ alumnos }: { alumnos: AlumnoAsistencia[] }) {
  return (
    <table className="asistencia__tabla" aria-label="Asistencia registrada">
      <thead>
        <tr>
          <th scope="col">Alumno</th>
          <th scope="col">Asistencia</th>
        </tr>
      </thead>
      <tbody>
        {alumnos.map((alumno) => (
          <tr key={alumno.id}>
            <td>{alumno.nombre}</td>
            <td>{alumno.presente ? 'Presente' : 'Ausente'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FormularioAsistencia({
  ruta,
  alumnos,
  alGuardar,
  recargar,
}: {
  ruta: string
  alumnos: AlumnoAsistencia[]
  alGuardar: () => void
  recargar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [marcas, setMarcas] = useState<Record<string, boolean>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const faltan = alumnos.filter((a) => marcas[a.id] === undefined).length

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setError(null)
    const datos: GuardarAsistencia = {
      marcas: alumnos.map((a) => ({ alumnoId: a.id, presente: marcas[a.id] })),
    }
    try {
      const res = await fetchConSesion(ruta, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as {
          message?: unknown
        } | null
        // 409: ya estaba registrada (otra pestaña u otra persona). 400: la
        // lista de alumnos cambió mientras se marcaba.
        setError(
          (res.status === 400 || res.status === 409) &&
            typeof cuerpo?.message === 'string'
            ? `${cuerpo.message}.`
            : 'No pudimos guardar la asistencia. Inténtalo nuevamente.',
        )
        setGuardando(false)
        return
      }
      // Guardar sigue deshabilitado hasta que la recarga muestre la
      // asistencia en solo lectura: un segundo clic no envía otro PUT.
      alGuardar()
    } catch {
      setError(
        'No pudimos guardar la asistencia. Comprueba tu conexión e inténtalo nuevamente.',
      )
      setGuardando(false)
    }
  }

  return (
    <form
      className="asistencia__marcas"
      aria-label="Marcar asistencia"
      onSubmit={(event) => void guardar(event)}
    >
      {alumnos.map((alumno) => (
        <fieldset key={alumno.id} className="asistencia__alumno">
          <legend>{alumno.nombre}</legend>
          {[true, false].map((presente) => (
            <label key={String(presente)}>
              <input
                type="radio"
                name={`asistencia-${alumno.id}`}
                checked={marcas[alumno.id] === presente}
                onChange={() =>
                  setMarcas((actuales) => ({
                    ...actuales,
                    [alumno.id]: presente,
                  }))
                }
              />
              {presente ? 'Presente' : 'Ausente'}
            </label>
          ))}
        </fieldset>
      ))}
      <p className="dashboard__texto" aria-live="polite">
        {faltan === 0
          ? 'Todos los alumnos están marcados.'
          : `Faltan ${faltan} por marcar.`}
      </p>
      <button
        className="asistencia__boton"
        type="submit"
        disabled={faltan > 0 || guardando}
      >
        Guardar asistencia
      </button>
      {error && (
        <div className="asistencia__error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="asistencia__enlace"
            onClick={() => {
              setError(null)
              recargar()
            }}
          >
            Volver a cargar
          </button>
        </div>
      )}
    </form>
  )
}
