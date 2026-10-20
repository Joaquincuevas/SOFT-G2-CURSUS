import type {
  CambioCurso,
  Carrera,
  CrearCurso,
  CursoEditable,
  OpcionPeriodo,
} from '@cursus/shared'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede } from '../session/session'
import { useDatos } from './useDatos'
import './Cursos.css'

const CAMPOS = ['codigo', 'nombre', 'carreraId', 'periodoId'] as const
const ETIQUETAS = {
  codigo: 'Código',
  nombre: 'Nombre del curso',
  carreraId: 'Carrera',
  periodoId: 'Período académico',
}
function valor(curso: CursoEditable, campo: (typeof CAMPOS)[number]) {
  return campo === 'carreraId'
    ? curso.carreraNombre
    : campo === 'periodoId'
      ? `${curso.periodo.anio}-${curso.periodo.semestre}`
      : curso[campo]
}

export function EditarCurso() {
  const { id = '' } = useParams()
  const puede = usePuede('update', 'Curso')
  return puede ? (
    <CargarEdicion key={id} id={id} />
  ) : (
    <Navigate to="/cursos" replace />
  )
}

function CargarEdicion({ id }: { id: string }) {
  const [curso, recargarCurso, status] = useDatos<CursoEditable>(
    `/api/cursos/${id}/edicion`,
  )
  const [carreras, recargarCarreras] = useDatos<Carrera[]>('/api/carreras')
  const [periodos, recargarPeriodos] =
    useDatos<OpcionPeriodo[]>('/api/periodos')
  if (curso === null && (status === 404 || status === 400))
    return (
      <section className="cursos">
        <h2>Curso no encontrado</h2>
        <p>El curso no existe o no pertenece a tu facultad.</p>
        <Link to="/cursos">Volver a cursos</Link>
      </section>
    )
  if (curso === null || carreras === null || periodos === null)
    return (
      <ErrorEstado
        mensaje="No se pudo cargar la edición del curso."
        onReintentar={() => {
          recargarCurso()
          recargarCarreras()
          recargarPeriodos()
        }}
      />
    )
  if (!curso || !carreras || !periodos)
    return <Cargando texto="Cargando edición del curso…" />
  return <Formulario curso={curso} carreras={carreras} periodos={periodos} />
}

