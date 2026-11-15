import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useEtiquetaDeMiga, useMigaActual } from '../../layout/migas-contexto'

interface Props {
  titulo: string
  descripcion?: ReactNode
  // Botones o enlaces de la página, a la derecha del título.
  acciones?: ReactNode
  // Nombre de esta página en el breadcrumb del encabezado, para las páginas
  // cuyo nombre solo ellas conocen (por ejemplo, «ICC101 · Sección 1»).
  miga?: string
  className?: string
}

const normalizar = (texto: string) =>
  texto.trim().replace(/\s+/g, ' ').toLowerCase()

function RegistrarMiga({ etiqueta }: { etiqueta: string }) {
  useEtiquetaDeMiga(etiqueta)
  return null
}

// Encabezado de una página: título, descripción y acciones. El h1 de cada
// página ya está en el encabezado de la app (es el último paso del
// breadcrumb), así que el título va como h2 y, si repite ese paso, no se
// dibuja: quedan la descripción y las acciones.
export function PageHeader({
  titulo,
  descripcion,
  acciones,
  miga,
  className,
}: Props) {
  const actual = useMigaActual()
  const repiteElEncabezado =
    actual !== null && normalizar(actual) === normalizar(titulo)
  const hayTitulo = !repiteElEncabezado
  const hayContenido = hayTitulo || Boolean(descripcion) || Boolean(acciones)

  return (
    <>
      {miga && <RegistrarMiga etiqueta={miga} />}
      {hayContenido && (
        <div
          data-slot="page-header"
          className={cn(
            'flex flex-wrap items-start justify-between gap-x-4 gap-y-3',
            className,
          )}
        >
          <div className="grid min-w-0 gap-1">
            {hayTitulo && (
              <h2 className="m-0 text-2xl leading-8 font-bold tracking-tight text-foreground">
                {titulo}
              </h2>
            )}
            {descripcion && (
              <p className="m-0 text-sm text-muted-foreground">{descripcion}</p>
            )}
          </div>
          {acciones && (
            <div className="flex flex-wrap items-center gap-2">{acciones}</div>
          )}
        </div>
      )}
    </>
  )
}
