import {
  ChevronRight,
  CircleAlert,
  Download,
  FileText,
  Loader2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dropzone,
  EmptyState,
  ErrorState,
  FormField,
} from '@/components/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatearFecha } from '@/lib/fechas'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MAX_TAMANO_SILABO_BYTES,
  type DescargaArchivo,
  type SubidaArchivo,
  type VersionSilabo,
} from '@cursus/shared'
import { useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { subirAS3 } from './subirArchivo'
import { useDatos } from './useDatos'

// MAT-02. El historial y la descarga son de todos los integrantes; publicar
// es solo del profesor (MAT-06 abre la pestaña Material al resto).
export function AdministrarSilabo({
  ruta,
  puedePublicar,
  vistaAlumno = false,
  alPublicar,
}: {
  ruta: string
  puedePublicar: boolean
  vistaAlumno?: boolean
  alPublicar?: () => void
}) {
  const { fetchConSesion } = useAuth()
  const destino = `${ruta}/silabo`
  const [historial, recargar, , fijar] = useDatos<VersionSilabo[]>(destino)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [publicando, setPublicando] = useState(false)
  const confirmado = useRef<{ archivo: File; id: string } | null>(null)
  const enCurso = useRef(false)

  async function publicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!archivo || enCurso.current) return
    if (motivoSilabo(archivo)) {
      setError(MENSAJE_SILABO)
      return
    }
    enCurso.current = true
    setOcupado(true)
    setError('')
    try {
      if (confirmado.current?.archivo !== archivo) {
        const solicitud = await fetchConSesion(`${ruta}/archivos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: archivo.name, tamano: archivo.size }),
        })
        if (!solicitud.ok) throw new Error('No pudimos preparar la subida.')
        const subida = (await solicitud.json()) as SubidaArchivo
        await subirAS3(subida.subida, archivo, () => {})
        const confirmacion = await fetchConSesion(
          `${ruta}/archivos/${subida.archivo.id}/confirmar`,
          { method: 'POST' },
        )
        if (!confirmacion.ok) throw new Error('No pudimos confirmar el PDF.')
        confirmado.current = { archivo, id: subida.archivo.id }
      }
      const respuesta = await fetchConSesion(destino, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoId: confirmado.current.id }),
      })
      if (!respuesta.ok) {
        if (respuesta.status === 400)
          throw new Error('El archivo confirmado no es un PDF válido.')
        throw new Error('No pudimos publicar el sílabo. Inténtalo nuevamente.')
      }
      const publicada = (await respuesta.json()) as VersionSilabo
      fijar(
        [
          publicada,
          ...(historial ?? []).filter((v) => v.version !== publicada.version),
        ].sort((a, b) => b.version - a.version),
      )
      recargar()
      confirmado.current = null
      setArchivo(null)
      setPublicando(false)
      toast.success('Sílabo publicado.')
      alPublicar?.()
    } catch (falla) {
      setError(
        falla instanceof Error ? falla.message : 'No pudimos subir el PDF.',
      )
    } finally {
      enCurso.current = false
      setOcupado(false)
    }
  }

  async function descargar(version: number) {
    setError('')
    try {
      const respuesta = await fetchConSesion(`${destino}/${version}`)
      if (!respuesta.ok) throw new Error()
      const { url } = (await respuesta.json()) as DescargaArchivo
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.referrerPolicy = 'no-referrer'
      enlace.click()
    } catch {
      setError('No pudimos descargar esa versión del sílabo.')
    }
  }

  if (vistaAlumno) {
    return (
      <section aria-label="Versiones del sílabo" className="grid min-w-0 gap-3">
        <h3 className="m-0 text-base font-semibold">Versiones del sílabo</h3>
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
        {historial === undefined ? (
          <div role="status">
            <span className="sr-only">Cargando versiones del sílabo…</span>
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : historial === null ? (
          <ErrorState
            mensaje="No pudimos cargar las versiones del sílabo."
            onReintentar={recargar}
          />
        ) : historial.length === 0 ? (
          <Card className="py-0">
            <EmptyState
              icono={FileText}
              titulo="Aún no hay un sílabo publicado."
              mensaje="Aquí podrás descargarlo cuando el profesor lo publique."
            />
          </Card>
        ) : (
          <ol
            className="m-0 grid list-none gap-2 p-0"
            aria-label="Historial del sílabo"
          >
            {historial.map((v) => (
              <li key={v.version}>
                <Card className="py-3">
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4 text-sm">
                    <span className="min-w-0 break-words">
                      <strong>Versión {v.version}</strong> · {v.responsable} ·{' '}
                      <time dateTime={v.subidoEn}>
                        {fechaVersion(v.subidoEn)}
                      </time>
                    </span>
                    <Button
                      variant="outline"
                      aria-label={`Descargar versión ${v.version}`}
                      onClick={() => void descargar(v.version)}
                    >
                      Descargar PDF
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>
    )
  }

  const vigente = historial?.[0]
  const anteriores = historial?.slice(1) ?? []
  const abrirPublicar = () => {
    setError('')
    setArchivo(null)
    confirmado.current = null
    setPublicando(true)
  }

  // Una sola tarjeta: la versión vigente con sus acciones y, debajo, el
  // historial plegable.
  return (
    <section className="grid min-w-0 gap-3" aria-label="Sílabo del curso">
      <Card className="min-w-0 gap-0 py-0">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"
          >
            <FileText className="size-5" />
          </span>
          <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
            <h3 className="m-0 text-base font-semibold text-foreground">
              Sílabo del curso
            </h3>
            {historial === undefined ? (
              <div role="status">
                <span className="sr-only">Cargando versiones del sílabo…</span>
                <Skeleton className="h-4 w-48" />
              </div>
            ) : historial === null ? null : vigente ? (
              <p className="m-0 text-sm text-muted-foreground">
                Versión {vigente.version} vigente · publicada el{' '}
                <time dateTime={vigente.subidoEn}>
                  {fechaVersion(vigente.subidoEn)}
                </time>{' '}
                por {vigente.responsable}
              </p>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">
                {puedePublicar
                  ? 'Aún no hay un sílabo publicado. Sube un PDF para publicar la primera versión.'
                  : 'Aún no hay un sílabo publicado. El profesor puede publicarlo.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {vigente && (
              <Button
                type="button"
                variant="outline"
                aria-label={`Descargar versión ${vigente.version}`}
                onClick={() => void descargar(vigente.version)}
              >
                <Download aria-hidden="true" />
                Descargar
              </Button>
            )}
            {puedePublicar && historial !== undefined && historial !== null && (
              <Button type="button" onClick={abrirPublicar}>
                <Upload aria-hidden="true" />
                {vigente ? 'Subir nueva versión' : 'Subir sílabo'}
              </Button>
            )}
          </div>
        </div>
        {historial === null && (
          <div className="border-t border-border p-4">
            <ErrorState
              mensaje="No pudimos cargar las versiones del sílabo."
              onReintentar={recargar}
            />
          </div>
        )}
        {anteriores.length > 0 && (
          <Collapsible className="border-t border-border">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                data-slot="historial-silabo"
                className="group flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none focus-visible:ring-inset"
              >
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
                />
                Historial de versiones ({anteriores.length}{' '}
                {anteriores.length === 1 ? 'anterior' : 'anteriores'})
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ol
                className="m-0 grid list-none divide-y divide-border border-t border-border p-0"
                aria-label="Historial del sílabo"
              >
                {anteriores.map((v) => (
                  <li
                    key={v.version}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm"
                  >
                    <span className="min-w-0 break-words text-muted-foreground">
                      <strong className="font-medium text-foreground">
                        Versión {v.version}
                      </strong>{' '}
                      · {v.responsable} ·{' '}
                      <time dateTime={v.subidoEn}>
                        {fechaVersion(v.subidoEn)}
                      </time>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      aria-label={`Descargar versión ${v.version}`}
                      onClick={() => void descargar(v.version)}
                    >
                      <Download aria-hidden="true" />
                      Descargar
                    </Button>
                  </li>
                ))}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        )}
      </Card>
      {error && !publicando && (
        <Alert variant="danger">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {puedePublicar && (
        <Dialog
          open={publicando}
          onOpenChange={(abierto) => {
            if (!ocupado) setPublicando(abierto)
          }}
        >
          <DialogContent className="bg-card text-left sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {vigente ? 'Subir nueva versión del sílabo' : 'Subir sílabo'}
              </DialogTitle>
              <DialogDescription>
                {vigente
                  ? `Reemplaza la versión ${vigente.version}; la anterior queda en el historial.`
                  : 'Los integrantes podrán descargarlo desde el curso.'}
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid min-w-0 gap-4"
              aria-label="Cargar sílabo"
              noValidate
              onSubmit={(evento) => void publicar(evento)}
            >
              <FormField etiqueta="Sílabo (PDF, hasta 10 MiB)">
                {(control) => (
                  <Dropzone
                    {...control}
                    archivo={archivo}
                    accept="application/pdf,.pdf"
                    validar={motivoSilabo}
                    descripcion="Solo PDF, hasta 10 MiB"
                    disabled={ocupado}
                    onArchivoChange={(elegido) => {
                      confirmado.current = null
                      setArchivo(elegido)
                      setError('')
                    }}
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
                  disabled={ocupado}
                  onClick={() => setPublicando(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={!archivo || ocupado}>
                  {ocupado && (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  )}
                  {ocupado ? 'Publicando…' : 'Publicar sílabo'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </section>
  )
}

const MENSAJE_SILABO = 'Selecciona un PDF válido de hasta 10 MiB.'

// Lo mismo que se revisa al publicar, para avisar apenas se elige.
function motivoSilabo(archivo: File): string | null {
  return !archivo.name.toLowerCase().endsWith('.pdf') ||
    archivo.type !== 'application/pdf' ||
    archivo.size < 5 ||
    archivo.size > MAX_TAMANO_SILABO_BYTES
    ? MENSAJE_SILABO
    : null
}

// dd-mm-aaaa en la zona de la universidad.
function fechaVersion(fecha: string) {
  return formatearFecha(
    new Date(fecha).toLocaleDateString('en-CA', {
      timeZone: 'America/Santiago',
    }),
  )
}
