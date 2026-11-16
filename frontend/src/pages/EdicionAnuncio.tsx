import {
  LARGO_CUERPO_ANUNCIO,
  LARGO_TITULO_ANUNCIO,
  type Anuncio,
  type CambioAnuncio,
  type EditarAnuncio,
} from '@cursus/shared'
import { CircleAlert, History, Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ErrorState, FormField } from '@/components/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '../auth/auth'
import { useDatos } from './useDatos'
import { fechaAnuncio } from './anuncios'

// ANU-05: el autor corrige su anuncio y consulta sus versiones anteriores.
// Las dos acciones van a la derecha de la tarjeta y abren su diálogo.
export function EdicionAnuncio({
  anuncio,
  ruta,
  recargar,
}: {
  anuncio: Anuncio
  ruta: string
  recargar: () => void
}) {
  const [dialogo, setDialogo] = useState<'editar' | 'historial' | null>(null)
  const [guardando, setGuardando] = useState(false)
  const destino = `${ruta}/${anuncio.id}`
  const cerrar = (abierto: boolean) => {
    if (!abierto && !guardando) setDialogo(null)
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setDialogo('editar')}
      >
        <Pencil aria-hidden="true" />
        Editar anuncio
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setDialogo('historial')}
      >
        <History aria-hidden="true" />
        Ver historial
      </Button>
      <Dialog open={dialogo === 'editar'} onOpenChange={cerrar}>
        <DialogContent className="bg-card text-left sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar anuncio</DialogTitle>
            <DialogDescription>
              La versión actual queda en el historial del anuncio.
            </DialogDescription>
          </DialogHeader>
          <FormularioEdicion
            anuncio={anuncio}
            ruta={destino}
            alCambiarGuardando={setGuardando}
            cancelar={() => setDialogo(null)}
            guardar={() => {
              setDialogo(null)
              toast.success('Anuncio guardado')
              recargar()
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={dialogo === 'historial'} onOpenChange={cerrar}>
        <DialogContent className="max-h-[85svh] overflow-y-auto bg-card text-left sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Historial del anuncio</DialogTitle>
            <DialogDescription>{anuncio.titulo}</DialogDescription>
          </DialogHeader>
          <HistorialAnuncio ruta={`${destino}/historial`} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FormularioEdicion({
  anuncio,
  ruta,
  cancelar,
  guardar,
  alCambiarGuardando,
}: {
  anuncio: Anuncio
  ruta: string
  cancelar: () => void
  guardar: () => void
  alCambiarGuardando: (guardando: boolean) => void
}) {
  const { fetchConSesion } = useAuth()
  const [campos, setCampos] = useState<EditarAnuncio>({
    titulo: anuncio.titulo,
    cuerpo: anuncio.cuerpo,
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando) return
    setGuardando(true)
    alCambiarGuardando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion(ruta, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos),
      })
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as {
          message?: unknown
        } | null
        const mensaje = cuerpo?.message
        setError(
          respuesta.status === 400 && typeof mensaje === 'string'
            ? mensaje
            : respuesta.status === 400 &&
                Array.isArray(mensaje) &&
                typeof mensaje[0] === 'string'
              ? mensaje[0]
              : 'No pudimos guardar el anuncio. Inténtalo nuevamente.',
        )
        return
      }
      guardar()
    } catch {
      setError(
        'No pudimos guardar el anuncio. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
      alCambiarGuardando(false)
    }
  }
  return (
    <form
      className="grid min-w-0 gap-4"
      aria-label="Editar anuncio"
      onSubmit={(event) => void enviar(event)}
    >
      <FormField etiqueta="Título del anuncio">
        {(control) => (
          <Input
            {...control}
            required
            maxLength={LARGO_TITULO_ANUNCIO}
            disabled={guardando}
            value={campos.titulo}
            onChange={(e) => setCampos({ ...campos, titulo: e.target.value })}
          />
        )}
      </FormField>
      <FormField etiqueta="Cuerpo del anuncio">
        {(control) => (
          <Textarea
            {...control}
            required
            rows={6}
            maxLength={LARGO_CUERPO_ANUNCIO}
            disabled={guardando}
            value={campos.cuerpo}
            onChange={(e) => setCampos({ ...campos, cuerpo: e.target.value })}
          />
        )}
      </FormField>
      {error && (
        <Alert variant="danger">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={guardando}
          onClick={cancelar}
        >
          Cancelar edición
        </Button>
        <Button type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function HistorialAnuncio({ ruta }: { ruta: string }) {
  const [versiones, recargar] = useDatos<CambioAnuncio[]>(ruta)
  return (
    <section aria-label="Historial del anuncio" className="grid gap-3">
      {versiones === undefined ? (
        <div role="status">
          <span className="sr-only">Cargando historial…</span>
          <Skeleton className="h-20 rounded-lg" />
        </div>
      ) : versiones === null ? (
        <ErrorState
          mensaje="No pudimos cargar el historial."
          onReintentar={recargar}
        />
      ) : !versiones.length ? (
        <p className="m-0 text-sm text-muted-foreground">
          Este anuncio aún no tiene ediciones.
        </p>
      ) : (
        <ol className="m-0 grid list-none divide-y divide-border p-0">
          {versiones.map((version, indice) => (
            <li key={version.id} className="grid gap-1 py-3 text-sm">
              <p className="m-0 font-semibold text-foreground">
                {indice === 0
                  ? 'Versión original'
                  : `Versión anterior ${indice + 1}`}
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                Reemplazada el{' '}
                <time dateTime={version.fecha}>
                  {fechaAnuncio(version.fecha)}
                </time>{' '}
                por {version.responsable.nombre}
              </p>
              <p className="m-0 font-medium break-words text-foreground">
                {version.titulo}
              </p>
              <p className="m-0 break-words whitespace-pre-wrap text-muted-foreground">
                {version.cuerpo}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
