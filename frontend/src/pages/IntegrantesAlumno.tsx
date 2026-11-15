import type { SeccionResumen } from '@cursus/shared'
import { Users } from 'lucide-react'
import { EmptyState } from '@/components/shared'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { nombresProfesores } from './misSecciones'

export function IntegrantesAlumno({ seccion }: { seccion: SeccionResumen }) {
  const profesores = nombresProfesores(seccion)
  return (
    <section className="grid gap-4" aria-label="Equipo docente">
      <h3 className="m-0 text-lg font-semibold text-foreground">
        Equipo docente
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <GrupoDocente
          titulo={profesores.length > 1 ? 'Profesores' : 'Profesor'}
          nombres={profesores}
          vacio="Sin profesor asignado"
        />
        <GrupoDocente
          titulo="Ayudantes"
          nombres={seccion.ayudantes.map(({ nombre }) => nombre)}
          vacio="Sin ayudantes asignados"
        />
      </div>
    </section>
  )
}

function GrupoDocente({
  titulo,
  nombres,
  vacio,
}: {
  titulo: string
  nombres: string[]
  vacio: string
}) {
  return (
    <Card className="min-w-0 gap-2 py-4">
      <CardHeader className="px-4">
        <h4 className="m-0 text-sm font-semibold text-foreground">{titulo}</h4>
      </CardHeader>
      <CardContent className="px-4">
        {nombres.length === 0 ? (
          <EmptyState icono={Users} mensaje={vacio} className="px-2 py-4" />
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0 text-sm break-words text-muted-foreground">
            {nombres.map((nombre, posicion) => (
              <li key={`${nombre}-${posicion}`}>{nombre}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
