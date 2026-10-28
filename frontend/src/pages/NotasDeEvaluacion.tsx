import type {
  EstadoNota,
  GuardarNotas,
  NotaAlumno,
  NotasEvaluacion,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

interface Props {
  seccionId: string
  evaluacionId: string
}

// NOT-05 (RN-10): el ayudante ingresa la nota de cada alumno de la sección.
// Se guardan como propuesta, que el alumno no ve; se pueden guardar unas
// pocas y volver después por el resto. Los mensajes de la escala por campo
// son NOT-06.
export function NotasDeEvaluacion({ seccionId, evaluacionId }: Props) {
  const ruta = `/api/espacio/secciones/${seccionId}/evaluaciones/${evaluacionId}/notas`
  const [datos, recargar] = useDatos<NotasEvaluacion>(ruta)
  const [aviso, setAviso] = useState<string | null>(null)

  if (datos === undefined) {
    return <Cargando texto="Cargando notas…" />
  }
  if (datos === null) {
    return (
      <ErrorEstado
        mensaje="No pudimos cargar las notas de la evaluación."
        onReintentar={recargar}
      />
    )
  }
  return (
    <section
      className="notas__evaluacion"
      aria-label={`Notas de ${datos.evaluacion.nombre}`}
    >
      <h4 className="vista-seccion__subtitulo">
        Notas de {datos.evaluacion.nombre}
      </h4>
      {datos.alumnos.length === 0 ? (
        <p className="dashboard__texto">
          La sección no tiene alumnos inscritos
        </p>
      ) : (
        <FormularioNotas
          ruta={ruta}
          inicial={datos.alumnos}
          alGuardar={() => setAviso('Notas guardadas como propuesta.')}
          alEditar={() => setAviso(null)}
        />
      )}
      {aviso && (
        <p className="notas__aviso" role="status">
          {aviso}
        </p>
      )}
    </section>
  )
}

const textoDe = (nota: number | null) => (nota === null ? '' : String(nota))

const valoresDe = (alumnos: NotaAlumno[]) =>
  Object.fromEntries(alumnos.map((a) => [a.id, textoDe(a.nota)]))

const ESTADO: Record<EstadoNota, string> = {
  PROPUESTA: 'Propuesta',
  PUBLICADA: 'Publicada',
}

function FormularioNotas({
  ruta,
  inicial,
  alGuardar,
  alEditar,
}: {
  ruta: string
  inicial: NotaAlumno[]
  alGuardar: () => void
  alEditar: () => void
}) {
  const { fetchConSesion } = useAuth()
  // Las notas como están en el servidor y lo que muestra cada campo. Después
  // de guardar, las dos se reinician con lo que devuelve el servidor, cambie
  // o no: otro ayudante pudo restaurar la misma nota antes de la recarga.
  const [alumnos, setAlumnos] = useState(inicial)
  const [valores, setValores] = useState<Record<string, string>>(() =>
    valoresDe(inicial),
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Solo se envían los campos con un valor distinto del guardado, comparados
  // como número: "5.50" sobre un 5,5 no es un cambio. Un campo vacío no borra
  // la nota: nada se elimina.
  const cambios = alumnos.filter(
    (a) => valores[a.id].trim() !== '' && Number(valores[a.id]) !== a.nota,
  )

  function reiniciar(delServidor: NotaAlumno[]) {
    setAlumnos(delServidor)
    setValores(valoresDe(delServidor))
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setError(null)
    const datos: GuardarNotas = {
      notas: cambios.map((a) => ({
        alumnoId: a.id,
        nota: Number(valores[a.id]),
      })),
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
        // 400: una nota inválida o la lista de alumnos cambió.
        setError(
          res.status === 400 && typeof cuerpo?.message === 'string'
            ? `${cuerpo.message}.`
            : 'No pudimos guardar las notas. Inténtalo nuevamente.',
        )
        return
      }
      alGuardar()
      // El PUT devuelve las notas como quedaron; la recarga trae además lo que
      // otros guardaron después. Si la recarga falla, queda lo que confirmó el
      // PUT: ningún campo conserva un valor que el servidor no confirmó.
      const guardadas =
        ((await res.json().catch(() => null)) as NotasEvaluacion | null)
          ?.alumnos ?? alumnos
      try {
        const recarga = await fetchConSesion(ruta)
        if (!recarga.ok) throw new Error(`GET ${recarga.status}`)
        reiniciar(((await recarga.json()) as NotasEvaluacion).alumnos)
      } catch {
        reiniciar(guardadas)
        setError(
          'Las notas se guardaron, pero no pudimos recargarlas. Vuelve a abrir la evaluación para ver la lista actualizada.',
        )
      }
    } catch {
      setError(
        'No pudimos guardar las notas. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      // Hasta aquí Guardar sigue deshabilitado (un segundo clic no envía otro
      // PUT); con éxito, error del PUT o error de la recarga, se desbloquea.
      setGuardando(false)
    }
  }

  return (
    <form
      className="notas__ingreso"
      aria-label="Ingresar notas"
      onSubmit={(event) => void guardar(event)}
    >
      <table className="notas__tabla">
        <thead>
          <tr>
            <th scope="col">Alumno</th>
            <th scope="col">Nota</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {alumnos.map((alumno) => (
            <tr key={alumno.id}>
              <td>{alumno.nombre}</td>
              <td>
                <input
                  className="notas__nota"
                  type="number"
                  step={0.1}
                  inputMode="decimal"
                  aria-label={`Nota de ${alumno.nombre}`}
                  value={valores[alumno.id]}
                  // Una nota publicada la cambia el profesor (NOT-15). Mientras
                  // guarda tampoco: la recarga reinicia el formulario y
                  // borraría lo escrito después de enviar.
                  disabled={guardando || alumno.estado === 'PUBLICADA'}
                  onChange={(event) => {
                    alEditar()
                    setValores((actuales) => ({
                      ...actuales,
                      [alumno.id]: event.target.value,
                    }))
                  }}
                />
              </td>
              <td>
                {alumno.estado === null ? 'Sin nota' : ESTADO[alumno.estado]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="notas__boton"
        type="submit"
        disabled={cambios.length === 0 || guardando}
      >
        Guardar notas
      </button>
      {error && (
        <p className="notas__error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
