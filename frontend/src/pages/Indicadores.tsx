import type {
  IndicadoresFacultad,
  MetricasConsolidadas,
  MetricasUniversidad,
  PeriodoMetrica,
  ResumenUniversidad,
} from '@cursus/shared'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from 'react-router'
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
  const { periodo, valido, consulta, sufijo } = usePeriodoDeLaUrl()
  // Con un período inválido no se pide nada a la API.
  const [metricas, recargar] = useDatos<MetricasConsolidadas>(
    valido ? `/api/metricas/consolidado${consulta}` : null,
  )
  if (!valido) return <PeriodoInvalido periodo={periodo} />

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
            {plural(metricas.cursos, 'curso')} del período {periodo ?? 'activo'}
            .
          </p>
        </>
      )}
      <ListaUniversidades consulta={consulta} sufijo={sufijo} />
    </section>
  )
}

// MET-04: el período se conserva en la URL (?periodo=AAAA-S) y los tres
// niveles (consolidado, universidades y facultades) piden el mismo. Sin él, es
// el período activo. MET-03 agrega el selector que lo escribe. Un valor que no
// tiene la forma AAAA-S no se envía: se avisa (valido = false).
const FORMATO_PERIODO = /^\d{4}-\d{1,2}$/

function usePeriodoDeLaUrl() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo')
  const consulta = periodo ? `?periodo=${encodeURIComponent(periodo)}` : ''
  const valido = periodo === null || FORMATO_PERIODO.test(periodo)
  return { periodo, valido, consulta, sufijo: consulta }
}

// El 400 del período no es "la universidad no existe": se dice qué falló y se
// ofrece volver al período activo.
function PeriodoInvalido({ periodo }: { periodo: string | null }) {
  return (
    <section className="indicadores" aria-label="Período inválido">
      <div role="alert">
        <p>
          El período «{periodo}» no es válido. Usa el formato año-semestre, por
          ejemplo 2026-1.
        </p>
        <Link className="estado__boton" to="/indicadores">
          Ver el período activo
        </Link>
      </div>
    </section>
  )
}

// Primer nivel del drill-down: cada universidad con sus indicadores; al hacer
// clic se abren sus facultades.
function ListaUniversidades({
  consulta,
  sufijo,
}: {
  consulta: string
  sufijo: string
}) {
  const [universidades, recargar] = useDatos<ResumenUniversidad[]>(
    `/api/metricas/universidades${consulta}`,
  )
  return (
    <section className="indicadores__nivel" aria-label="Universidades">
      <h3 className="indicadores__subtitulo">Universidades</h3>
      {universidades === undefined ? (
        <Cargando texto="Cargando universidades…" />
      ) : universidades === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar las universidades."
          onReintentar={recargar}
        />
      ) : universidades.length === 0 ? (
        <p className="indicadores__alcance">No hay universidades.</p>
      ) : (
        <ul className="indicadores__lista">
          {universidades.map((u) => (
            <li key={u.id} className="indicadores__fila">
              <Link
                className="indicadores__enlace"
                to={`/indicadores/universidades/${u.id}${sufijo}`}
              >
                {u.nombre}
              </Link>
              <ResumenEnLinea indicadores={u} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ResumenEnLinea({
  indicadores: i,
}: {
  indicadores: Pick<
    IndicadoresFacultad,
    'aprobacion' | 'promedio' | 'asistencia'
  >
}) {
  const valor = (v: number | null, d: number, unidad = '') =>
    v === null
      ? SIN_DATOS
      : `${v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })}${unidad}`
  return (
    <p className="indicadores__resumen">
      Aprobación: {valor(i.aprobacion.valor, 1, ' %')} · Promedio:{' '}
      {valor(i.promedio.valor, 2)} · Asistencia:{' '}
      {valor(i.asistencia.valor, 2, ' %')}
    </p>
  )
}

// Subrutas de /indicadores: el consolidado y, debajo, una universidad con sus
// facultades (MET-04).
export function RutasIndicadores() {
  return (
    <Routes>
      <Route index element={<Indicadores />} />
      <Route path="universidades/:id" element={<FacultadesUniversidad />} />
      <Route path="*" element={<Navigate to="/indicadores" replace />} />
    </Routes>
  )
}

// MET-04: facultades de una universidad con los tres indicadores, y un
// breadcrumb para volver al consolidado sin perder el período.
function FacultadesUniversidad() {
  const { id } = useParams()
  const { periodo, valido, consulta, sufijo } = usePeriodoDeLaUrl()
  const [datos, recargar, status] = useDatos<MetricasUniversidad>(
    valido ? `/api/metricas/universidades/${id}/facultades${consulta}` : null,
  )
  const volver = `/indicadores${sufijo}`
  if (!valido) return <PeriodoInvalido periodo={periodo} />

  return (
    <section className="indicadores" aria-label="Indicadores por facultad">
      <nav className="indicadores__migas" aria-label="Ruta de navegación">
        <ol>
          <li>
            <Link to={volver}>Indicadores</Link>
          </li>
          <li aria-current="page">
            {datos ? datos.universidad.nombre : 'Universidad'}
          </li>
        </ol>
      </nav>
      {/* MET-03 agrega el filtro: hoy muestra el período de la URL. */}
      <label className="indicadores__periodo">
        Período
        <select disabled aria-label="Período" value="actual">
          <option value="actual">
            {datos ? etiquetaPeriodo(datos.periodo) : 'Período activo'}
          </option>
        </select>
      </label>
      {datos === undefined ? (
        <Cargando texto="Cargando facultades…" />
      ) : datos === null ? (
        status === 404 || status === 400 ? (
          <div role="alert">
            <p>La universidad no existe.</p>
            <Link className="estado__boton" to={volver}>
              Volver a Indicadores
            </Link>
          </div>
        ) : (
          <ErrorEstado
            mensaje="No pudimos cargar las facultades."
            onReintentar={recargar}
          />
        )
      ) : datos.facultades.length === 0 ? (
        <p className="indicadores__alcance">
          Esta universidad no tiene facultades.
        </p>
      ) : (
        <ul className="indicadores__lista" aria-label="Facultades">
          {datos.facultades.map((f) => (
            <li key={f.id} className="indicadores__facultad">
              <article aria-label={f.nombre}>
                <h3 className="indicadores__subtitulo">{f.nombre}</h3>
                <ul className="indicadores__tarjetas" aria-label="Indicadores">
                  <Tarjeta
                    titulo="Tasa de aprobación"
                    valor={f.aprobacion.valor}
                    unidad="%"
                    decimales={1}
                    detalle={`${f.aprobacion.aprobados} de ${plural(f.aprobacion.evaluados, 'alumno')} con nota final`}
                  />
                  <Tarjeta
                    titulo="Promedio"
                    valor={f.promedio.valor}
                    unidad=""
                    decimales={2}
                    detalle={`${plural(f.promedio.alumnos, 'alumno')} con nota final`}
                  />
                  <Tarjeta
                    titulo="Asistencia"
                    valor={f.asistencia.valor}
                    unidad="%"
                    decimales={2}
                    detalle={`${f.asistencia.presentes} presentes de ${plural(f.asistencia.registros, 'registro')}`}
                  />
                </ul>
                <p className="indicadores__alcance">
                  {plural(f.alumnos, 'alumno')} inscritos en{' '}
                  {plural(f.cursos, 'curso')}.
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const etiquetaPeriodo = (p: PeriodoMetrica | null) =>
  p ? `${p.anio}-${p.semestre}` : 'Sin período en esta universidad'

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
