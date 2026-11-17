import type { CrearPeriodo, Periodo } from '@cursus/shared'
import { CalendarRange, Plus } from 'lucide-react'
import { useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useAuth } from '../auth/auth'
import { useSession } from '../session/session'
import { useDatos } from './useDatos'

const fecha = (valor: string) => valor.split('-').reverse().join('/')
const nombrePeriodo = (p: Periodo) => `${p.anio}-${p.semestre}`
// El activo primero, y luego el más reciente.
const claveOrden = (p: Periodo) =>
  p.anio * 10 + p.semestre + (p.activo ? 1e6 : 0)

// «Nuevo período» abre un diálogo; «Activar» cambia el período activo desde la
// fila. Tras guardar se vuelve a pedir el listado.
export function Periodos() {
  const { fetchConSesion } = useAuth()
  const { actualizarPeriodoActivo } = useSession()
  const [periodos, recargar] = useDatos<Periodo[]>('/api/periodos')
  const [creando, setCreando] = useState(false)
  const [activando, setActivando] = useState<string | null>(null)

  async function activar(p: Periodo) {
    setActivando(p.id)
    try {
      const res = await fetchConSesion(`/api/periodos/${p.id}/activar`, {
        method: 'PATCH',
      })
      if (!res.ok) {
        toast.error(
          res.status === 404
            ? 'El período ya no está disponible. Actualiza el listado.'
            : 'No pudimos activar el período. Inténtalo nuevamente.',
        )
        return
      }
      const activo = (await res.json()) as Periodo
      actualizarPeriodoActivo({
        id: activo.id,
        anio: activo.anio,
        semestre: activo.semestre,
      })
      toast.success('Período activo actualizado')
      recargar()
    } catch {
      toast.error('No pudimos activar el período. Comprueba tu conexión.')
    } finally {
      setActivando(null)
    }
  }

  const columnas: Columna<Periodo>[] = [
    {
      clave: 'periodo',
      encabezado: 'Período',
      valor: claveOrden,
      celda: (p) => <span className="font-medium">{nombrePeriodo(p)}</span>,
    },
    {
      clave: 'inicio',
      encabezado: 'Inicio',
      valor: (p) => p.fechaInicio,
      celda: (p) => (
        <span className="tabular-nums">{fecha(p.fechaInicio)}</span>
      ),
    },
    {
      clave: 'termino',
      encabezado: 'Término',
      valor: (p) => p.fechaTermino,
      celda: (p) => (
        <span className="tabular-nums">{fecha(p.fechaTermino)}</span>
      ),
    },
    {
      clave: 'estado',
      encabezado: 'Estado',
      valor: (p) => Number(p.activo),
      celda: (p) =>
        p.activo ? (
          <Badge>Activo</Badge>
        ) : (
          <Badge variant="secondary">Inactivo</Badge>
        ),
    },
    {
      clave: 'acciones',
      encabezado: <span className="sr-only">Acciones</span>,
      className: 'w-px text-right',
      celda: (p) =>
        p.activo ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={activando !== null}
            aria-label={`Activar período ${nombrePeriodo(p)}`}
            onClick={() => void activar(p)}
          >
            Activar
          </Button>
        ),
    },
  ]

  return (
    <section aria-label="Gestión de períodos" className="grid gap-4">
      <PageHeader
        titulo="Períodos académicos"
        descripcion="Organiza los semestres y elige el período activo para toda la universidad."
        acciones={
          <Button
            type="button"
            // Mientras se activa otro, crear uno activo podría cruzar las respuestas.
            disabled={!periodos || activando !== null}
            onClick={() => setCreando(true)}
          >
            <Plus aria-hidden="true" />
            Nuevo período
          </Button>
        }
      />
      {periodos === null ? (
        <ErrorState
          mensaje="No pudimos cargar los períodos."
          onReintentar={recargar}
        />
      ) : (
        <DataTable
          etiqueta="Listado de períodos"
          columnas={columnas}
          filas={periodos ?? []}
          claveFila={(p) => p.id}
          cargando={periodos === undefined}
          textoDeCarga="Cargando períodos…"
          ordenInicial={{ clave: 'periodo', direccion: 'desc' }}
          vacio={
            <EmptyState
              icono={CalendarRange}
              titulo="Aún no hay períodos en tu universidad."
              mensaje="Crea el primero con «Nuevo período»."
            />
          }
        />
      )}
      {creando && (
        <DialogoPeriodo
          onCerrar={() => setCreando(false)}
          onGuardado={(p) => {
            if (p.activo)
              actualizarPeriodoActivo({
                id: p.id,
                anio: p.anio,
                semestre: p.semestre,
              })
            recargar()
          }}
        />
      )}
    </section>
  )
}

function DialogoPeriodo({
  onCerrar,
  onGuardado,
}: {
  onCerrar: () => void
  onGuardado: (periodo: Periodo) => void
}) {
  const { fetchConSesion } = useAuth()
  const [anio, setAnio] = useState('')
  const [semestre, setSemestre] = useState('1')
  const [inicio, setInicio] = useState('')
  const [termino, setTermino] = useState('')
  const [activo, setActivo] = useState(false)

  async function guardar(): Promise<string | null> {
    if (!anio || !inicio || !termino)
      return 'Completa el año, el semestre y las fechas.'
    if (termino <= inicio)
      return 'La fecha de término debe ser posterior a la de inicio.'
    const datos: CrearPeriodo = {
      anio: Number(anio),
      semestre: Number(semestre),
      fechaInicio: inicio,
      fechaTermino: termino,
      activo,
    }
    const res = await fetchConSesion('/api/periodos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
    if (!res.ok) {
      return res.status === 409
        ? 'Ya existe un período con ese año y semestre en tu universidad.'
        : 'No pudimos guardar el período. Revisa los datos e inténtalo nuevamente.'
    }
    toast.success('Período creado')
    onGuardado((await res.json()) as Periodo)
    return null
  }

  return (
    <FormDialog
      abierto
      onAbiertoChange={(abierto) => !abierto && onCerrar()}
      titulo="Nuevo período"
      descripcion="Solo puede haber un período activo. Al activar otro, el anterior quedará inactivo."
      textoGuardar="Crear período"
      sucio={Boolean(anio || inicio || termino || activo || semestre !== '1')}
      onGuardar={guardar}
    >
      <FormField etiqueta="Año" requerido>
        {(c) => (
          <Input
            {...c}
            type="number"
            min="1"
            max="9999"
            step="1"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
          />
        )}
      </FormField>
      <FormField etiqueta="Semestre" requerido>
        {(c) => (
          <NativeSelect
            {...c}
            className="w-full"
            value={semestre}
            onChange={(e) => setSemestre(e.target.value)}
          >
            <option value="1">1</option>
            <option value="2">2</option>
          </NativeSelect>
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField etiqueta="Fecha de inicio" requerido>
          {(c) => (
            <Input
              {...c}
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          )}
        </FormField>
        <FormField etiqueta="Fecha de término" requerido>
          {(c) => (
            <Input
              {...c}
              type="date"
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
            />
          )}
        </FormField>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="periodo-activo"
          checked={activo}
          onCheckedChange={(v) => setActivo(v === true)}
        />
        <Label htmlFor="periodo-activo">Marcar como activo</Label>
      </div>
    </FormDialog>
  )
}
