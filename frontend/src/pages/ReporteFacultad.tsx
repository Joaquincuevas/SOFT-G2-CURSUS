import type {
  Periodo,
  ReporteCarrera,
  ReporteFacultad as DatosReporte,
} from '@cursus/shared'
import { useSearchParams } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'
import './ReporteFacultad.css'

const FORMATO_PERIODO = /^\d{4}-[12]$/
const SIN_DATOS = 'Sin datos suficientes'

export function ReporteFacultad() {
  const [params, fijarParams] = useSearchParams()
  const periodo = params.get('periodo')
  const valido = periodo === null || FORMATO_PERIODO.test(periodo)
  const consulta = periodo ? `?periodo=${encodeURIComponent(periodo)}` : ''
  const [datos, recargar, status] = useDatos<DatosReporte>(
    valido ? `/api/metricas/facultad${consulta}` : null,
  )
  const [periodos, recargarPeriodos] = useDatos<Periodo[]>('/api/periodos')
  const opciones = periodos ?? []

  if (!valido) {
    return (
      <section className="reporte-facultad" aria-label="Reporte académico">
        <div role="alert">
          <p>El período «{periodo}» no es válido. Usa 2026-1 o 2026-2.</p>
          <button type="button" onClick={() => fijarParams({})}>
            Ver el período activo
          </button>
        </div>
      </section>
    )
  }

  return (
    <section
      className="reporte-facultad"
      aria-label="Reporte académico de la facultad"
    >
      <label className="reporte-facultad__periodo">
        Período
        <select
          aria-label="Período"
          value={periodo ?? periodoActivo(periodos)}
          disabled={periodos === undefined || opciones.length === 0}
          onChange={(evento) => fijarParams({ periodo: evento.target.value })}
        >
          {periodos === undefined ? (
            <option value="">Cargando períodos…</option>
          ) : opciones.length === 0 ? (
            <option value="">No hay períodos disponibles</option>
          ) : (
            opciones.map((p) => (
              <option key={p.id} value={valorDelPeriodo(p)}>
                {valorDelPeriodo(p)}
                {p.activo ? ' (activo)' : ''}
              </option>
            ))
          )}
        </select>
      </label>
      {periodos === null && (
        <div role="alert">
          <span>No pudimos cargar los períodos.</span>{' '}
          <button type="button" onClick={recargarPeriodos}>
            Reintentar
          </button>
        </div>
      )}
      {datos === undefined ? (
        <Cargando texto="Cargando reporte académico…" />
      ) : datos === null ? (
        <ErrorEstado
          mensaje={
            status === 400
              ? 'El período no es válido.'
              : 'No pudimos cargar el reporte académico.'
          }
          onReintentar={recargar}
        />
      ) : datos.carreras.length === 0 ? (
        <p>Tu facultad no tiene carreras para este período.</p>
      ) : (
        <TablaReporte carreras={datos.carreras} />
      )}
    </section>
  )
}

// El año va con cuatro dígitos (Gestión admite del 1 al 9999): 999-1 se
// escribe 0999-1, que es lo que la API y esta pantalla aceptan en ?periodo=.
const valorDelPeriodo = ({
  anio,
  semestre,
}: Pick<Periodo, 'anio' | 'semestre'>) =>
  `${String(anio).padStart(4, '0')}-${semestre}`

function periodoActivo(periodos: Periodo[] | null | undefined) {
  const activo = periodos?.find((p) => p.activo)
  return activo ? valorDelPeriodo(activo) : ''
}

function TablaReporte({ carreras }: { carreras: ReporteCarrera[] }) {
  return (
    <table className="reporte-facultad__tabla">
      <caption>Carreras y cursos de la facultad</caption>
      <thead>
        <tr>
          <th scope="col">Carrera / curso</th>
          <th scope="col">Aprobación</th>
          <th scope="col">Promedio</th>
          <th scope="col">Asistencia</th>
        </tr>
      </thead>
      <tbody>
        {carreras.map((carrera) => (
          <>
            <tr key={carrera.id} className="reporte-facultad__carrera">
              <th scope="row">{carrera.nombre}</th>
              <Celda indicador={carrera.aprobacion} decimales={1} porcentaje />
              <Celda indicador={carrera.promedio} decimales={2} />
              <Celda indicador={carrera.asistencia} decimales={2} porcentaje />
            </tr>
            {carrera.cursos.map((curso) => (
              <tr key={curso.id}>
                <th scope="row" className="reporte-facultad__curso">
                  {curso.codigo} · {curso.nombre}
                </th>
                <Celda indicador={curso.aprobacion} decimales={1} porcentaje />
                <Celda indicador={curso.promedio} decimales={2} />
                <Celda indicador={curso.asistencia} decimales={2} porcentaje />
              </tr>
            ))}
          </>
        ))}
      </tbody>
    </table>
  )
}

function Celda({
  indicador,
  decimales,
  porcentaje = false,
}: {
  indicador: { valor: number | null }
  decimales: number
  porcentaje?: boolean
}) {
  return (
    <td>
      {indicador.valor === null
        ? SIN_DATOS
        : `${indicador.valor.toLocaleString('es-CL', {
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales,
          })}${porcentaje ? ' %' : ''}`}
    </td>
  )
}
