import { LARGO_NOMBRE_CARRERA, type Carrera } from '@cursus/shared'
import { Milestone, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  DataTable,
  EmptyState,
  ErrorState,
  FormDialog,
  FormField,
  PageHeader,
  type Columna,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '../auth/auth'
import { useDatos } from './useDatos'

const limpiar = (texto: string) => texto.trim().replace(/\s+/gu, ' ')

// «Nueva carrera» y «Editar» abren el mismo diálogo; la carrera editada llega
// precargada. Tras guardar se vuelve a pedir el listado.
export function Carreras() {
  const [carreras, recargar] = useDatos<Carrera[]>('/api/carreras')
  // undefined = cerrado; null = nueva carrera; una carrera = editarla.
  const [dialogo, setDialogo] = useState<Carrera | null | undefined>(undefined)

  const columnas = useMemo<Columna<Carrera>[]>(
    () => [
      {
        clave: 'nombre',
        encabezado: 'Nombre',
        valor: (c) => c.nombre,
        celda: (c) => <span className="font-medium">{c.nombre}</span>,
      },
      {
        clave: 'acciones',
        encabezado: <span className="sr-only">Acciones</span>,
        className: 'w-px text-right',
        celda: (c) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Editar ${c.nombre}`}
            onClick={() => setDialogo(c)}
          >
            Editar
          </Button>
        ),
      },
    ],
    [],
  )

  return (
    <section aria-label="Gestión de carreras" className="grid gap-4">
      <PageHeader
        titulo="Carreras"
        descripcion="Crea y actualiza las carreras de tu facultad para organizar la gestión académica."
        acciones={
          <Button
            type="button"
            disabled={!carreras}
            onClick={() => setDialogo(null)}
          >
            <Plus aria-hidden="true" />
            Nueva carrera
          </Button>
        }
      />
      {carreras === null ? (
        <ErrorState
          mensaje="No pudimos cargar las carreras."
          onReintentar={recargar}
        />
      ) : (
        <DataTable
          etiqueta="Listado de carreras"
          columnas={columnas}
          filas={carreras ?? []}
          claveFila={(c) => c.id}
          cargando={carreras === undefined}
          textoDeCarga="Cargando carreras…"
          ordenInicial={{ clave: 'nombre', direccion: 'asc' }}
          vacio={
            <EmptyState
              icono={Milestone}
              titulo="Aún no hay carreras en tu facultad."
              mensaje="Crea la primera con «Nueva carrera»."
            />
          }
        />
      )}
      {dialogo !== undefined && (
        <DialogoCarrera
          carrera={dialogo}
          onCerrar={() => setDialogo(undefined)}
          onGuardada={recargar}
        />
      )}
    </section>
  )
}

function DialogoCarrera({
  carrera,
  onCerrar,
  onGuardada,
}: {
  carrera: Carrera | null
  onCerrar: () => void
  onGuardada: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [nombre, setNombre] = useState(carrera?.nombre ?? '')
  const [vacio, setVacio] = useState(false)
  const editando = carrera !== null

  async function guardar(): Promise<string | null> {
    const nuevo = limpiar(nombre)
    if (!nuevo) {
      setVacio(true)
      return 'Ingresa el nombre de la carrera.'
    }
    const respuesta = await fetchConSesion(
      editando ? `/api/carreras/${carrera.id}` : '/api/carreras',
      {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevo }),
      },
    )
    if (!respuesta.ok) {
      return respuesta.status === 409
        ? 'Ya existe una carrera con ese nombre en tu facultad.'
        : respuesta.status === 404
          ? 'La carrera ya no está disponible. Cierra este diálogo y actualiza el listado.'
          : 'No pudimos guardar la carrera. Revisa el nombre e inténtalo nuevamente.'
    }
    toast.success(editando ? 'Cambios guardados' : 'Carrera creada')
    onGuardada()
    return null
  }

  return (
    <FormDialog
      abierto
      onAbiertoChange={(abierto) => !abierto && onCerrar()}
      titulo={editando ? 'Editar carrera' : 'Nueva carrera'}
      descripcion="La carrera se guardará en tu facultad."
      textoGuardar={editando ? 'Guardar cambios' : 'Crear carrera'}
      sucio={nombre !== (carrera?.nombre ?? '')}
      onGuardar={guardar}
    >
      <FormField
        etiqueta="Nombre de la carrera"
        requerido
        error={vacio && !limpiar(nombre) ? 'Ingresa el nombre.' : undefined}
      >
        {(control) => (
          <Input
            {...control}
            value={nombre}
            maxLength={LARGO_NOMBRE_CARRERA}
            autoComplete="off"
            onChange={(e) => setNombre(e.target.value)}
          />
        )}
      </FormField>
    </FormDialog>
  )
}
