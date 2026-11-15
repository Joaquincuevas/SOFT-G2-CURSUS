import { Building2 } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// MT-04: el superadmin sin universidad elegida no ve las vistas del
// Administrativo (la API le responde 403). En vez de redirigirlo, la vista le
// explica qué falta y lo lleva al Dashboard, donde elige.
export function AvisoElegirFacultad() {
  return (
    <section role="status" className="max-w-xl">
      <Card className="py-0">
        <EmptyState
          icono={Building2}
          titulo="Elige una universidad primero"
          mensaje="Para ver esta sección, elige en el Dashboard la universidad y la facultad en las que quieres trabajar."
          accion={
            <Button asChild>
              <Link to="/">Elegir universidad</Link>
            </Button>
          }
        />
      </Card>
    </section>
  )
}
