import type { ResumenUniversidad } from '@cursus/shared'
import { Building2 } from 'lucide-react'
import { EmptyState, ErrorState, PageHeader } from '@/components/shared'
import { Card } from '@/components/ui/card'
import { PeriodoInvalido, SelectorPeriodo } from './indicadores-comunes'
import { usePeriodoDeLaUrl } from './indicadores-formato'
import { TablaUniversidades } from './TablaUniversidades'
import { useDatos } from './useDatos'

// Universidades del Directorio con sus indicadores del período (el activo de
// cada una, o el de ?periodo=AAAA-S). Usa la consulta que ya usan el Dashboard
// y la comparación (MET-02/MET-04); el nombre lleva al detalle en Indicadores.
export function Universidades() {
  const { periodo, valido, consulta, sufijo } = usePeriodoDeLaUrl()
  const [universidades, recargar] = useDatos<ResumenUniversidad[]>(
    valido ? `/api/metricas/universidades${consulta}` : null,
  )
  if (!valido) return <PeriodoInvalido periodo={periodo} />
  const lista = Array.isArray(universidades) ? universidades : null

  return (
    <section className="grid min-w-0 gap-6" aria-label="Universidades">
      <PageHeader
        titulo="Universidades"
        descripcion="Aprobación, promedio, asistencia y alumnos de cada universidad del Directorio."
      />
      <SelectorPeriodo periodo={periodo} />
      {universidades !== undefined && lista === null ? (
        <ErrorState
          mensaje="No pudimos cargar las universidades."
          onReintentar={recargar}
        />
      ) : lista?.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icono={Building2}
            mensaje="No hay universidades en el Directorio."
          />
        </Card>
      ) : (
        <TablaUniversidades
          universidades={lista ?? []}
          sufijo={sufijo}
          conAlumnos
          cargando={universidades === undefined}
        />
      )}
    </section>
  )
}
