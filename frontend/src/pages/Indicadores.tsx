import type {
  IndicadoresFacultad,
  MetricasConsolidadas,
  MetricasFacultad,
  MetricasUniversidad,
  PeriodoDisponible,
  ResumenUniversidad,
} from '@cursus/shared'
import { useState } from 'react'
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
      <SelectorPeriodo periodo={periodo} />
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
      <Link
        className="indicadores__enlace"
        to={`/indicadores/comparar${sufijo}`}
      >
        Comparar universidades
      </Link>
      <ListaUniversidades consulta={consulta} sufijo={sufijo} />
    </section>
  )
}

// MET-04: el período se conserva en la URL (?periodo=AAAA-S) y los tres
// niveles (consolidado, universidades y facultades) piden el mismo. Sin él, es
// el período activo. MET-03 agrega el selector que lo escribe. Un valor que no
// tiene la forma AAAA-S no se envía: se avisa (valido = false).
const FORMATO_PERIODO = /^\d{4}-[12]$/

function usePeriodoDeLaUrl() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo')
  const consulta = periodo ? `?periodo=${encodeURIComponent(periodo)}` : ''
  const valido = periodo === null || FORMATO_PERIODO.test(periodo)
  return { periodo, valido, consulta, sufijo: consulta }
}

// Valor de una opción: el año va con cuatro dígitos (Gestión admite del 1 al
// 9999), que es la forma que la API y esta pantalla aceptan en ?periodo=.
const valorDelPeriodo = ({ anio, semestre }: PeriodoDisponible) =>
  `${String(anio).padStart(4, '0')}-${semestre}`

