import {
  LARGO_CUERPO_ANUNCIO,
  LARGO_TITULO_ANUNCIO,
  MAX_ANUNCIOS_LECTURA,
  type Anuncio,
  type PublicarAnuncio,
} from '@cursus/shared'
import { CircleAlert, Megaphone, Plus, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { EmptyState, ErrorState, FormField } from '@/components/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '../auth/auth'
import { iniciales } from '../layout/iniciales'
import { useSession } from '../session/session'
import { EdicionAnuncio } from './EdicionAnuncio'
import { EVENTO_LECTURA_ANUNCIOS, fechaAnuncio } from './anuncios'
import { useDatos } from './useDatos'
import type { PropsPestana } from './VistaSeccion'

// ANU-03: la API filtra los destinatarios y ordena por fecha antes de responder.
// Se conserva ese orden; no se consultan anuncios de otras secciones.
export function PestanaAnuncios({
  seccionId,
  numeroSeccion,
  rol,
}: PropsPestana) {
  const ruta = `/api/espacio/secciones/${seccionId}/anuncios`
  const [anuncios, recargar] = useDatos<Anuncio[]>(ruta)
  const { user } = useSession()
  const [publicando, setPublicando] = useState(false)
  const nuevo = rol === 'PROFESOR' && (
    <Button type="button" onClick={() => setPublicando(true)}>
      <Plus aria-hidden="true" />
      Nuevo anuncio
    </Button>
  )

  return (
    <section className="grid min-w-0 gap-4" aria-label="Anuncios del curso">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="m-0 text-lg font-semibold text-foreground">
            Anuncios del curso
          </h3>
          {rol === 'ALUMNO' && (
            <p className="m-0 text-sm text-muted-foreground">
              Anuncios de todo el curso y de tu sección, del más reciente al más
              antiguo.
            </p>
          )}
        </div>
        {nuevo}
      </div>
      {rol === 'PROFESOR' && (
        <FormularioAnuncio
          abierto={publicando}
          cambiarAbierto={setPublicando}
          ruta={ruta}
          seccionId={seccionId}
          numeroSeccion={numeroSeccion}
          alPublicar={recargar}
        />
      )}
      {rol === 'ALUMNO' && anuncios && (
        <RegistrarLectura ruta={ruta} anuncios={anuncios} />
      )}
      {anuncios === undefined ? (
        <div role="status" className="grid gap-3">
          <span className="sr-only">Cargando anuncios…</span>
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : anuncios === null ? (
        <ErrorState
          mensaje="No pudimos cargar los anuncios."
          onReintentar={recargar}
        />
      ) : anuncios.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icono={Megaphone}
            titulo="Aún no hay anuncios"
            mensaje={
              rol === 'PROFESOR'
                ? 'Publica un aviso para todo el curso o solo para tu sección.'
                : 'Los avisos del equipo docente aparecerán aquí.'
            }
          />
        </Card>
      ) : (
        <ol
          className="m-0 grid min-w-0 list-none gap-3 p-0"
          aria-label="Anuncios publicados"
        >
          {anuncios.map((anuncio) => (
            <li key={anuncio.id} className="min-w-0">
              <TarjetaAnuncio
                anuncio={anuncio}
                nuevo={rol === 'ALUMNO' && Boolean(anuncio.nuevo)}
                acciones={
                  rol === 'PROFESOR' &&
                  anuncio.autor.id === user.id && (
                    <EdicionAnuncio
                      anuncio={anuncio}
                      ruta={ruta}
                      recargar={recargar}
                    />
                  )
                }
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// Un mensaje largo se recorta a tres líneas; «Ver más» lo muestra entero.
const LARGO_RECORTE = 280

function TarjetaAnuncio({
  anuncio,
  nuevo,
  acciones,
}: {
  anuncio: Anuncio
  nuevo: boolean
  acciones: React.ReactNode
}) {
  const [completo, setCompleto] = useState(false)
  const largo =
    anuncio.cuerpo.length > LARGO_RECORTE ||
    anuncio.cuerpo.split('\n').length > 3
  const idTitulo = `anuncio-${anuncio.id}`
  const idCuerpo = `anuncio-${anuncio.id}-cuerpo`
  return (
    <Card className="min-w-0 gap-3 p-5">
      <article aria-labelledby={idTitulo} className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <Avatar className="size-9 shrink-0">
            <AvatarFallback
              aria-hidden="true"
              className="bg-accent text-xs font-semibold text-accent-foreground"
            >
              {iniciales(anuncio.autor.nombre)}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 basis-40">
            <span className="text-sm font-medium break-words text-foreground">
              {anuncio.autor.nombre}
            </span>
            <span className="text-xs text-muted-foreground">
              <time dateTime={anuncio.publicadoEn}>
                {fechaAnuncio(anuncio.publicadoEn)}
              </time>
            </span>
          </div>
          <Badge variant="outline" className="shrink-0">
            {anuncio.seccion
              ? `Sección ${anuncio.seccion.numero}`
              : 'Todo el curso'}
          </Badge>
          {acciones}
        </div>
        <h4
          id={idTitulo}
          className="m-0 flex flex-wrap items-center gap-2 text-base font-semibold break-words text-foreground"
        >
          {anuncio.titulo}
          {nuevo && <Badge>Nuevo</Badge>}
        </h4>
        {anuncio.editadoEn && (
          <p className="m-0 text-xs text-muted-foreground">
            Editado el{' '}
            <time dateTime={anuncio.editadoEn}>
              {fechaAnuncio(anuncio.editadoEn)}
            </time>
          </p>
        )}
        <p
          id={idCuerpo}
          className={
            'm-0 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground ' +
            (largo && !completo ? 'line-clamp-3' : '')
          }
        >
          {anuncio.cuerpo}
        </p>
        {largo && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto justify-self-start p-0"
            aria-expanded={completo}
            aria-controls={idCuerpo}
            onClick={() => setCompleto(!completo)}
          >
            {completo ? 'Ver menos' : 'Ver más'}
          </Button>
        )}
      </article>
    </Card>
  )
}

// El GET no escribe. Solo después de mostrar una lista correcta se registran
// sus IDs, por lotes; un GET fallido no avanza la última visita. Las etiquetas
// de este render se conservan para que el alumno identifique lo que era nuevo.
function RegistrarLectura({
  ruta,
  anuncios,
}: {
  ruta: string
  anuncios: Anuncio[]
}) {
  const { fetchConSesion } = useAuth()
  const [fallo, setFallo] = useState(false)
  const [intento, setIntento] = useState(0)
  const [guardando, setGuardando] = useState(true)
  useEffect(() => {
    let vigente = true
    const ids = anuncios.filter((anuncio) => anuncio.nuevo).map((a) => a.id)
    async function registrar() {
      for (let desde = 0; desde < ids.length; desde += MAX_ANUNCIOS_LECTURA) {
        const respuesta = await fetchConSesion(`${ruta}/lecturas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            anuncioIds: ids.slice(desde, desde + MAX_ANUNCIOS_LECTURA),
          }),
        })
        if (!respuesta.ok) throw new Error('No se registró la lectura')
        window.dispatchEvent(new Event(EVENTO_LECTURA_ANUNCIOS))
        if (!vigente) return
      }
    }
    void registrar()
      .then(() => {
        if (vigente) setFallo(false)
      })
      .catch(() => {
        if (vigente) setFallo(true)
      })
      .finally(() => {
        if (vigente) setGuardando(false)
      })
    return () => {
      vigente = false
    }
  }, [anuncios, fetchConSesion, ruta, intento])
  if (!fallo) return null
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription className="gap-2">
        <p className="m-0">No pudimos actualizar los anuncios leídos.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-card text-foreground"
          disabled={guardando}
          onClick={() => {
            setGuardando(true)
            setIntento((actual) => actual + 1)
          }}
        >
          Reintentar actualización
        </Button>
      </AlertDescription>
    </Alert>
  )
}

const VACIO: PublicarAnuncio = { titulo: '', cuerpo: '' }

// El 400 de la API trae los mensajes de validación (class-validator) como
// lista; se muestra el primero.
function mensajeDe(cuerpo: { message?: unknown } | null): string | null {
  const mensaje = cuerpo?.message
  if (typeof mensaje === 'string') return mensaje
  if (Array.isArray(mensaje) && typeof mensaje[0] === 'string')
    return mensaje[0]
  return null
}

function FormularioAnuncio({
  abierto,
  cambiarAbierto,
  ruta,
  seccionId,
  numeroSeccion,
  alPublicar,
}: {
  abierto: boolean
  cambiarAbierto: (abierto: boolean) => void
  ruta: string
  seccionId: string
  numeroSeccion?: number
  alPublicar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [campos, setCampos] = useState(VACIO)
  const [soloSeccion, setSoloSeccion] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function publicar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando) return
    setGuardando(true)
    setError(null)
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...campos,
          ...(soloSeccion ? { seccionId } : {}),
        } satisfies PublicarAnuncio),
      })
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as {
          message?: unknown
        } | null
        setError(
          (res.status === 400 && mensajeDe(cuerpo)) ||
            'No pudimos publicar el anuncio. Inténtalo nuevamente.',
        )
        return
      }
      setCampos(VACIO)
      toast.success(
        soloSeccion
          ? `Anuncio publicado para la sección ${numeroSeccion ?? 'actual'}`
          : 'Anuncio publicado para todas las secciones del curso',
      )
      setSoloSeccion(false)
      cambiarAbierto(false)
      alPublicar()
    } catch {
      setError(
        'No pudimos publicar el anuncio. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  const cambiar =
    (campo: keyof PublicarAnuncio) => (event: { target: { value: string } }) =>
      setCampos((actuales) => ({ ...actuales, [campo]: event.target.value }))

  return (
    <Dialog
      open={abierto}
      onOpenChange={(siguiente) => {
        if (guardando) return
        if (!siguiente) setError(null)
        cambiarAbierto(siguiente)
      }}
    >
      <DialogContent className="bg-card text-left sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo anuncio</DialogTitle>
          <DialogDescription>
            Avisa a todo el curso o solo a esta sección.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid min-w-0 gap-4"
          aria-label="Nuevo anuncio"
          onSubmit={(event) => void publicar(event)}
        >
          <FormField
            etiqueta="Dirigido a"
            ayuda={
              soloSeccion
                ? 'Lo verán solo los integrantes de esta sección.'
                : 'Lo verán los alumnos y ayudantes de todas las secciones del curso.'
            }
          >
            {(control) => (
              <NativeSelect
                {...control}
                className="w-full"
                value={soloSeccion ? seccionId : ''}
                disabled={guardando}
                onChange={(event) =>
                  setSoloSeccion(event.target.value === seccionId)
                }
              >
                <option value="">Todo el curso</option>
                <option value={seccionId}>
                  Sección {numeroSeccion ?? 'actual'}
                </option>
              </NativeSelect>
            )}
          </FormField>
          <FormField etiqueta="Título">
            {(control) => (
              <Input
                {...control}
                disabled={guardando}
                value={campos.titulo}
                onChange={cambiar('titulo')}
                maxLength={LARGO_TITULO_ANUNCIO}
                required
              />
            )}
          </FormField>
          <FormField etiqueta="Mensaje">
            {(control) => (
              <Textarea
                {...control}
                disabled={guardando}
                value={campos.cuerpo}
                onChange={cambiar('cuerpo')}
                maxLength={LARGO_CUERPO_ANUNCIO}
                rows={6}
                required
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
              onClick={() => cambiarAbierto(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              Publicar anuncio
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
