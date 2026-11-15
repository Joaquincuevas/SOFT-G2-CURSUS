import type {
  DistribucionNotas,
  MetricasCarrera,
  MetricasConsolidadas,
  MetricasFacultad,
  MetricasUniversidad,
  ResumenUniversidad,
} from '@cursus/shared'
import { ArrowDown, ArrowUp, ArrowUpDown, Building2 } from 'lucide-react'
import { useState } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from 'react-router'
import {
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  PageHeader,
  type Columna,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CargandoEsqueleto,
  Migas,
  NoEncontrado,
  PeriodoInvalido,
  ResumenEnLinea,
  SelectorPeriodo,
  TresIndicadores,
} from './indicadores-comunes'
import {
  ENLACE,
  plural,
  usePeriodoDeLaUrl,
  valorIndicador,
} from './indicadores-formato'
import { useDatos } from './useDatos'

const CONTENEDOR = 'grid min-w-0 gap-6'
const SUBTITULO = 'm-0 text-lg font-semibold text-foreground'

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
    <section className={CONTENEDOR} aria-label="Indicadores consolidados">
      <PageHeader
        titulo="Indicadores"
        descripcion="Aprobación, promedio y asistencia consolidados entre universidades."
        acciones={
          <Button asChild variant="outline">
            <Link to={`/indicadores/comparar${sufijo}`}>
              Comparar universidades
            </Link>
          </Button>
        }
      />
      <SelectorPeriodo periodo={periodo} />
      {metricas === undefined ? (
        <CargandoEsqueleto texto="Cargando indicadores…" tarjetas={3} />
      ) : metricas === null ? (
        <ErrorState
          mensaje="No pudimos cargar los indicadores."
          onReintentar={recargar}
        />
      ) : (
        <>
          <TresIndicadores datos={metricas} />
          <p className="m-0 text-sm text-muted-foreground">
            {`${plural(metricas.alumnos, 'alumno')} inscritos en ${plural(metricas.cursos, 'curso')} del período ${periodo ?? 'activo'}.`}
          </p>
        </>
      )}
      <ListaUniversidades consulta={consulta} sufijo={sufijo} />
    </section>
  )
}

