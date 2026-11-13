import {
  ZONA_HORARIA_UNIVERSIDAD,
  type CursoArchivado,
  type CursoArchivadoListado,
  type SeccionArchivada,
} from '@cursus/shared'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede } from '../session/session'
import { useDatos } from './useDatos'
import './Cursos.css'

const API = '/api/cursos-archivados'
const RUTA = '/cursos/archivados'
const nota = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function CursosArchivados() {
  const puedeGestionar = usePuede('update', 'Curso')
  const { id } = useParams()
  if (!puedeGestionar) return <Navigate to="/cursos" replace />
  return id ? <DetalleArchivado key={id} id={id} /> : <ListadoArchivados />
}

function ListadoArchivados() {
  const [cursos, recargar] = useDatos<CursoArchivadoListado[]>(API)
  const [filtros, setFiltros] = useSearchParams()
  const periodoId = filtros.get('periodo') ?? ''
  const periodos = [
    ...new Map(cursos?.map(({ periodo }) => [periodo.id, periodo])).values(),
  ]
  const visibles = cursos?.filter(
    ({ periodo }) => !periodoId || periodo.id === periodoId,
  )
  const consulta = filtros.toString()
  return (
    <section className="cursos" aria-label="Cursos archivados">
      <Link className="cursos__enlace" to="/cursos">
        Volver a cursos
      </Link>
      <h2 className="cursos__titulo">Archivados</h2>
      {cursos && (
        <label className="cursos__campo">
          Período
          <select
            className="cursos__input"
            value={periodoId}
            onChange={(e) => {
              const periodo = e.target.value
              setFiltros(periodo ? { periodo } : {}, { replace: true })
            }}
          >
            <option value="">Todos</option>
            {periodos.map(({ id, anio, semestre }) => (
              <option key={id} value={id}>
                {anio}-{semestre}
              </option>
            ))}
          </select>
        </label>
      )}
      {cursos === undefined ? (
        <Cargando texto="Cargando cursos archivados…" />
      ) : cursos === null ? (
        <ErrorEstado
          mensaje="No se pudieron cargar los cursos archivados."
          onReintentar={recargar}
        />
      ) : !visibles?.length ? (
        <p className="cursos__mensaje">
          No hay cursos archivados para mostrar.
        </p>
      ) : (
        <div className="cursos__tarjeta cursos__tabla-contenedor">
          <table className="cursos__tabla" aria-label="Cursos archivados">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Curso</th>
                <th scope="col">Carrera</th>
                <th scope="col">Período</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((curso) => (
                <tr key={curso.id}>
                  <td>
                    <Link
                      className="cursos__enlace"
                      to={`${RUTA}/${curso.id}${consulta ? '?' + consulta : ''}`}
                    >
                      {curso.codigo}
                    </Link>
                  </td>
                  <td>{curso.nombre}</td>
                  <td>{curso.carreraNombre}</td>
                  <td>
                    {curso.periodo.anio}-{curso.periodo.semestre}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DetalleArchivado({ id }: { id: string }) {
  const [curso, recargar, estado] = useDatos<CursoArchivado>(`${API}/${id}`)
  const [filtros] = useSearchParams()
  const consulta = filtros.toString()
  return (
    <section className="cursos" aria-label="Detalle del curso archivado">
      <Link
        className="cursos__enlace"
        to={consulta ? `${RUTA}?${consulta}` : RUTA}
      >
        Volver a archivados
      </Link>
      {curso === undefined ? (
        <Cargando texto="Cargando curso archivado…" />
      ) : curso === null ? (
        estado === 400 || estado === 404 ? (
          <p className="cursos__mensaje">
            El curso archivado no está disponible.
          </p>
        ) : (
          <ErrorEstado
            mensaje="No se pudo cargar el curso archivado."
            onReintentar={recargar}
          />
        )
      ) : (
        <>
          <div className="cursos__encabezado">
            <h2 className="cursos__titulo">
              {curso.codigo} · {curso.nombre}
            </h2>
            <p className="cursos__subtitulo">
              {curso.carreraNombre} · Período {curso.periodo.anio}-
              {curso.periodo.semestre}
            </p>
            <p className="cursos__subtitulo">
              Archivado el{' '}
              <time dateTime={curso.archivadoEn}>
                {new Date(curso.archivadoEn).toLocaleDateString('es-CL', {
                  dateStyle: 'long',
                  timeZone: ZONA_HORARIA_UNIVERSIDAD,
                })}
              </time>
              {' · Solo lectura'}
            </p>
          </div>
          {curso.secciones.length === 0 && (
            <p className="cursos__mensaje">
              El curso archivado no tiene secciones.
            </p>
          )}
          {curso.secciones.map((seccion) => (
            <RegistroSeccion key={seccion.id} seccion={seccion} />
          ))}
        </>
      )}
    </section>
  )
}

function RegistroSeccion({ seccion }: { seccion: SeccionArchivada }) {
  return (
    <section
      className="cursos__tarjeta"
      aria-label={`Sección ${seccion.numero}`}
    >
      <h3>Sección {seccion.numero}</h3>
      <h4>Notas publicadas</h4>
      {seccion.evaluaciones.length === 0 && (
        <p>Sin evaluaciones registradas.</p>
      )}
      {seccion.evaluaciones.map((evaluacion) => (
        <details key={evaluacion.id}>
          <summary>
            {evaluacion.nombre} · {evaluacion.fecha} · {evaluacion.ponderacion}{' '}
            %
          </summary>
          {evaluacion.notas.length === 0 ? (
            <p>Sin notas publicadas.</p>
          ) : (
            <div className="cursos__tabla-contenedor">
              <table
                className="cursos__tabla"
                aria-label={`Notas de ${evaluacion.nombre}`}
              >
                <thead>
                  <tr>
                    <th scope="col">Alumno</th>
                    <th scope="col">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluacion.notas.map((n) => (
                    <tr key={n.alumnoId}>
                      <td>{n.alumno}</td>
                      <td>{nota.format(n.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      ))}
      <h4>Asistencia</h4>
      {seccion.clases.length === 0 && <p>Sin clases registradas.</p>}
      {seccion.clases.map((clase) => (
        <details key={clase.id}>
          <summary>
            {clase.fecha} · {clase.inicio}–{clase.termino} · {clase.sala}
          </summary>
          {clase.marcas.length === 0 ? (
            <p>Sin marcas de asistencia.</p>
          ) : (
            <div className="cursos__tabla-contenedor">
              <table
                className="cursos__tabla"
                aria-label={`Asistencia del ${clase.fecha} a las ${clase.inicio}`}
              >
                <thead>
                  <tr>
                    <th scope="col">Alumno</th>
                    <th scope="col">Asistencia</th>
                  </tr>
                </thead>
                <tbody>
                  {clase.marcas.map((m) => (
                    <tr key={m.alumnoId}>
                      <td>{m.alumno}</td>
                      <td>{m.presente ? 'Presente' : 'Ausente'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      ))}
    </section>
  )
}
