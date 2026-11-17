import {
  LARGO_INSTRUCCIONES_ACTIVIDAD,
  LARGO_TITULO_ACTIVIDAD,
  ZONA_HORARIA_UNIVERSIDAD,
  type Actividad,
  type ArchivoEntregasZip,
  type CrearActividad,
  type DescargaArchivo,
  type EntregaDeAlumno,
  type Periodo,
} from '@cursus/shared'
import { es } from 'react-day-picker/locale'
import {
  CalendarDays,
  CircleAlert,
  Download,
  Inbox,
  Plus,
  TriangleAlert,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { EmptyState, ErrorState, FormField } from '@/components/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatearFecha } from '@/lib/fechas'
import { useAuth } from '../auth/auth'
// Lo usan las actividades del alumno y su entrega (MiEntrega).
import { useDatos } from './useDatos'
import { TarjetaActividad } from './MiEntrega'
import {
  fechasLegibles,
  horaMinima,
  textoPeriodoTerminado,
  validarPlazo,
  ventanaActividad,
  type ErroresPlazo,
} from './ventanaActividad'
import type { PropsPestana } from './VistaSeccion'

// Fecha y hora límite en la zona de la universidad, con el año completo y
// la hora de 0 a 23 (por ejemplo, 14-11-2026, 23:59).
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    timeZone: ZONA_HORARIA_UNIVERSIDAD,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

// MAT-08 (RN-08): actividades de entrega de la sección, por plazo. Las crea
// solo el profesor de la sección; el ayudante, el alumno y el Director ven la
// lista. Una actividad cuyo plazo pasó se muestra como cerrada. MAT-10: el
// profesor y el ayudante ven y descargan las entregas de cada actividad.
export function PestanaEntregas({ seccionId, rol, periodo }: PropsPestana) {
  const ruta = `/api/espacio/secciones/${seccionId}/actividades`
  const [actividades, recargar] = useDatos<Actividad[]>(ruta)

  if (rol === 'ALUMNO') {
    return (
      <ActividadesAlumno
        ruta={ruta}
        seccionId={seccionId}
        actividades={actividades}
        recargar={recargar}
      />
    )
  }
  return (
    <ActividadesDocente
      ruta={ruta}
      rol={rol}
      periodo={periodo}
      actividades={actividades}
      recargar={recargar}
    />
  )
}

// Ventana de fechas del período del curso (la misma regla del backend), o
// null si todavía no se sabe. «terminado» es la ventana vacía.
function usePlazoDelPeriodo(periodo: PropsPestana['periodo'], activo: boolean) {
  const [periodos] = useDatos<Periodo[]>(
    activo && periodo ? '/api/periodos' : null,
  )
  const datos = periodos?.find((p) => p.id === periodo?.id)
  if (!datos) return null
  const ahora = new Date()
  const ventana = ventanaActividad(datos, ahora)
  return { datos, ventana, terminado: ventana === null }
}

function ActividadesDocente({
  ruta,
  rol,
  periodo,
  actividades,
  recargar,
}: {
  ruta: string
  rol: PropsPestana['rol']
  periodo: PropsPestana['periodo']
  actividades: Actividad[] | null | undefined
  recargar: () => void
}) {
  const esProfesor = rol === 'PROFESOR'
  const plazo = usePlazoDelPeriodo(periodo, esProfesor)
  const [creando, setCreando] = useState(false)
  const [viendo, setViendo] = useState<Actividad | null>(null)
  const terminado = plazo?.terminado ?? false
  const crear = esProfesor && (
    <Button type="button" disabled={terminado} onClick={() => setCreando(true)}>
      <Plus aria-hidden="true" />
      Crear actividad
    </Button>
  )

  return (
    <section className="grid min-w-0 gap-4" aria-label="Actividades de entrega">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-lg font-semibold text-foreground">
          Actividades de entrega
        </h3>
        {actividades?.length !== 0 && crear}
      </div>
      {esProfesor && plazo?.terminado && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            {textoPeriodoTerminado({ ...plazo.datos })}
          </AlertDescription>
        </Alert>
      )}
      {esProfesor && (
        <FormularioActividad
          abierto={creando && !terminado}
          cambiarAbierto={setCreando}
          ruta={ruta}
          ventana={plazo?.ventana ?? null}
          alCrear={recargar}
        />
      )}
      {actividades === undefined ? (
        <div role="status" className="grid gap-2">
          <span className="sr-only">Cargando actividades…</span>
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      ) : actividades === null ? (
        <ErrorState
          mensaje="No pudimos cargar las actividades."
          onReintentar={recargar}
        />
      ) : actividades.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icono={Inbox}
            titulo="Aún no hay actividades de entrega"
            mensaje={
              esProfesor
                ? 'Crea una actividad con plazo para que los alumnos entreguen su informe.'
                : 'Aquí aparecerán las actividades que cree el profesor.'
            }
            accion={crear}
          />
        </Card>
      ) : (
        <Card className="min-w-0 gap-0 py-0">
          <Table aria-label="Actividades">
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Fecha límite</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actividades.map((actividad) => (
                <TableRow key={actividad.id} aria-label={actividad.titulo}>
                  <TableCell className="min-w-56 whitespace-normal">
                    <span className="block font-medium break-words text-foreground">
                      {actividad.titulo}
                    </span>
                    <span className="line-clamp-2 text-xs break-words whitespace-pre-wrap text-muted-foreground">
                      {actividad.instrucciones}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {fechaHora(actividad.plazo)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={actividad.cerrada ? 'outline' : 'secondary'}
                    >
                      {actividad.cerrada ? 'Cerrada' : 'Abierta'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Ver entregas de ${actividad.titulo}`}
                      onClick={() => setViendo(actividad)}
                    >
                      Ver entregas
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Dialog
        open={viendo !== null}
        onOpenChange={(abierto) => !abierto && setViendo(null)}
      >
        <DialogContent className="max-h-[85svh] overflow-y-auto bg-card text-left sm:max-w-3xl">
          {viendo && (
            <>
              <DialogHeader>
                <DialogTitle>Entregas de {viendo.titulo}</DialogTitle>
                <DialogDescription>
                  Plazo: {fechaHora(viendo.plazo)}
                </DialogDescription>
              </DialogHeader>
              <EntregasActividad
                ruta={`${ruta}/${viendo.id}/entregas`}
                titulo={viendo.titulo}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

// El alumno ve cada actividad con su plazo y entrega su informe (MAT-09).
function ActividadesAlumno({
  ruta,
  seccionId,
  actividades,
  recargar,
}: {
  ruta: string
  seccionId: string
  actividades: Actividad[] | null | undefined
  recargar: () => void
}) {
  // Primero las abiertas, de la que vence antes a la que vence después; las
  // cerradas al final, de la más reciente a la más antigua.
  const ordenadas = actividades
    ? [...actividades].sort((a, b) =>
        a.cerrada !== b.cerrada
          ? Number(a.cerrada) - Number(b.cerrada)
          : a.cerrada
            ? b.plazo.localeCompare(a.plazo)
            : a.plazo.localeCompare(b.plazo),
      )
    : actividades
  return (
    <section className="grid min-w-0 gap-4" aria-label="Actividades de entrega">
      <h3 className="m-0 text-lg font-semibold text-foreground">
        Actividades de entrega
      </h3>
      {ordenadas === undefined ? (
        <div role="status" className="grid gap-3">
          <span className="sr-only">Cargando actividades…</span>
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : ordenadas === null ? (
        <ErrorState
          mensaje="No pudimos cargar las actividades."
          onReintentar={recargar}
        />
      ) : ordenadas.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icono={Inbox}
            mensaje="Aún no hay actividades de entrega"
          />
        </Card>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0" aria-label="Actividades">
          {ordenadas.map((actividad) => (
            <li key={actividad.id} className="min-w-0">
              <article aria-label={actividad.titulo}>
                <TarjetaActividad
                  key={`${seccionId}-${actividad.id}`}
                  ruta={`${ruta}/${actividad.id}`}
                  actividad={actividad}
                />
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// MAT-10: un alumno inscrito por fila, con su última entrega o "Sin entrega".
// La descarga pide una URL firmada de esa versión y la abre; el archivo se
// descarga con su nombre (Content-Disposition: attachment).
function EntregasActividad({ ruta, titulo }: { ruta: string; titulo: string }) {
  const { fetchConSesion } = useAuth()
  const [entregas, recargar] = useDatos<EntregaDeAlumno[]>(ruta)
  const [descargando, setDescargando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function descargarTodas() {
    setDescargando('zip')
    setError(null)
    try {
      const res = await fetchConSesion(`${ruta}/zip`)
      if (!res.ok) throw new Error()
      const archivos = (await res.json()) as ArchivoEntregasZip[]
      if (!archivos.length) {
        setError('No hay entregas disponibles para descargar.')
        return
      }
      const { descargarZipEntregas } = await import('./zipEntregas')
      await descargarZipEntregas(archivos)
    } catch {
      setError('No pudimos descargar todas las entregas. Inténtalo nuevamente.')
    } finally {
      setDescargando(null)
    }
  }

  async function descargar(entregaId: string) {
    setDescargando(entregaId)
    setError(null)
    try {
      const res = await fetchConSesion(`${ruta}/${entregaId}/descarga`)
      if (!res.ok) throw new Error()
      const { url } = (await res.json()) as DescargaArchivo
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.click()
    } catch {
      setError('No pudimos descargar el informe. Inténtalo nuevamente.')
    } finally {
      // Siempre se desbloquea, también si la descarga falló.
      setDescargando(null)
    }
  }

  if (entregas === undefined)
    return (
      <div role="status">
        <span className="sr-only">Cargando entregas…</span>
        <Skeleton className="h-32 rounded-lg" />
      </div>
    )
  if (entregas === null)
    return (
      <ErrorState
        mensaje="No pudimos cargar las entregas."
        onReintentar={recargar}
      />
    )
  if (entregas.length === 0)
    return (
      <EmptyState
        icono={Inbox}
        mensaje="No hay alumnos inscritos en la sección"
      />
    )
  const entregados = entregas.filter((f) => f.entrega).length
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm text-muted-foreground">
          {entregados} de {entregas.length} alumnos entregaron
        </p>
        {entregados > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={descargando !== null}
            onClick={() => void descargarTodas()}
          >
            <Download aria-hidden="true" />
            {descargando === 'zip'
              ? 'Preparando ZIP…'
              : 'Descargar entregas en ZIP'}
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table aria-label={`Entregas de ${titulo}`}>
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead>Alumno</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha y hora</TableHead>
              <TableHead>Informe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entregas.map(({ alumno, entrega }) => (
              <TableRow key={alumno.id}>
                <TableHead scope="row" className="font-medium text-foreground">
                  {alumno.nombre}
                </TableHead>
                <TableCell>
                  <Badge variant={entrega ? 'secondary' : 'outline'}>
                    {entrega ? 'Entregado' : 'Sin entrega'}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {entrega ? fechaHora(entrega.entregadaEn) : '—'}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {entrega && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Descargar el informe de ${alumno.nombre}`}
                      disabled={descargando !== null}
                      onClick={() => void descargar(entrega.id)}
                    >
                      <Download aria-hidden="true" />
                      {descargando === entrega.id
                        ? 'Descargando…'
                        : 'Descargar'}
                    </Button>
                  )}
                  {entrega && entrega.versiones > 1 && (
                    <span className="block text-xs text-muted-foreground">
                      {entrega.versiones} versiones; se descarga la última
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {error && (
        <Alert variant="danger">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

const VACIO = { titulo: '', instrucciones: '', fecha: '', hora: '' }

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTOS = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, '0'),
)

// AAAA-MM-DD ↔ Date local, para el calendario (que trabaja con días locales).
const aDia = (fecha: string) => {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}
const deDia = (dia: Date) =>
  `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`

function FormularioActividad({
  abierto,
  cambiarAbierto,
  ruta,
  ventana,
  alCrear,
}: {
  abierto: boolean
  cambiarAbierto: (abierto: boolean) => void
  ruta: string
  ventana: ReturnType<typeof ventanaActividad>
  alCrear: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [campos, setCampos] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<ErroresPlazo>({})
  const [calendario, setCalendario] = useState(false)
  // La hora se elige en dos selectores; el valor se arma con los dos.
  const [hora, minuto] = campos.hora ? campos.hora.split(':') : ['', '']

  const ahora = new Date()
  const minima = campos.fecha ? horaMinima(campos.fecha, ahora) : '00:00'
  const [horaMin, minutoMin] = minima.split(':')

  async function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando) return
    const plazo = validarPlazo(campos.fecha, campos.hora, ventana, new Date())
    setErrores(plazo)
    setError(null)
    if (plazo.fecha || plazo.hora) return
    setGuardando(true)
    const datos: CrearActividad = { ...campos }
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!res.ok) {
        // Los 400 por el plazo (pasado o fuera del período) traen el motivo.
        const cuerpo = (await res.json().catch(() => null)) as {
          message?: unknown
        } | null
        setError(
          res.status === 400 && typeof cuerpo?.message === 'string'
            ? fechasLegibles(cuerpo.message)
            : 'No pudimos crear la actividad. Revisa los datos e inténtalo nuevamente.',
        )
        return
      }
      setCampos(VACIO)
      toast.success('Actividad creada')
      cambiarAbierto(false)
      alCrear()
    } catch {
      setError(
        'No pudimos crear la actividad. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  const cambiar =
    (campo: 'titulo' | 'instrucciones') =>
    (event: { target: { value: string } }) =>
      setCampos((actuales) => ({ ...actuales, [campo]: event.target.value }))

  const fijarHora = (nuevaHora: string, nuevoMinuto: string) => {
    setErrores((actuales) => ({ ...actuales, hora: undefined }))
    setCampos((actuales) => ({
      ...actuales,
      hora: nuevaHora ? `${nuevaHora}:${nuevoMinuto || '00'}` : '',
    }))
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(siguiente) => {
        if (guardando) return
        if (!siguiente) {
          setError(null)
          setErrores({})
        }
        cambiarAbierto(siguiente)
      }}
    >
      <DialogContent className="bg-card text-left sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear actividad</DialogTitle>
          <DialogDescription>
            {ventana
              ? `El plazo puede ser entre el ${formatearFecha(ventana.desde)} y el ${formatearFecha(ventana.hasta)}, en hora de Chile continental.`
              : 'La fecha y hora límite son de Chile continental.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid min-w-0 gap-4"
          aria-label="Nueva actividad"
          noValidate
          onSubmit={(event) => void crear(event)}
        >
          <FormField etiqueta="Título">
            {(control) => (
              <Input
                {...control}
                value={campos.titulo}
                onChange={cambiar('titulo')}
                maxLength={LARGO_TITULO_ACTIVIDAD}
                required
                disabled={guardando}
              />
            )}
          </FormField>
          <FormField etiqueta="Instrucciones">
            {(control) => (
              <Textarea
                {...control}
                value={campos.instrucciones}
                onChange={cambiar('instrucciones')}
                maxLength={LARGO_INSTRUCCIONES_ACTIVIDAD}
                rows={4}
                required
                disabled={guardando}
              />
            )}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta="Fecha límite" error={errores.fecha}>
              {(control) => (
                <Popover open={calendario} onOpenChange={setCalendario}>
                  <PopoverTrigger asChild>
                    <Button
                      {...control}
                      type="button"
                      variant="outline"
                      disabled={guardando}
                      className="w-full justify-start font-normal"
                    >
                      <CalendarDays aria-hidden="true" />
                      {campos.fecha
                        ? formatearFecha(campos.fecha)
                        : 'Elige una fecha'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={es}
                      weekStartsOn={1}
                      selected={campos.fecha ? aDia(campos.fecha) : undefined}
                      defaultMonth={
                        campos.fecha
                          ? aDia(campos.fecha)
                          : ventana
                            ? aDia(ventana.desde)
                            : undefined
                      }
                      disabled={
                        ventana
                          ? [
                              { before: aDia(ventana.desde) },
                              { after: aDia(ventana.hasta) },
                            ]
                          : undefined
                      }
                      onSelect={(dia) => {
                        setErrores({})
                        setCampos((actuales) => ({
                          ...actuales,
                          fecha: dia ? deDia(dia) : '',
                        }))
                        setCalendario(false)
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </FormField>
            <fieldset
              className="m-0 grid min-w-0 gap-2 border-0 p-0"
              aria-describedby={errores.hora ? 'hora-limite-error' : undefined}
            >
              <legend className="mb-2 p-0 text-sm leading-none font-medium">
                Hora límite
              </legend>
              <div className="flex items-center gap-2">
                <NativeSelect
                  aria-label="Hora"
                  aria-invalid={errores.hora ? true : undefined}
                  className="w-20"
                  value={hora}
                  disabled={guardando}
                  onChange={(e) => fijarHora(e.target.value, minuto)}
                >
                  <option value="">--</option>
                  {HORAS.map((h) => (
                    <option key={h} value={h} disabled={h < horaMin}>
                      {h}
                    </option>
                  ))}
                </NativeSelect>
                <span aria-hidden="true">:</span>
                <NativeSelect
                  aria-label="Minutos"
                  aria-invalid={errores.hora ? true : undefined}
                  className="w-20"
                  value={minuto}
                  disabled={guardando || !hora}
                  onChange={(e) => fijarHora(hora, e.target.value)}
                >
                  {MINUTOS.map((m) => (
                    <option
                      key={m}
                      value={m}
                      disabled={hora === horaMin && m < minutoMin}
                    >
                      {m}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {errores.hora && (
                <p
                  id="hora-limite-error"
                  role="alert"
                  className="m-0 text-sm text-destructive"
                >
                  {errores.hora}
                </p>
              )}
            </fieldset>
          </div>
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
              Crear actividad
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