// Primer nivel del drill-down: cada universidad con sus indicadores; al hacer
// clic se abren sus facultades.
export function ListaUniversidades({
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
    <section className="grid gap-3" aria-label="Universidades">
      <h2 className={SUBTITULO}>Universidades</h2>
      {universidades === undefined ? (
        <CargandoEsqueleto texto="Cargando universidades…" filas={2} />
      ) : universidades === null ? (
        <ErrorState
          mensaje="No pudimos cargar las universidades."
          onReintentar={recargar}
        />
      ) : universidades.length === 0 ? (
        <Card className="py-0">
          <EmptyState icono={Building2} mensaje="No hay universidades." />
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <ul className="m-0 list-none divide-y divide-border p-0">
            {universidades.map((u) => (
              <li
                key={u.id}
                className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-center sm:gap-6"
              >
                <Link
                  className={`${ENLACE} w-fit`}
                  to={`/indicadores/universidades/${u.id}${sufijo}`}
                >
                  {u.nombre}
                </Link>
                <ResumenEnLinea indicadores={u} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
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
        path="universidades/:id/facultades/:facultadId/carreras/:carreraId"
        element={<CursosCarrera />}
      />
      <Route
        path="universidades/:id/facultades/:facultadId/carreras/:carreraId/cursos/:cursoId"
        element={<DistribucionCurso />}
      />
      <Route
        path="universidades/:id/facultades/:facultadId"
        element={<CarrerasFacultad />}
      />
      <Route path="universidades/:id" element={<FacultadesUniversidad />} />
      <Route path="*" element={<Navigate to="/indicadores" replace />} />
    </Routes>
  )
}

// Una facultad o carrera con sus tres indicadores, como tarjeta con título
// enlazado al nivel siguiente.
function ElementoConIndicadores({
  nombre,
  a,
  datos,
  alcance,
  aprobadosEnPlural,
}: {
  nombre: string
  a: string
  datos: Parameters<typeof TresIndicadores>[0]['datos']
  alcance?: string
  aprobadosEnPlural?: boolean
}) {
  return (
    <li>
      <Card className="gap-4 py-5">
        <article aria-label={nombre} className="grid gap-4 px-5">
          <h3 className="m-0 text-base font-semibold">
            <Link className={ENLACE} to={a}>
              {nombre}
            </Link>
          </h3>
          <TresIndicadores
            datos={datos}
            aprobadosEnPlural={aprobadosEnPlural}
          />
          {alcance && (
            <p className="m-0 text-sm text-muted-foreground">{alcance}</p>
          )}
        </article>
      </Card>
    </li>
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
    <section className={CONTENEDOR} aria-label="Indicadores por facultad">
      <Migas
        pasos={[
          { texto: 'Indicadores', a: volver },
          { texto: datos ? datos.universidad.nombre : 'Universidad' },
        ]}
      />
      <SelectorPeriodo periodo={periodo} />
      {datos === undefined ? (
        <CargandoEsqueleto texto="Cargando facultades…" filas={2} />
      ) : datos === null ? (
        status === 404 || status === 400 ? (
          <NoEncontrado
            mensaje="La universidad no existe."
            volverA={volver}
            textoVolver="Volver a Indicadores"
          />
        ) : (
          <ErrorState
            mensaje="No pudimos cargar las facultades."
            onReintentar={recargar}
          />
        )
      ) : datos.facultades.length === 0 ? (
        <Card className="py-0">
          <EmptyState mensaje="Esta universidad no tiene facultades." />
        </Card>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0" aria-label="Facultades">
          {datos.facultades.map((f) => (
            <ElementoConIndicadores
              key={f.id}
              nombre={f.nombre}
              a={`/indicadores/universidades/${id}/facultades/${f.id}${sufijo}`}
              datos={f}
              alcance={`${plural(f.alumnos, 'alumno')} inscritos en ${plural(f.cursos, 'curso')}.`}
            />
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
  const { unidad, decimales } = INDICADORES[indicador]
  return valorIndicador(valor, decimales, unidad)
}

const nombreDelPeriodo = (periodo: ResumenUniversidad['periodo']) =>
  periodo ? `${periodo.anio}-${periodo.semestre}` : 'Sin período'

const CLAVES = Object.keys(INDICADORES) as IndicadorComparado[]

const COLUMNAS_COMPARACION: readonly Columna<ResumenUniversidad>[] = [
  {
    clave: 'universidad',
    encabezado: 'Universidad',
    celda: (u) => <span className="font-medium">{u.nombre}</span>,
    valor: (u) => u.nombre,
  },
  {
    clave: 'periodo',
    encabezado: 'Período',
    celda: (u) => nombreDelPeriodo(u.periodo),
  },
  ...CLAVES.map((clave): Columna<ResumenUniversidad> => ({
    clave,
    encabezado: INDICADORES[clave].titulo,
    celda: (u) => formatear(clave, u[clave].valor),
    valor: (u) => u[clave].valor,
  })),
  {
    clave: 'alumnos',
    encabezado: 'Alumnos',
    celda: (u) => u.alumnos,
    valor: (u) => u.alumnos,
  },
]

function CompararUniversidades() {
  const { periodo, valido, consulta, sufijo } = usePeriodoDeLaUrl()
  const [universidades, recargar] = useDatos<ResumenUniversidad[]>(
    valido ? `/api/metricas/universidades${consulta}` : null,
  )
  const [graficado, fijarGraficado] = useState<IndicadorComparado>('aprobacion')
  if (!valido) return <PeriodoInvalido periodo={periodo} />

  return (
    <section
      className={CONTENEDOR}
      aria-label="Comparación entre universidades"
    >
      <Migas
        pasos={[
          { texto: 'Indicadores', a: `/indicadores${sufijo}` },
          { texto: 'Comparar universidades' },
        ]}
      />
      <SelectorPeriodo periodo={periodo} />
      {universidades === undefined ? (
        <CargandoEsqueleto texto="Cargando universidades…" filas={3} />
      ) : universidades === null ? (
        <ErrorState
          mensaje="No pudimos cargar las universidades."
          onReintentar={recargar}
        />
      ) : universidades.length === 0 ? (
        <Card className="py-0">
          <EmptyState icono={Building2} mensaje="No hay universidades." />
        </Card>
      ) : (
        <Tabs defaultValue="tabla">
          <TabsList>
            <TabsTrigger value="tabla">Tabla</TabsTrigger>
            <TabsTrigger value="grafico">Gráfico</TabsTrigger>
          </TabsList>
          <TabsContent value="tabla" className="mt-2">
            <DataTable
              etiqueta="Indicadores por universidad"
              columnas={COLUMNAS_COMPARACION}
              filas={universidades}
              claveFila={(u) => u.id}
            />
          </TabsContent>
          <TabsContent value="grafico" className="mt-2">
            <Card
              className="@container gap-4 px-5 py-5"
              aria-label="Gráfico comparativo"
              role="region"
            >
              <FormField etiqueta="Indicador a graficar" className="max-w-sm">
                {(control) => (
                  <NativeSelect
                    {...control}
                    className="h-10 text-base md:text-sm"
                    value={graficado}
                    onChange={(e) =>
                      fijarGraficado(e.target.value as IndicadorComparado)
                    }
                  >
                    {CLAVES.map((clave) => (
                      <option key={clave} value={clave}>
                        {INDICADORES[clave].titulo}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <ul
                className="m-0 grid list-none gap-3 p-0"
                aria-label={`${INDICADORES[graficado].titulo} por universidad`}
              >
                {universidades.map((u) => (
                  <BarraUniversidad
                    key={u.id}
                    nombre={u.nombre}
                    indicador={graficado}
                    valor={u[graficado].valor}
                  />
                ))}
              </ul>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </section>
  )
}

// En pantallas angostas, nombre y valor van en una fila y la barra debajo, a
// todo el ancho. Con espacio suficiente, las tres partes van en una fila, con
// la columna del valor fija para que todas las barras tengan el mismo largo.
// Se mide el ancho del gráfico (no el de la ventana) porque el menú lateral
// también lo reduce.
function BarraUniversidad({
  nombre,
  indicador,
  valor,
}: {
  nombre: string
  indicador: IndicadorComparado
  valor: number | null
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm @xl:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)_10rem] @xl:gap-y-0">
      <span className="min-w-0 [overflow-wrap:anywhere]">{nombre}</span>
      <span
        aria-hidden
        className="order-last col-span-2 h-4 overflow-hidden rounded-full bg-muted @xl:order-none @xl:col-span-1"
      >
        {valor !== null && (
          <span
            data-slot="barra-relleno"
            className="block h-full rounded-full bg-primary"
            style={{
              width: `${(proporcion(indicador, valor) * 100).toFixed(2)}%`,
            }}
          />
        )}
      </span>
      <span
        className={
          valor === null
            ? 'text-right text-muted-foreground'
            : 'text-right font-semibold whitespace-nowrap'
        }
      >
        {formatear(indicador, valor)}
      </span>
    </li>
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
    <section className={CONTENEDOR} aria-label="Indicadores por carrera">
      <Migas
        pasos={[
          { texto: 'Indicadores', a: volverIndicadores },
          {
            texto: datos ? datos.universidad.nombre : 'Universidad',
            a: volverUniversidad,
          },
          { texto: datos ? datos.facultad.nombre : 'Facultad' },
        ]}
      />
      <SelectorPeriodo periodo={periodo} />
      {datos === undefined ? (
        <CargandoEsqueleto texto="Cargando carreras…" filas={2} />
      ) : datos === null ? (
        status === 404 ? (
          <NoEncontrado
            mensaje="La facultad no existe."
            volverA={volverUniversidad}
            textoVolver="Volver a la universidad"
          />
        ) : (
          <ErrorState
            mensaje="No pudimos cargar las carreras."
            onReintentar={recargar}
          />
        )
      ) : datos.carreras.length === 0 ? (
        <Card className="py-0">
          <EmptyState mensaje="Esta facultad no tiene carreras." />
        </Card>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0" aria-label="Carreras">
          {datos.carreras.map((carrera) => (
            <ElementoConIndicadores
              key={carrera.id}
              nombre={carrera.nombre}
              a={`/indicadores/universidades/${id}/facultades/${facultadId}/carreras/${carrera.id}${sufijo}`}
              datos={carrera}
              aprobadosEnPlural
            />
          ))}
        </ul>
      )}
    </section>
  )
}

type OrdenCurso = 'aprobacion' | 'promedio' | 'asistencia'
type DireccionOrden = 'asc' | 'desc'

function CursosCarrera() {
  const { id, facultadId, carreraId } = useParams()
  const { periodo, valido, consulta, sufijo } = usePeriodoDeLaUrl()
  const [params, fijarParams] = useSearchParams()
  const orden = params.get('orden') as OrdenCurso | null
  const direccion = params.get('direccion') as DireccionOrden | null
  const ordenValido = ['aprobacion', 'promedio', 'asistencia'].includes(
    orden ?? '',
  )
    ? orden
    : null
  const direccionValida = direccion === 'desc' ? 'desc' : 'asc'
  const [datos, recargar, status] = useDatos<MetricasCarrera>(
    valido ? `/api/metricas/carreras/${carreraId}/cursos${consulta}` : null,
  )
  // La universidad de la API manda sobre la de la URL (un enlace directo puede
  // traer otra); mientras no cargue, vale la de la URL.
  const universidadId = datos?.universidad.id ?? id
  const universidadRuta = `/indicadores/universidades/${universidadId}${sufijo}`
  // También la facultad de la API manda sobre la de la URL; el id de la URL es
  // el respaldo mientras no carga.
  const facultadRutaId = datos?.facultad.id ?? facultadId
  const facultadRuta = `/indicadores/universidades/${universidadId}/facultades/${facultadRutaId}${sufijo}`
  const volverIndicadores = `/indicadores${sufijo}`
  const cambiarOrden = (nuevo: OrdenCurso) => {
    const siguiente = new URLSearchParams(params)
    siguiente.set('orden', nuevo)
    siguiente.set(
      'direccion',
      ordenValido === nuevo && direccionValida === 'asc' ? 'desc' : 'asc',
    )
    fijarParams(siguiente)
  }
  if (!valido) return <PeriodoInvalido periodo={periodo} />

  const cursos = datos
    ? [...datos.cursos].sort((a, b) =>
        comparaCursos(a, b, ordenValido, direccionValida),
      )
    : []
  return (
    <section className={CONTENEDOR} aria-label="Indicadores por curso">
      <Migas
        pasos={[
          { texto: 'Indicadores', a: volverIndicadores },
          {
            texto: datos?.universidad.nombre ?? 'Universidad',
            a: universidadRuta,
          },
          { texto: datos?.facultad.nombre ?? 'Facultad', a: facultadRuta },
          { texto: datos?.carrera.nombre ?? 'Carrera' },
        ]}
      />
      <SelectorPeriodo periodo={periodo} />
      {datos === undefined ? (
        <CargandoEsqueleto texto="Cargando cursos…" filas={4} />
      ) : datos === null ? (
        status === 404 ? (
          <NoEncontrado
            mensaje="La carrera no existe."
            volverA={facultadRuta}
            textoVolver="Volver a la facultad"
          />
        ) : (
          <ErrorState
            mensaje="No pudimos cargar los cursos."
            onReintentar={recargar}
          />
        )
      ) : datos.cursos.length === 0 ? (
        <Card className="py-0">
          <EmptyState mensaje="Esta carrera no tiene cursos." />
        </Card>
      ) : (
        <TablaCursos
          cursos={cursos}
          universidadId={universidadId}
          facultadId={facultadId}
          carreraId={carreraId}
          sufijo={sufijo}
          orden={ordenValido}
          direccion={direccionValida}
          cambiarOrden={cambiarOrden}
        />
      )}
    </section>
  )
}

function comparaCursos(
  a: MetricasCarrera['cursos'][number],
  b: MetricasCarrera['cursos'][number],
  orden: OrdenCurso | null,
  direccion: DireccionOrden,
) {
  if (!orden)
    return a.codigo.localeCompare(b.codigo, 'es') || a.id.localeCompare(b.id)
  const va = a[orden].valor
  const vb = b[orden].valor
  if (va === null) return vb === null ? 0 : 1
  if (vb === null) return -1
  return (va - vb) * (direccion === 'desc' ? -1 : 1)
}

function DistribucionCurso() {
  const { id, facultadId, carreraId, cursoId } = useParams()
  const { periodo, valido, sufijo } = usePeriodoDeLaUrl()
  const [datos, recargar, status] = useDatos<DistribucionNotas>(
    valido ? `/api/metricas/cursos/${cursoId}/distribucion` : null,
  )
  // Los ids de la API mandan sobre los de la URL (un enlace directo puede
  // combinar una facultad o una carrera que no son las del curso); los de la
  // URL son el respaldo mientras no carga.
  const universidadId = datos?.universidad.id ?? id
  const facultadRutaId = datos?.facultad.id ?? facultadId
  const carreraRutaId = datos?.carrera.id ?? carreraId
  const facultadRuta = `/indicadores/universidades/${universidadId}/facultades/${facultadRutaId}${sufijo}`
  const carreraRuta = `/indicadores/universidades/${universidadId}/facultades/${facultadRutaId}/carreras/${carreraRutaId}${sufijo}`
  const volverIndicadores = `/indicadores${sufijo}`
  if (!valido) return <PeriodoInvalido periodo={periodo} />
  return (
    <section className={CONTENEDOR} aria-label="Distribución de notas">
      <Migas
        pasos={[
          { texto: 'Indicadores', a: volverIndicadores },
          {
            texto: datos?.universidad.nombre ?? 'Universidad',
            a: `/indicadores/universidades/${universidadId}${sufijo}`,
          },
          { texto: datos?.facultad.nombre ?? 'Facultad', a: facultadRuta },
          { texto: datos?.carrera.nombre ?? 'Carrera', a: carreraRuta },
          { texto: datos?.curso.codigo ?? 'Curso' },
        ]}
      />
      {datos === undefined ? (
        <CargandoEsqueleto texto="Cargando distribución…" tarjetas={1} />
      ) : datos === null ? (
        status === 404 ? (
          <NoEncontrado
            mensaje="El curso no existe."
            volverA={carreraRuta}
            textoVolver="Volver a la carrera"
          />
        ) : (
          <ErrorState
            mensaje="No pudimos cargar la distribución."
            onReintentar={recargar}
          />
        )
      ) : datos.totalEvaluados === 0 ? (
        <Card className="py-0">
          <EmptyState mensaje="Sin notas finales para este curso" />
        </Card>
      ) : (
        <DistribucionNotasVista datos={datos} />
      )}
    </section>
  )
}

const etiquetaNota = (nota: number) => nota.toFixed(1).replace('.', ',')

function etiquetaRango(minimo: number, maximo: number) {
  return `${etiquetaNota(minimo)}–${etiquetaNota(maximo)}`
}

// MET-07: histograma y tabla equivalente para quien no ve el gráfico. Las seis
// columnas se encogen (minmax(0, 1fr)) y los rótulos pueden partirse tras el
// guion, así que el gráfico cabe desde 320 px sin desbordarse. Se mide el
// ancho del gráfico (no el de la ventana) porque el menú lateral también lo
// reduce.
function DistribucionNotasVista({ datos }: { datos: DistribucionNotas }) {
  const maximo = Math.max(...datos.rangos.map((r) => r.alumnos), 1)
  const aprobacion = etiquetaNota(datos.notaMinimaAprobacion)
  const descripcion = datos.rangos
    .map((r) => `${etiquetaRango(r.minimo, r.maximo)}: ${r.alumnos} alumnos`)
    .join('; ')
  return (
    <>
      <PageHeader
        titulo={`${datos.curso.codigo}: ${datos.curso.nombre}`}
        descripcion={`${datos.totalEvaluados} alumnos evaluados · aprobación desde ${aprobacion}`}
      />
      <Card
        className="@container p-3"
        role="img"
        aria-label={`Distribución de notas: ${descripcion}. La aprobación comienza en ${aprobacion}.`}
      >
        <div className="relative grid min-h-56 grid-cols-6 items-end gap-1 border-b border-border pt-7 @md:gap-2 @md:px-2">
          {datos.rangos.map((r) => (
            <div
              className="grid h-full min-w-0 grid-rows-[1.5rem_1fr_auto] items-end gap-1 text-center text-[0.6875rem] @md:text-xs"
              key={r.minimo}
            >
              <span className="font-bold text-foreground">{r.alumnos}</span>
              <div
                data-slot="histograma-barra"
                className="min-h-0.5 w-full rounded-t-sm bg-primary"
                style={{ height: `${(r.alumnos / maximo) * 100}%` }}
              />
              {/* El rótulo puede partirse tras el guion en pantallas
                  angostas; el texto sigue siendo «1,0–1,9». */}
              <span className="leading-tight [overflow-wrap:anywhere] text-muted-foreground">
                {etiquetaNota(r.minimo)}–<wbr />
                {etiquetaNota(r.maximo)}
              </span>
            </div>
          ))}
          {/* La línea de aprobación cae en el centro del gráfico: entre la
              tercera y la cuarta columna, que es donde empieza 4,0. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-2 bottom-6 left-1/2 -translate-x-px border-l-2 border-dashed border-destructive"
          >
            <span className="absolute -top-2 left-1.5 w-max text-[0.6875rem] font-semibold text-destructive @md:text-xs">
              Aprobación {aprobacion}
            </span>
          </div>
        </div>
      </Card>
      <Card className="gap-0 py-0">
        <Table>
          <caption className="sr-only">
            Tabla equivalente de distribución de notas
          </caption>
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead>Rango</TableHead>
              <TableHead>Alumnos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {datos.rangos.map((r) => (
              <TableRow key={r.minimo}>
                <TableHead scope="row" className="font-medium text-foreground">
                  {etiquetaRango(r.minimo, r.maximo)}
                </TableHead>
                <TableCell>{r.alumnos}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}

function TablaCursos({
  cursos,
  universidadId,
  facultadId,
  carreraId,
  sufijo,
  orden,
  direccion,
  cambiarOrden,
}: {
  cursos: MetricasCarrera['cursos']
  universidadId: string | undefined
  facultadId: string | undefined
  carreraId: string | undefined
  sufijo: string
  orden: OrdenCurso | null
  direccion: DireccionOrden
  cambiarOrden: (orden: OrdenCurso) => void
}) {
  const columna = (clave: OrdenCurso, nombre: string) => {
    const activa = orden === clave
    const Icono = !activa
      ? ArrowUpDown
      : direccion === 'asc'
        ? ArrowUp
        : ArrowDown
    return (
      <TableHead
        aria-sort={
          activa ? (direccion === 'asc' ? 'ascending' : 'descending') : 'none'
        }
      >
        <button
          type="button"
          data-slot="orden-columna"
          onClick={() => cambiarOrden(clave)}
          aria-label={`Ordenar por ${nombre}`}
          className="-mx-1 inline-flex items-center gap-1.5 rounded-sm px-1 font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {nombre}
          <Icono
            aria-hidden="true"
            className={activa ? 'size-3.5' : 'size-3.5 text-muted-foreground'}
          />
        </button>
      </TableHead>
    )
  }
  return (
    <Card className="min-w-0 gap-0 py-0">
      <Table>
        <caption className="sr-only">Cursos de la carrera</caption>
        <TableHeader className="bg-muted/60">
          <TableRow>
            <TableHead>Curso</TableHead>
            {columna('aprobacion', 'Aprobación')}
            {columna('promedio', 'Promedio')}
            {columna('asistencia', 'Asistencia')}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cursos.map((curso) => (
            <TableRow key={curso.id}>
              <TableHead
                scope="row"
                className="min-w-40 font-normal whitespace-normal text-foreground"
              >
                <Link
                  className={ENLACE}
                  to={`/indicadores/universidades/${universidadId}/facultades/${facultadId}/carreras/${carreraId}/cursos/${curso.id}${sufijo}`}
                >
                  <span className="font-semibold">{curso.codigo}</span>{' '}
                  {curso.nombre}
                </Link>
              </TableHead>
              <TableCell>
                {valorIndicador(curso.aprobacion.valor, 1, '%')}
              </TableCell>
              <TableCell>{valorIndicador(curso.promedio.valor, 2)}</TableCell>
              <TableCell>
                {valorIndicador(curso.asistencia.valor, 2, '%')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
