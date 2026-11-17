import type { SeccionResumen } from '@cursus/shared'
import { Users } from 'lucide-react'
import { EmptyState } from '@/components/shared'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { iniciales } from '../layout/iniciales'
import { nombresProfesores } from './misSecciones'

// «Académicos»: el equipo docente de la sección (profesores y ayudantes), en
// solo lectura. Lo ven el alumno y el ayudante; el profesor tiene
// «Integrantes», que suma la nómina de alumnos. El resumen de la sección
// trae solo nombres: no hay correo que mostrar.
export function AcademicosSeccion({ seccion }: { seccion: SeccionResumen }) {
  const profesores = nombresProfesores(seccion)
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="m-0 text-lg font-semibold text-foreground">
          Académicos
        </h3>
        <p className="m-0 text-sm text-muted-foreground">
          Equipo docente de la sección.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <GrupoDocente
          titulo={profesores.length > 1 ? 'Profesores' : 'Profesor'}
          rol="Profesor"
          nombres={profesores}
          vacio="Sin profesor asignado"
        />
        <GrupoDocente
          titulo="Ayudantes"
          rol="Ayudante"
          nombres={seccion.ayudantes.map(({ nombre }) => nombre)}
          vacio="Sin ayudantes asignados"
        />
      </div>
    </div>
  )
}

function GrupoDocente({
  titulo,
  rol,
  nombres,
  vacio,
}: {
  titulo: string
  rol: string
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
          <ul className="m-0 grid list-none gap-3 p-0">
            {nombres.map((nombre, posicion) => (
              <li
                key={`${nombre}-${posicion}`}
                className="flex min-w-0 items-center gap-3"
              >
                <Avatar className="size-9">
                  <AvatarFallback
                    aria-hidden="true"
                    className="bg-primary/10 text-xs font-semibold text-primary"
                  >
                    {iniciales(nombre)}
                  </AvatarFallback>
                </Avatar>
                <span className="grid min-w-0">
                  <span className="text-sm font-medium break-words text-foreground">
                    {nombre}
                  </span>
                  <span className="text-xs text-muted-foreground">{rol}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