function Formulario({
  curso,
  carreras,
  periodos,
}: {
  curso: CursoEditable
  carreras: Carrera[]
  periodos: OpcionPeriodo[]
}) {
  const { fetchConSesion } = useAuth()
  const [original, setOriginal] = useState(curso)
  const [datos, setDatos] = useState<CrearCurso>({
    codigo: curso.codigo,
    nombre: curso.nombre,
    carreraId: curso.carreraId,
    periodoId: curso.periodoId,
  })
  const [pendiente, setPendiente] = useState<CursoEditable | null>(null)
  const tituloConfirmacion = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (pendiente) tituloConfirmacion.current?.focus()
  }, [pendiente])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [historial, recargarHistorial] = useDatos<CambioCurso[]>(
    `/api/cursos/${curso.id}/historial`,
  )

  function revisar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setAviso(null)
    const limpio = {
      ...datos,
      codigo: datos.codigo.trim().toUpperCase(),
      nombre: datos.nombre.trim(),
    }
    if (!limpio.codigo || !limpio.nombre) {
      setError('Ingresa un código y nombre válidos.')
      return
    }
    const carrera = carreras.find((c) => c.id === limpio.carreraId)
    const periodo = periodos.find((p) => p.id === limpio.periodoId)
    if (!carrera || !periodo) {
      setError('Selecciona una carrera y un período disponibles.')
      return
    }
    if (!CAMPOS.some((campo) => limpio[campo] !== original[campo])) {
      setAviso('No hay cambios para guardar.')
      return
    }
    setPendiente({
      ...limpio,
      id: curso.id,
      carreraNombre: carrera.nombre,
      periodo: {
        id: periodo.id,
        anio: periodo.anio,
        semestre: periodo.semestre,
      },
    })
  }

  async function guardar() {
    if (!pendiente || guardando) return
    setGuardando(true)
    setError(null)
    const cuerpo: CrearCurso = {
      codigo: pendiente.codigo,
      nombre: pendiente.nombre,
      carreraId: pendiente.carreraId,
      periodoId: pendiente.periodoId,
    }
    try {
      const res = await fetchConSesion(`/api/cursos/${curso.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      if (!res.ok) {
        setError(
          res.status === 409
            ? 'Ya existe un curso con ese código en el período seleccionado'
            : res.status === 404
              ? 'El curso, la carrera o el período ya no están disponibles. Recarga la página.'
              : 'No pudimos guardar los cambios. Revisa los datos e inténtalo nuevamente.',
        )
        return
      }
      const actualizado = (await res.json()) as CursoEditable
      setOriginal(actualizado)
      setDatos({
        codigo: actualizado.codigo,
        nombre: actualizado.nombre,
        carreraId: actualizado.carreraId,
        periodoId: actualizado.periodoId,
      })
      setAviso('Cambios guardados.')
      recargarHistorial()
    } catch {
      setError(
        'No pudimos guardar los cambios. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setPendiente(null)
      setGuardando(false)
    }
  }

  return (
    <section className="cursos" aria-label="Editar curso">
      <Link className="cursos__enlace" to={`/cursos/${curso.id}`}>
        ← Volver al detalle
      </Link>
      <h2 className="cursos__titulo">Editar curso {original.codigo}</h2>
      {aviso && (
        <p role="status" className="cursos__exito">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="cursos__error">
          {error}
        </p>
      )}
      <form
        className="cursos__tarjeta"
        aria-label="Datos del curso"
        hidden={pendiente !== null}
        onSubmit={revisar}
      >
        <div className="cursos__campos">
          <label className="cursos__campo">
            Código
            <input
              className="cursos__input"
              required
              maxLength={20}
              value={datos.codigo}
              onChange={(e) => setDatos({ ...datos, codigo: e.target.value })}
            />
          </label>
          <label className="cursos__campo">
            Nombre del curso
            <input
              className="cursos__input"
              required
              maxLength={200}
              value={datos.nombre}
              onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
            />
          </label>
          <label className="cursos__campo">
            Carrera
            <select
              className="cursos__input"
              required
              value={datos.carreraId}
              onChange={(e) =>
                setDatos({ ...datos, carreraId: e.target.value })
              }
            >
              <option value="" disabled>
                Selecciona una carrera
              </option>
              {carreras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="cursos__campo">
            Período académico
            <select
              className="cursos__input"
              required
              value={datos.periodoId}
              onChange={(e) =>
                setDatos({ ...datos, periodoId: e.target.value })
              }
            >
              <option value="" disabled>
                Selecciona un período
              </option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.anio}-{p.semestre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="cursos__acciones">
          <button className="cursos__boton" type="submit">
            Revisar cambios
          </button>
          <Link
            className="cursos__boton cursos__boton--secundario"
            to={`/cursos/${curso.id}`}
          >
            Cancelar
          </Link>
        </div>
      </form>
      {pendiente && (
        <section className="cursos__tarjeta" aria-label="Confirmar cambios">
          <h3 ref={tituloConfirmacion} tabIndex={-1}>
            Confirma los cambios antes de guardar
          </h3>
          <p>
            Estos cambios quedarán registrados con tu usuario, la fecha y los
            valores anteriores.
          </p>
          <div className="cursos__tabla-contenedor">
            <table className="cursos__tabla">
              <caption>Resumen de cambios</caption>
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Anterior</th>
                  <th>Nuevo</th>
                </tr>
              </thead>
              <tbody>
                {CAMPOS.filter(
                  (campo) => pendiente[campo] !== original[campo],
                ).map((campo) => (
                  <tr key={campo}>
                    <th scope="row">{ETIQUETAS[campo]}</th>
                    <td>{valor(original, campo)}</td>
                    <td>{valor(pendiente, campo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cursos__acciones">
            <button
              className="cursos__boton"
              disabled={guardando}
              onClick={() => void guardar()}
            >
              {guardando ? 'Guardando…' : 'Confirmar y guardar'}
            </button>
            <button
              className="cursos__boton cursos__boton--secundario"
              disabled={guardando}
              onClick={() => setPendiente(null)}
            >
              Volver a editar
            </button>
          </div>
        </section>
      )}
      <section className="cursos__tarjeta" aria-label="Historial de cambios">
        <h3>Historial de cambios</h3>
        {historial === undefined ? (
          <Cargando texto="Cargando historial…" />
        ) : historial === null ? (
          <ErrorEstado
            mensaje="No se pudo cargar el historial."
            onReintentar={recargarHistorial}
          />
        ) : historial.length === 0 ? (
          <p>Aún no hay cambios registrados.</p>
        ) : (
          historial.map((cambio) => (
            <article key={cambio.id} className="cursos__cambio">
              <p>
                <time dateTime={cambio.fecha}>
                  {new Date(cambio.fecha).toLocaleString('es-CL')}
                </time>{' '}
                · {cambio.responsable.nombre}
              </p>
              <dl>
                {CAMPOS.filter(
                  (campo) => cambio.anterior[campo] !== cambio.nuevo[campo],
                ).map((campo) => (
                  <div key={campo}>
                    <dt>{ETIQUETAS[campo]}</dt>
                    <dd>
                      Anterior: {valor(cambio.anterior, campo)} → Nuevo:{' '}
                      {valor(cambio.nuevo, campo)}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))
        )}
      </section>
    </section>
  )
}
