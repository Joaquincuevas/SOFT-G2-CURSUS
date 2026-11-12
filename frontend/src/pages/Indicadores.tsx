import type { MetricasConsolidadas } from '@cursus/shared'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import './Indicadores.css'
import { useDatos } from './useDatos'

const SIN_DATOS = 'Sin datos suficientes'

// MET-01: tasa de aprobación, promedio y asistencia del período activo,
// consolidados entre universidades. Solo el Director llega aquí (permiso
// read Metricas en navigation.ts). Un indicador con valor null no tiene
// denominador: se dice, en vez de mostrar 0.
export function Indicadores() {
  const [metricas, recargar] = useDatos<MetricasConsolidadas>(
    '/api/metricas/consolidado',
  )

  return (
    <section className="indicadores" aria-label="Indicadores consolidados">
      {/* MET-03 agrega el filtro: hoy siempre es el período activo. */}
      <label className="indicadores__periodo">
        Período
        <select disabled aria-label="Período" value="activo">
          <option value="activo">
            {metricas
              ? periodos(metricas)
              : 'Período activo de cada universidad'}
          </option>
        </select>
      </label>
      {metricas === undefined ? (
        <Cargando texto="Cargando indicadores…" />
      ) : metricas === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar los indicadores."
          onReintentar={recargar}
        />
      ) : (
        <>
          <ul className="indicadores__tarjetas" aria-label="Indicadores">
            <Tarjeta
              titulo="Tasa de aprobación"
              valor={metricas.aprobacion.valor}
              unidad="%"
              decimales={1}
              detalle={`${metricas.aprobacion.aprobados} de ${plural(metricas.aprobacion.evaluados, 'alumno')} con nota final`}
            />
            <Tarjeta
              titulo="Promedio"
              valor={metricas.promedio.valor}
              unidad=""
              decimales={2}
              detalle={`${plural(metricas.promedio.alumnos, 'alumno')} con nota final`}
            />
            <Tarjeta
              titulo="Asistencia"
              valor={metricas.asistencia.valor}
              unidad="%"
              decimales={2}
              detalle={`${metricas.asistencia.presentes} presentes de ${plural(metricas.asistencia.registros, 'registro')}`}
            />
          </ul>
          <p className="indicadores__alcance">
            {plural(metricas.alumnos, 'alumno')} inscritos en{' '}
            {plural(metricas.cursos, 'curso')} del período activo.
          </p>
        </>
      )}
    </section>
  )
}

function Tarjeta({
  titulo,
  valor,
  unidad,
  decimales,
  detalle,
}: {
  titulo: string
  valor: number | null
  unidad: string
  decimales: number
  detalle: string
}) {
  return (
    <li className="indicadores__tarjeta">
      <article aria-label={titulo}>
        <h3 className="indicadores__titulo">{titulo}</h3>
        {valor === null ? (
          <p className="indicadores__sin-datos">{SIN_DATOS}</p>
        ) : (
          <p className="indicadores__valor">
            {valor.toLocaleString('es-CL', {
              minimumFractionDigits: decimales,
              maximumFractionDigits: decimales,
            })}
            {unidad && <span className="indicadores__unidad">{unidad}</span>}
          </p>
        )}
        <p className="indicadores__detalle">{detalle}</p>
      </article>
    </li>
  )
}

const plural = (n: number, nombre: string) =>
  `${n} ${nombre}${n === 1 ? '' : 's'}`

// "2026-2 (Norte, Sur)" o, si difieren, "Norte 2026-2 · Sur 2026-1".
function periodos({ periodos }: MetricasConsolidadas): string {
  if (periodos.length === 0) return 'Sin período activo'
  const etiquetas = new Set(periodos.map((p) => `${p.anio}-${p.semestre}`))
  if (etiquetas.size === 1) {
    return `${[...etiquetas][0]} (${periodos.map((p) => p.universidad).join(', ')})`
  }
  return periodos
    .map((p) => `${p.universidad} ${p.anio}-${p.semestre}`)
    .join(' · ')
}
