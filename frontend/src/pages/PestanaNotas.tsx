import {
  EVALUACION_CON_NOTAS,
  LARGO_NOMBRE_EVALUACION,
  PONDERACION_MAXIMA,
  PONDERACION_MINIMA,
  avisoPonderaciones,
  type CrearEvaluacion,
  type Evaluacion,
  type EvaluacionesSeccion,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { HistorialDeNota } from './HistorialDeNota'
import { MisNotas } from './MisNotas'
import { NotasDeEvaluacion } from './NotasDeEvaluacion'
import { NotasFinales } from './NotasFinales'
import { ComentarioDevolucion } from './ComentarioDevolucion'
import { ESTADO_REVISION } from './estados-notas'
import './PestanaNotas.css'
import { useDatos } from './useDatos'
import type { PropsPestana } from './VistaSeccion'

// NOT-01 (RN-10): evaluaciones de la sección con su ponderación y la suma
// total. Las crea solo el profesor de la sección; el ayudante y el Director
// ven la lista. NOT-02 advierte cuánto falta o sobra para 100 %.
// NOT-05: el ayudante abre cada evaluación para ingresar las notas; el
// profesor las revisa en NOT-10. NOT-13: el alumno ve sus notas publicadas.
// NOT-14: el profesor ve, al final, la nota final de cada alumno.
export function PestanaNotas({ seccionId, rol }: PropsPestana) {
  if (rol === 'ALUMNO')
    return <MisNotas key={seccionId} seccionId={seccionId} />
  return <EvaluacionesDeSeccion seccionId={seccionId} rol={rol} />
}

function EvaluacionesDeSeccion({ seccionId, rol }: PropsPestana) {
  const ruta = `/api/espacio/secciones/${seccionId}/evaluaciones`
  const [datos, recargar, , fijar] = useDatos<EvaluacionesSeccion>(ruta)
  // NOT-14: vuelve a pedir las notas finales cada vez que el detalle de una
  // evaluación lee o cambia sus notas (aprobar, devolver, recorregir) y
  // cuando el profesor crea o edita una evaluación, que cambia el cálculo.
  const [versionNotas, setVersionNotas] = useState(0)
  const recargarConNotasFinales = () => {
    recargar()
    setVersionNotas((n) => n + 1)
  }
  const [elegida, setElegida] = useState<string | null>(null)
  const [edicion, setEdicion] = useState<Evaluacion | null>(null)
  const [historial, setHistorial] = useState<string | null>(null)
  const [avisoEdicion, setAvisoEdicion] = useState(false)
  const ingresaNotas = rol === 'AYUDANTE'
  const consultaNotas = ingresaNotas || rol === 'PROFESOR'
  const editaEvaluaciones = rol === 'PROFESOR'
  const aviso =
    rol === 'PROFESOR' && datos
      ? avisoPonderaciones(datos.sumaPonderaciones)
      : null

  return (
    <section className="notas" aria-label="Evaluaciones">
      <h3 className="vista-seccion__subtitulo">Evaluaciones</h3>
      {editaEvaluaciones && (
        <FormularioEvaluacion ruta={ruta} alGuardar={recargarConNotasFinales} />
      )}
      {aviso && (
        <p
          className="notas__ponderaciones"
          role="status"
          aria-label="Aviso de ponderaciones"
        >
          {aviso}
        </p>
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
        <div className="notas__listado">
          <table className="notas__tabla">
            <thead>
              <tr>
                <th scope="col">Evaluación</th>
                <th scope="col">Fecha</th>
                <th scope="col">Ponderación</th>
                {ingresaNotas && <th scope="col">Estado del envío</th>}
                {editaEvaluaciones && <th scope="col">Acciones</th>}
                {consultaNotas && <th scope="col">Notas</th>}
              </tr>
            </thead>
            <tbody>
              {datos.evaluaciones.map((evaluacion) => (
                <tr key={evaluacion.id}>
                  <td>{evaluacion.nombre}</td>
                  <td>{evaluacion.fecha}</td>
                  <td>{evaluacion.ponderacion} %</td>
                  {editaEvaluaciones && (
                    <td>
                      {evaluacion.tieneNotas ? (
                        <span>{EVALUACION_CON_NOTAS}</span>
                      ) : (
                        <button
                          className="notas__enlace"
                          type="button"
                          aria-label={`Editar ${evaluacion.nombre}`}
                          disabled={edicion !== null}
                          onClick={() => {
                            setAvisoEdicion(false)
                            setEdicion(evaluacion)
                          }}
                        >
                          Editar
                        </button>
                      )}
                      <div>
                        <button
                          className="notas__enlace"
                          type="button"
                          aria-label={`Historial de notas de ${evaluacion.nombre}`}
                          aria-expanded={historial === evaluacion.id}
                          onClick={() =>
                            setHistorial(
                              historial === evaluacion.id
                                ? null
                                : evaluacion.id,
                            )
                          }
                        >
                          {historial === evaluacion.id
                            ? 'Ocultar historial'
                            : 'Ver historial'}
                        </button>
                      </div>
                    </td>
                  )}
                  {ingresaNotas && (
                    <td>
                      <span
                        className="notas__estado-envio"
                        data-estado={evaluacion.envio?.estado}
                      >
                        {evaluacion.envio
                          ? ESTADO_REVISION[evaluacion.envio.estado]
                          : 'Estado no disponible'}
                      </span>
                      {evaluacion.envio?.estado === 'DEVUELTA' && (
                        <ComentarioDevolucion
                          comentario={evaluacion.envio.comentarioDevolucion}
                        />
                      )}
                    </td>
                  )}
                  {consultaNotas && (
                    <td>
                      <button
                        type="button"
                        className="notas__enlace"
                        aria-pressed={elegida === evaluacion.id}
                        aria-label={`Notas de ${evaluacion.nombre}`}
                        onClick={() =>
                          setElegida(
                            elegida === evaluacion.id ? null : evaluacion.id,
                          )
                        }
                      >
                        {elegida === evaluacion.id
                          ? 'Ocultar'
                          : rol === 'PROFESOR'
                            ? 'Ver notas'
                            : evaluacion.envio?.estado === 'EN_REVISION' ||
                                evaluacion.envio?.estado === 'APROBADA'
                              ? 'Ver notas'
                              : evaluacion.envio?.estado === 'DEVUELTA'
                                ? 'Corregir notas'
                                : 'Ingresar notas'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>
                  Suma de ponderaciones
                </th>
                <td>{datos.sumaPonderaciones} %</td>
                {editaEvaluaciones && <td />}
                {ingresaNotas && (
                  <>
                    <td />
                    <td />
                  </>
                )}
                {rol === 'PROFESOR' && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {editaEvaluaciones && edicion && (
        <FormularioEvaluacion
          key={edicion.id}
          evaluacion={edicion}
          ruta={`${ruta}/${edicion.id}`}
          alCancelar={() => setEdicion(null)}
          alBloquear={recargar}
          alGuardar={() => {
            setEdicion(null)
            setAvisoEdicion(true)
            recargarConNotasFinales()
          }}
        />
      )}
      {editaEvaluaciones && historial && (
        <HistorialDeNota key={historial} ruta={`${ruta}/${historial}/notas`} />
      )}
      {avisoEdicion && (
        <p className="notas__aviso" role="status">
          Evaluación actualizada.
        </p>
      )}
      {consultaNotas && elegida && (
        <NotasDeEvaluacion
          rol={rol}
          key={elegida}
          seccionId={seccionId}
          evaluacionId={elegida}
          alActualizar={(notas) => {
            setVersionNotas((n) => n + 1)
            if (!datos) return
            fijar({
              ...datos,
              evaluaciones: datos.evaluaciones.map((evaluacion) =>
                evaluacion.id === notas.evaluacion.id
                  ? {
                      ...evaluacion,
                      envio: {
                        estado: notas.estado,
                        comentarioDevolucion:
                          notas.estado === 'DEVUELTA'
                            ? (notas.comentarioDevolucion ?? null)
                            : null,
                      },
                    }
                  : evaluacion,
              ),
            })
          }}
        />
      )}
      {rol === 'PROFESOR' && (
        <NotasFinales seccionId={seccionId} version={versionNotas} />
      )}
    </section>
  )
}

const VACIO = { nombre: '', fecha: '', ponderacion: '' }

function FormularioEvaluacion({
  ruta,
  evaluacion,
  alGuardar,
  alCancelar,
  alBloquear,
}: {
  ruta: string
  evaluacion?: Evaluacion
  alGuardar: () => void
  alCancelar?: () => void
  alBloquear?: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [campos, setCampos] = useState(
    evaluacion
      ? {
          nombre: evaluacion.nombre,
          fecha: evaluacion.fecha,
          ponderacion: String(evaluacion.ponderacion),
        }
      : VACIO,
  )
  const [guardando, setGuardando] = useState(false)
  const [bloqueada, setBloqueada] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando || bloqueada) return
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
        method: evaluacion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!res.ok) {
        // El 400 por la fecha trae el rango del período en el mensaje.
        const cuerpo = (await res.json().catch(() => null)) as {
          message?: unknown
        } | null
        if (evaluacion && res.status === 409) {
          setBloqueada(true)
          setError(EVALUACION_CON_NOTAS)
          alBloquear?.()
          return
        }
        setError(
          res.status === 400 && typeof cuerpo?.message === 'string'
            ? cuerpo.message
            : 'No pudimos guardar la evaluación. Revisa los datos e inténtalo nuevamente.',
        )
        return
      }
      if (!evaluacion) {
        setCampos(VACIO)
        setAviso('Evaluación creada')
      }
      alGuardar()
    } catch {
      setError(
        'No pudimos guardar la evaluación. Comprueba tu conexión e inténtalo nuevamente.',
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
      aria-label={
        evaluacion ? `Editar ${evaluacion.nombre}` : 'Nueva evaluación'
      }
      onSubmit={(event) => void guardar(event)}
    >
      <label className="notas__campo">
        Nombre
        <input
          autoFocus={Boolean(evaluacion)}
          disabled={guardando || bloqueada}
          value={campos.nombre}
          onChange={cambiar('nombre')}
          maxLength={LARGO_NOMBRE_EVALUACION}
          required
        />
      </label>
      <label className="notas__campo">
        Fecha
        <input
          disabled={guardando || bloqueada}
          type="date"
          value={campos.fecha}
          onChange={cambiar('fecha')}
          required
        />
      </label>
      <label className="notas__campo">
        Ponderación (%)
        <input
          disabled={guardando || bloqueada}
          type="number"
          value={campos.ponderacion}
          onChange={cambiar('ponderacion')}
          min={PONDERACION_MINIMA}
          max={PONDERACION_MAXIMA}
          step={1}
          required
        />
      </label>
      <button
        className="notas__boton"
        type="submit"
        disabled={guardando || bloqueada}
      >
        {evaluacion ? 'Guardar cambios' : 'Crear evaluación'}
      </button>
      {alCancelar && (
        <button
          className="notas__enlace"
          type="button"
          disabled={guardando}
          onClick={alCancelar}
        >
          Cancelar
        </button>
      )}
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
