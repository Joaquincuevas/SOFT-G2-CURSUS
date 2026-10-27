import {
  LARGO_NOMBRE_EVALUACION,
  PONDERACION_MAXIMA,
  PONDERACION_MINIMA,
  type CrearEvaluacion,
  type EvaluacionesSeccion,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import './PestanaNotas.css'
import { useDatos } from './useDatos'
import type { PropsPestana } from './VistaSeccion'

// NOT-01 (RN-10): evaluaciones de la sección con su ponderación y la suma
// total. Las crea solo el profesor de la sección; el ayudante, el alumno y
// el Director ven la lista. El aviso de que no suman 100 % es NOT-02.
export function PestanaNotas({ seccionId, rol }: PropsPestana) {
  const ruta = `/api/espacio/secciones/${seccionId}/evaluaciones`
  const [datos, recargar] = useDatos<EvaluacionesSeccion>(ruta)

  return (
    <section className="notas" aria-label="Evaluaciones">
      <h3 className="vista-seccion__subtitulo">Evaluaciones</h3>
      {rol === 'PROFESOR' && (
        <FormularioEvaluacion ruta={ruta} alCrear={recargar} />
      )}
      {datos === undefined ? (
        <Cargando texto="Cargando evaluaciones…" />
      ) : datos === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar las evaluaciones."
          onReintentar={recargar}
        />
      ) : datos.evaluaciones.length === 0 ? (
        <p className="dashboard__texto">Aún no hay evaluaciones</p>
      ) : (
        <table className="notas__tabla">
          <thead>
            <tr>
              <th scope="col">Evaluación</th>
              <th scope="col">Fecha</th>
              <th scope="col">Ponderación</th>
            </tr>
          </thead>
          <tbody>
            {datos.evaluaciones.map((evaluacion) => (
              <tr key={evaluacion.id}>
                <td>{evaluacion.nombre}</td>
                <td>{evaluacion.fecha}</td>
                <td>{evaluacion.ponderacion} %</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Suma de ponderaciones
              </th>
              <td>{datos.sumaPonderaciones} %</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  )
}

const VACIO = { nombre: '', fecha: '', ponderacion: '' }

function FormularioEvaluacion({
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
    const datos: CrearEvaluacion = {
      nombre: campos.nombre,
      fecha: campos.fecha,
      ponderacion: Number(campos.ponderacion),
    }
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!res.ok) {
        // El 400 por la fecha trae el rango del período en el mensaje.
        const cuerpo = (await res.json().catch(() => null)) as {
          message?: unknown
        } | null
        setError(
          res.status === 400 && typeof cuerpo?.message === 'string'
            ? cuerpo.message
            : 'No pudimos crear la evaluación. Revisa los datos e inténtalo nuevamente.',
        )
        return
      }
      setCampos(VACIO)
      setAviso('Evaluación creada')
      alCrear()
    } catch {
      setError(
        'No pudimos crear la evaluación. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  const cambiar =
    (campo: keyof typeof VACIO) => (event: { target: { value: string } }) => {
      // El aviso de éxito se borra al empezar la siguiente evaluación.
      setAviso(null)
      setCampos((actuales) => ({ ...actuales, [campo]: event.target.value }))
    }

  return (
    <form
      className="notas__formulario"
      aria-label="Nueva evaluación"
      onSubmit={(event) => void crear(event)}
    >
      <label className="notas__campo">
        Nombre
        <input
          value={campos.nombre}
          onChange={cambiar('nombre')}
          maxLength={LARGO_NOMBRE_EVALUACION}
          required
        />
      </label>
      <label className="notas__campo">
        Fecha
        <input
          type="date"
          value={campos.fecha}
          onChange={cambiar('fecha')}
          required
        />
      </label>
      <label className="notas__campo">
        Ponderación (%)
        <input
          type="number"
          value={campos.ponderacion}
          onChange={cambiar('ponderacion')}
          min={PONDERACION_MINIMA}
          max={PONDERACION_MAXIMA}
          step={1}
          required
        />
      </label>
      <button className="notas__boton" type="submit" disabled={guardando}>
        Crear evaluación
      </button>
      {error && (
        <p className="notas__error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="notas__aviso" role="status">
          {aviso}
        </p>
      )}
    </form>
  )
}