// La vista por defecto ("") es el período activo de cada universidad, que
// puede ser distinto entre ellas; elegir un año y semestre filtra todas por
// ese período. Volver a la opción por defecto quita ?periodo= de la URL.
function SelectorPeriodo({ periodo }: { periodo: string | null }) {
  const [periodosDisponibles, recargar] = useDatos<PeriodoDisponible[]>(
    '/api/metricas/periodos',
  )
  const [, fijarParams] = useSearchParams()
  const valor = periodo ?? ''
  const cambiar = (valorNuevo: string) => {
    if (valorNuevo) fijarParams({ periodo: valorNuevo })
    else fijarParams({})
  }

  if (periodosDisponibles === null) {
    return (
      <div className="indicadores__periodo" role="alert">
        <span>No pudimos cargar los períodos.</span>{' '}
        <button type="button" onClick={recargar}>
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <label className="indicadores__periodo">
      Período
      <select
        aria-label="Período"
        value={valor}
        disabled={
          periodosDisponibles === undefined || periodosDisponibles.length === 0
        }
        onChange={(e) => cambiar(e.target.value)}
      >
        {periodosDisponibles === undefined ? (
          <option value="">Cargando períodos…</option>
        ) : periodosDisponibles.length === 0 ? (
          <option value="">No hay períodos disponibles</option>
        ) : (
          <>
            <option value="">Período activo de cada universidad</option>
            {periodosDisponibles.map((p) => (
              <option key={valorDelPeriodo(p)} value={valorDelPeriodo(p)}>
                {valorDelPeriodo(p)}
              </option>
            ))}
          </>
        )}
      </select>
    </label>
  )
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

// Subrutas de /indicadores: el consolidado, la comparación entre
// universidades (MET-02), una universidad con sus facultades (MET-04) y una
// facultad con sus carreras (MET-05).
export function RutasIndicadores() {
  return (
    <Routes>
      <Route index element={<Indicadores />} />
      <Route path="comparar" element={<CompararUniversidades />} />
      <Route
        path="universidades/:id/facultades/:facultadId"
        element={<CarrerasFacultad />}
      />
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
      <SelectorPeriodo periodo={periodo} />
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
                <h3 className="indicadores__subtitulo">
                  <Link
                    className="indicadores__enlace"
                    to={`/indicadores/universidades/${id}/facultades/${f.id}${sufijo}`}
                  >
                    {f.nombre}
                  </Link>
                </h3>
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

// MET-02: los tres indicadores de cada universidad lado a lado, en tabla y en
// un gráfico de barras del indicador elegido. Usa la misma consulta que la
// lista de universidades (MET-04), así que solo el Director la obtiene (403
// para los demás roles) y respeta el período de la URL.
const INDICADORES = {
  aprobacion: { titulo: 'Tasa de aprobación', unidad: ' %', decimales: 1 },
  promedio: { titulo: 'Promedio', unidad: '', decimales: 2 },
  asistencia: { titulo: 'Asistencia', unidad: ' %', decimales: 2 },
} as const

type IndicadorComparado = keyof typeof INDICADORES

// Largo de la barra: los porcentajes sobre 100 y el promedio sobre la escala
// de notas 1,0 a 7,0 (NOT-06): un 1,0 es la barra vacía y un 7,0 la llena.
function proporcion(indicador: IndicadorComparado, valor: number) {
  const fraccion =
    indicador === 'promedio' ? (valor - 1) / (7 - 1) : valor / 100
  return Math.min(Math.max(fraccion, 0), 1)
}

const formatear = (indicador: IndicadorComparado, valor: number | null) => {
  if (valor === null) return SIN_DATOS
  const { unidad, decimales } = INDICADORES[indicador]
  return `${valor.toLocaleString('es-CL', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}${unidad}`
}

const nombreDelPeriodo = (periodo: ResumenUniversidad['periodo']) =>
  periodo ? `${periodo.anio}-${periodo.semestre}` : 'Sin período'

function CompararUniversidades() {
  const { periodo, valido, consulta, sufijo } = usePeriodoDeLaUrl()
  const [universidades, recargar] = useDatos<ResumenUniversidad[]>(
    valido ? `/api/metricas/universidades${consulta}` : null,
  )
  const [graficado, fijarGraficado] = useState<IndicadorComparado>('aprobacion')
  if (!valido) return <PeriodoInvalido periodo={periodo} />

  return (
    <section
      className="indicadores"
      aria-label="Comparación entre universidades"
    >
      <nav className="indicadores__migas" aria-label="Ruta de navegación">
        <ol>
          <li>
            <Link to={`/indicadores${sufijo}`}>Indicadores</Link>
          </li>
          <li aria-current="page">Comparar universidades</li>
        </ol>
      </nav>
      <SelectorPeriodo periodo={periodo} />
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
        <>
          <div className="indicadores__tabla">
            <table>
              <caption>Indicadores por universidad</caption>
              <thead>
                <tr>
                  <th scope="col">Universidad</th>
                  <th scope="col">Período</th>
                  {Object.values(INDICADORES).map(({ titulo }) => (
                    <th key={titulo} scope="col">
                      {titulo}
                    </th>
                  ))}
                  <th scope="col">Alumnos</th>
                </tr>
              </thead>
              <tbody>
                {universidades.map((u) => (
                  <tr key={u.id}>
                    <th scope="row">{u.nombre}</th>
                    <td>{nombreDelPeriodo(u.periodo)}</td>
                    {(Object.keys(INDICADORES) as IndicadorComparado[]).map(
                      (clave) => (
                        <td key={clave}>{formatear(clave, u[clave].valor)}</td>
                      ),
                    )}
                    <td>{u.alumnos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section
            className="indicadores__grafico"
            aria-label="Gráfico comparativo"
          >
            <label className="indicadores__periodo">
              Indicador a graficar
              <select
                aria-label="Indicador a graficar"
                value={graficado}
                onChange={(e) =>
                  fijarGraficado(e.target.value as IndicadorComparado)
                }
              >
                {(Object.keys(INDICADORES) as IndicadorComparado[]).map(
                  (clave) => (
                    <option key={clave} value={clave}>
                      {INDICADORES[clave].titulo}
                    </option>
                  ),
                )}
              </select>
            </label>
            <ul
              className="indicadores__barras"
              aria-label={`${INDICADORES[graficado].titulo} por universidad`}
            >
              {universidades.map((u) => {
                const valor = u[graficado].valor
                return (
                  <li key={u.id} className="indicadores__barra">
                    <span className="indicadores__barra-nombre">
                      {u.nombre}
                    </span>
                    <span className="indicadores__barra-pista" aria-hidden>
                      {valor !== null && (
                        <span
                          className="indicadores__barra-relleno"
                          style={{
                            width: `${(proporcion(graficado, valor) * 100).toFixed(2)}%`,
                          }}
                        />
                      )}
                    </span>
                    <span
                      className={
                        valor === null
                          ? 'indicadores__barra-valor indicadores__barra-valor--sin-datos'
                          : 'indicadores__barra-valor'
                      }
                    >
                      {formatear(graficado, valor)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </section>
  )
}

// MET-05: carreras de una facultad, conservando la ruta y el período.
function CarrerasFacultad() {
  const { id, facultadId } = useParams()
  const { periodo, valido, consulta, sufijo } = usePeriodoDeLaUrl()
  const [datos, recargar, status] = useDatos<MetricasFacultad>(
    valido
      ? `/api/metricas/facultades/${facultadId}/carreras${consulta}`
      : null,
  )
  // La universidad de la facultad (la de la API) manda sobre la de la URL: un
  // enlace directo puede traer una universidad que no es la de la facultad.
  // Mientras no cargue, o si falla, vale la de la URL.
  const universidadId = datos?.universidad.id ?? id
  const volverUniversidad = `/indicadores/universidades/${universidadId}${sufijo}`
  const volverIndicadores = `/indicadores${sufijo}`
  if (!valido) return <PeriodoInvalido periodo={periodo} />

  return (
    <section className="indicadores" aria-label="Indicadores por carrera">
      <nav className="indicadores__migas" aria-label="Ruta de navegación">
        <ol>
          <li>
            <Link to={volverIndicadores}>Indicadores</Link>
          </li>
          <li>
            <Link to={volverUniversidad}>
              {datos ? datos.universidad.nombre : 'Universidad'}
            </Link>
          </li>
          <li aria-current="page">
            {datos ? datos.facultad.nombre : 'Facultad'}
          </li>
        </ol>
      </nav>
      <SelectorPeriodo periodo={periodo} />
      {datos === undefined ? (
        <Cargando texto="Cargando carreras…" />
      ) : datos === null ? (
        status === 404 ? (
          <div role="alert">
            <p>La facultad no existe.</p>
            <Link className="estado__boton" to={volverUniversidad}>
              Volver a la universidad
            </Link>
          </div>
        ) : (
          <ErrorEstado
            mensaje="No pudimos cargar las carreras."
            onReintentar={recargar}
          />
        )
      ) : datos.carreras.length === 0 ? (
        <p className="indicadores__alcance">Esta facultad no tiene carreras.</p>
      ) : (
        <ul className="indicadores__lista" aria-label="Carreras">
          {datos.carreras.map((carrera) => (
            <li key={carrera.id} className="indicadores__facultad">
              <article aria-label={carrera.nombre}>
                <h3 className="indicadores__subtitulo">{carrera.nombre}</h3>
                <ul className="indicadores__tarjetas" aria-label="Indicadores">
                  <Tarjeta
                    titulo="Tasa de aprobación"
                    valor={carrera.aprobacion.valor}
                    unidad="%"
                    decimales={1}
                    detalle={`${plural(carrera.aprobacion.aprobados, 'aprobado')} de ${plural(carrera.aprobacion.evaluados, 'alumno')} con nota final`}
                  />
                  <Tarjeta
                    titulo="Promedio"
                    valor={carrera.promedio.valor}
                    unidad=""
                    decimales={2}
                    detalle={`${plural(carrera.promedio.alumnos, 'alumno')} con nota final`}
                  />
                  <Tarjeta
                    titulo="Asistencia"
                    valor={carrera.asistencia.valor}
                    unidad="%"
                    decimales={2}
                    detalle={`${carrera.asistencia.presentes} presentes de ${plural(carrera.asistencia.registros, 'registro')}`}
                  />
                </ul>
              </article>
            </li>
          ))}
        </ul>
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
