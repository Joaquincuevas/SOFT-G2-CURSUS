import type { MetricasConsolidadas } from '@cursus/shared'
import {
  ChartColumn,
  ChevronRight,
  GitCompareArrows,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { ErrorState, PageHeader } from '@/components/shared'
import { Card } from '@/components/ui/card'
import { ListaUniversidades } from './Indicadores'
import {
  CargandoEsqueleto,
  TarjetaIndicador,
  TresIndicadores,
} from './indicadores-comunes'
import { useDatos } from './useDatos'

// Dashboard del Director: el consolidado del período activo de cada
// universidad (MET-01), las universidades con sus indicadores (MET-04) y los
// accesos directos a lo que más usa. Solo consulta los endpoints de
// /api/metricas que ya existen. El Director conserva el color de CURSUS.
export function DashboardDirector() {
  const [metricas, recargar] = useDatos<MetricasConsolidadas>(
    '/api/metricas/consolidado',
  )
  // Una respuesta que no es el consolidado (por ejemplo, un `[]`) se trata como
  // un error de carga, no como datos: así la pantalla no se cae.
  const consolidado =
    metricas && Array.isArray(metricas.periodos) ? metricas : null
  const n = consolidado?.periodos.length ?? 0
  return (
    <div className="grid min-w-0 gap-8">
      <PageHeader
        titulo="Visión del Directorio"
        descripcion="Resumen del período activo de cada universidad."
      />
      <section className="grid gap-3" aria-label="Resumen consolidado">
        <h2 className="m-0 text-lg font-semibold text-foreground">
          Indicadores clave
        </h2>
        {metricas === undefined ? (
          <CargandoEsqueleto texto="Cargando indicadores…" tarjetas={3} />
        ) : consolidado === null ? (
          <ErrorState
            mensaje="No pudimos cargar los indicadores."
            onReintentar={recargar}
          />
        ) : (
          <TresIndicadores
            datos={consolidado}
            className="xl:grid-cols-5"
            extra={
              <>
                <TarjetaIndicador
                  titulo="Alumnos inscritos"
                  valor={consolidado.alumnos}
                  unidad=""
                  decimales={0}
                  detalle="En el período activo"
                />
                <TarjetaIndicador
                  titulo="Cursos"
                  valor={consolidado.cursos}
                  unidad=""
                  decimales={0}
                  detalle={`${n} ${n === 1 ? 'universidad' : 'universidades'} con período activo`}
                />
              </>
            }
          />
        )}
      </section>
      <ListaUniversidades consulta="" sufijo="" />
      <section className="grid gap-3" aria-label="Accesos directos">
        <h2 className="m-0 text-lg font-semibold text-foreground">
          Accesos directos
        </h2>
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          <Acceso
            a="/indicadores"
            icono={ChartColumn}
            titulo="Indicadores"
            descripcion="Aprobación, promedio y asistencia, hasta el detalle de cada curso."
          />
          <Acceso
            a="/indicadores/comparar"
            icono={GitCompareArrows}
            titulo="Comparar universidades"
            descripcion="Los indicadores de cada universidad, lado a lado."
          />
          <Acceso
            a="/accesos"
            icono={ScrollText}
            titulo="Registro de accesos"
            descripcion="Inicios de sesión y acciones sensibles."
          />
        </ul>
      </section>
    </div>
  )
}

function Acceso({
  a,
  icono: Icono,
  titulo,
  descripcion,
}: {
  a: string
  icono: LucideIcon
  titulo: string
  descripcion: string
}) {
  return (
    <li>
      <Link
        to={a}
        className="group block h-full rounded-xl no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="h-full flex-row items-start gap-4 p-5 transition-colors group-hover:border-primary/50 motion-reduce:transition-none">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"
          >
            <Icono className="size-5" />
          </span>
          <span className="grid min-w-0 flex-1 gap-1">
            <span className="text-base font-semibold text-foreground">
              {titulo}
            </span>
            <span className="text-sm text-muted-foreground">{descripcion}</span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="mt-2.5 size-4 shrink-0 text-muted-foreground"
          />
        </Card>
      </Link>
    </li>
  )
}
