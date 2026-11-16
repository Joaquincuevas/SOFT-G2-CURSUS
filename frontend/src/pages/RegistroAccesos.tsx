import {
  TIPOS_EVENTO,
  type EventoAcceso,
  type PaginaEventos,
  type TipoEvento,
  type UniversidadDelFiltro,
} from '@cursus/shared'
import {
  CalendarDays,
  Download,
  Info,
  Lock,
  LogIn,
  PenLine,
  Search,
  TriangleAlert,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { es } from 'react-day-picker/locale'
import { useSearchParams } from 'react-router'
import { EmptyState, ErrorState, FormField } from '@/components/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatearFecha, formatearFechaHora } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import { useDatos } from './useDatos'

// SEG-05: el Director consulta el registro de accesos y acciones sensibles
// (SEG-04). Los filtros y la página viven en la URL, así que se pueden
// compartir y se conservan al recargar. Solo llega aquí el Director (read
// RegistroAccesos en navigation.ts). Solo se usan los filtros que la API
// acepta (tipo, universidad, usuario, desde, hasta y página).
const TIPOS: Record<TipoEvento, { texto: string; icono: LucideIcon }> = {
  INICIO_SESION: { texto: 'Inicio de sesión', icono: LogIn },
  CAMBIO_NOTA: { texto: 'Cambio de nota', icono: PenLine },
  ASIGNACION: { texto: 'Asignación', icono: UserPlus },
  CIERRE_CURSO: { texto: 'Cierre de curso', icono: Lock },
}
const RESULTADOS: Record<EventoAcceso['resultado'], string> = {
  EXITOSO: 'Exitoso',
  FALLIDO: 'Fallido',
  BLOQUEADO: 'Bloqueado',
}
const SUBTIPOS: Record<string, string> = {
  APROBACION: 'Aprobación',
  DEVOLUCION: 'Devolución',
  RECORRECCION: 'Recorrección',
  PROFESOR: 'Profesor',
  AYUDANTE: 'Ayudante',
  // SEG-02: el paso del código TOTP del login.
  MFA: 'Verificación en dos pasos',
}
const ROLES: Record<string, string> = {
  DIRECTOR: 'Director',
  ADMINISTRATIVO: 'Administrativo',
  PROFESOR: 'Profesor',
  AYUDANTE: 'Ayudante',
  ALUMNO: 'Alumno',
  SUPERADMIN: 'Superadmin',
}
// Atajos de rango: se guardan en la URL como «últimas N horas», así un enlace
// compartido sigue mostrando lo reciente.
const ATAJOS = {
  '24h': { texto: 'Últimas 24 horas', horas: 24 },
  '7d': { texto: '7 días', horas: 24 * 7 },
  '30d': { texto: '30 días', horas: 24 * 30 },
} as const
type Atajo = keyof typeof ATAJOS

const NOTA_NO_DISPONIBLE = 'accesos-no-disponible'
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
// Un día que existe: el patrón solo revisa la forma, y Date corrige en silencio
// lo imposible (2026-02-30 sería el 2 de marzo), así que se compara de vuelta.
const DIA = /^\d{4}-\d{2}-\d{2}$/
const diaExiste = (dia: string) => {
  if (!DIA.test(dia)) return false
  const fecha = new Date(`${dia}T00:00:00Z`)
  // Un mes 13 da Date inválida: toISOString lanzaría.
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(dia)
}

// Las fechas se muestran en la zona horaria del navegador; la zona se dice una
// vez, arriba de la tabla.
const ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone

// Un día elegido (AAAA-MM-DD) son sus 24 horas en la zona del navegador:
// la API recibe instantes con zona (UTC).
const inicioDelDia = (dia: string) => new Date(`${dia}T00:00:00`).toISOString()
const finDelDia = (dia: string) => new Date(`${dia}T23:59:59.999`).toISOString()
const aDia = (dia: string) => new Date(`${dia}T00:00:00`)
const deDia = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`

const alMinuto = () => Math.floor(Date.now() / 60_000) * 60_000

const detalleDe = (e: EventoAcceso) =>
  [
    typeof e.detalle.subtipo === 'string'
      ? (SUBTIPOS[e.detalle.subtipo] ?? e.detalle.subtipo)
      : null,
    e.detalle.credencialProvisoria ? 'Credencial provisoria' : null,
  ]
    .filter(Boolean)
    .join(' · ')

export function RegistroAccesos() {
  const [params, fijarParams] = useSearchParams()
  const valor = (nombre: string) => params.get(nombre) ?? ''
  const tipo = valor('tipo')
  const universidadId = valor('universidad')
  const usuarioId = valor('usuario')
  const desde = valor('desde')
  const hasta = valor('hasta')
  const ultimas = valor('ultimas')
  const pagina = Math.max(1, Math.floor(Number(valor('pagina'))) || 1)

  const filtrosValidos =
    (!tipo || (TIPOS_EVENTO as readonly string[]).includes(tipo)) &&
    (!universidadId || UUID.test(universidadId)) &&
    (!usuarioId || UUID.test(usuarioId)) &&
    (!desde || diaExiste(desde)) &&
    (!hasta || diaExiste(hasta)) &&
    (!ultimas || ultimas in ATAJOS)
  const rangoInvalido = Boolean(desde && hasta && desde > hasta)

  // El instante de referencia de los atajos, al minuto: al cargar la página y
  // al elegir un atajo (no en cada render, que pediría la API sin parar).
  const [ahora, setAhora] = useState(alMinuto)
  const desdeDelAtajo =
    ultimas in ATAJOS
      ? new Date(
          ahora - ATAJOS[ultimas as Atajo].horas * 3_600_000,
        ).toISOString()
      : null

  const consulta = new URLSearchParams()
  if (tipo) consulta.set('tipo', tipo)
  if (universidadId) consulta.set('universidadId', universidadId)
  if (usuarioId) consulta.set('usuarioId', usuarioId)
  // Con un filtro inválido no se arma la consulta (toISOString lanzaría).
  if (filtrosValidos && desdeDelAtajo) consulta.set('desde', desdeDelAtajo)
  else if (filtrosValidos && desde) consulta.set('desde', inicioDelDia(desde))
  if (filtrosValidos && hasta && !desdeDelAtajo)
    consulta.set('hasta', finDelDia(hasta))
  if (pagina > 1) consulta.set('pagina', String(pagina))
  const texto = consulta.toString()

  const [resultado, recargar] = useDatos<PaginaEventos>(
    filtrosValidos && !rangoInvalido
      ? `/api/auditoria/eventos${texto ? `?${texto}` : ''}`
      : null,
  )
  const [universidades] = useDatos<UniversidadDelFiltro[]>(
    '/api/auditoria/universidades',
  )

  // Cambiar un filtro vuelve a la primera página.
  const cambiar = (cambios: Record<string, string>) => {
    const nuevos = new URLSearchParams(params)
    nuevos.delete('pagina')
    for (const [nombre, v] of Object.entries(cambios)) {
      if (v) nuevos.set(nombre, v)
      else nuevos.delete(nombre)
    }
    fijarParams(nuevos)
  }
  const irA = (n: number) => {
    const nuevos = new URLSearchParams(params)
    if (n > 1) nuevos.set('pagina', String(n))
    else nuevos.delete('pagina')
    fijarParams(nuevos)
  }
  const hayFiltros = Boolean(
    tipo || universidadId || usuarioId || desde || hasta || ultimas,
  )
  const limpiar = () => fijarParams(new URLSearchParams())
  const nombreDelUsuario =
    resultado?.eventos.find((e) => e.usuario?.id === usuarioId)?.usuario
      ?.nombre ?? 'seleccionado'
  const paginas = resultado
    ? Math.max(1, Math.ceil(resultado.total / resultado.tamano))
    : 1

  return (
    <section className="grid min-w-0 gap-4" aria-label="Registro de accesos">
      <form
        role="search"
        aria-label="Filtros"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-lg border border-border bg-card p-3"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1.4fr)_repeat(3,minmax(0,1fr))]">
          <FormField etiqueta="Buscar usuario o IP" className="min-w-0">
            {(control) => (
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  {...control}
                  type="search"
                  placeholder="Nombre, correo o IP"
                  className="w-full pl-8"
                  aria-describedby={NOTA_NO_DISPONIBLE}
                  // ponytail: la API no filtra por texto y el registro tiene
                  // varias páginas; buscar solo en la página visible engañaría.
                  // Se habilita cuando GET /api/auditoria/eventos acepte `q`.
                  disabled
                />
              </div>
            )}
          </FormField>
          <Filtro
            etiqueta="Tipo de evento"
            valor={tipo}
            onCambiar={(v) => cambiar({ tipo: v })}
            opciones={TIPOS_EVENTO.map((t) => [t, TIPOS[t].texto])}
          />
          <Filtro
            etiqueta="Resultado"
            valor=""
            onCambiar={() => {}}
            // La API no filtra por resultado (ver la búsqueda).
            disabled
            describedBy={NOTA_NO_DISPONIBLE}
            opciones={[
              ['EXITOSO', 'Exitoso'],
              ['FALLIDO', 'Fallido'],
            ]}
          />
          <Filtro
            etiqueta="Universidad"
            valor={universidadId}
            onCambiar={(v) => cambiar({ universidad: v })}
            disabled={!universidades}
            todas={
              universidades === undefined
                ? 'Cargando universidades…'
                : universidades === null
                  ? 'No se pudieron cargar'
                  : 'Todas'
            }
            opciones={(universidades ?? []).map((u) => [u.id, u.nombre])}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <CampoFecha
            etiqueta="Desde"
            valor={desde}
            hasta={hasta}
            onCambiar={(v) => cambiar({ desde: v, ultimas: '' })}
          />
          <CampoFecha
            etiqueta="Hasta"
            valor={hasta}
            desde={desde}
            onCambiar={(v) => cambiar({ hasta: v, ultimas: '' })}
          />
          <div
            role="group"
            aria-label="Rangos rápidos"
            className="flex flex-wrap gap-1.5"
          >
            {(Object.keys(ATAJOS) as Atajo[]).map((clave) => (
              <Button
                key={clave}
                type="button"
                size="sm"
                variant={ultimas === clave ? 'default' : 'outline'}
                aria-pressed={ultimas === clave}
                onClick={() => {
                  setAhora(alMinuto())
                  cambiar({
                    ultimas: ultimas === clave ? '' : clave,
                    desde: '',
                    hasta: '',
                  })
                }}
              >
                {ATAJOS[clave].texto}
              </Button>
            ))}
          </div>
          {hayFiltros && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={limpiar}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
        <p
          id={NOTA_NO_DISPONIBLE}
          className="m-0 text-xs text-muted-foreground"
        >
          La búsqueda por usuario o IP y el filtro por resultado aún no están
          disponibles: el servidor no los permite.
        </p>
        {usuarioId && (
          <div>
            <button
              type="button"
              aria-label={`Quitar Usuario: ${nombreDelUsuario}`}
              onClick={() => cambiar({ usuario: '' })}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-secondary px-2.5 text-xs font-medium text-secondary-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Usuario: {nombreDelUsuario}
              <X aria-hidden="true" className="size-3" />
            </button>
          </div>
        )}
      </form>

      <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        Fechas y horas en tu zona horaria ({ZONA}), en formato de 24 horas. Del
        evento más reciente al más antiguo.
      </p>

      {!filtrosValidos ? (
        <Alert variant="danger">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            Los filtros de la dirección no son válidos.
          </AlertDescription>
        </Alert>
      ) : rangoInvalido ? (
        <Alert variant="danger">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            La fecha «desde» no puede ser posterior a «hasta».
          </AlertDescription>
        </Alert>
      ) : resultado === undefined ? (
        <div role="status" className="grid gap-2">
          <span className="sr-only">Cargando el registro…</span>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : resultado === null ? (
        <ErrorState
          mensaje="No pudimos cargar el registro de accesos."
          onReintentar={recargar}
        />
      ) : resultado.eventos.length === 0 ? (
        <Card className="py-0">
          {resultado.total === 0 ? (
            <EmptyState
              mensaje="No hay eventos con estos filtros."
              accion={
                hayFiltros ? (
                  <Button type="button" variant="outline" onClick={limpiar}>
                    Limpiar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            // Página fuera de rango (un enlace viejo): la salida conserva los
            // filtros y solo quita la página.
            <EmptyState
              mensaje={`Esta página no tiene eventos: con estos filtros hay ${paginas} ${paginas === 1 ? 'página' : 'páginas'}.`}
              accion={
                <Button type="button" variant="outline" onClick={() => irA(1)}>
                  Volver a la primera página
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm">
            <p className="m-0 text-muted-foreground tabular-nums">
              {resultado.total} {resultado.total === 1 ? 'evento' : 'eventos'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportarCsv(resultado)}
            >
              <Download aria-hidden="true" />
              Exportar CSV
            </Button>
          </div>
          <Table>
            <TableCaption className="sr-only">
              Eventos del registro de accesos, página {resultado.pagina} de{' '}
              {paginas}
            </TableCaption>
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Universidad</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.eventos.map((e) => (
                <Fila
                  key={e.id}
                  evento={e}
                  filtrarUsuario={(id) => cambiar({ usuario: id })}
                />
              ))}
            </TableBody>
          </Table>
          <nav
            aria-label="Paginación"
            className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground"
          >
            <span className="tabular-nums">
              Página {resultado.pagina} de {paginas}
            </span>
            <span className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resultado.pagina <= 1}
                onClick={() => irA(resultado.pagina - 1)}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  resultado.pagina * resultado.tamano >= resultado.total
                }
                onClick={() => irA(resultado.pagina + 1)}
              >
                Siguiente
              </Button>
            </span>
          </nav>
        </div>
      )}
    </section>
  )
}

function Filtro({
  etiqueta,
  valor,
  onCambiar,
  opciones,
  todas = 'Todos',
  disabled = false,
  describedBy,
}: {
  etiqueta: string
  valor: string
  onCambiar: (valor: string) => void
  opciones: [string, string][]
  todas?: string
  disabled?: boolean
  describedBy?: string
}) {
  return (
    <FormField
      etiqueta={etiqueta}
      className="min-w-0 [&_[data-slot=native-select-wrapper]]:w-full"
    >
      {(control) => (
        <NativeSelect
          {...control}
          className="w-full"
          value={valor}
          disabled={disabled}
          aria-describedby={describedBy ?? control['aria-describedby']}
          onChange={(e) => onCambiar(e.target.value)}
        >
          <option value="">{todas}</option>
          {opciones.map(([v, texto]) => (
            <option key={v} value={v}>
              {texto}
            </option>
          ))}
        </NativeSelect>
      )}
    </FormField>
  )
}

// Un día con el calendario de shadcn (en español, semana desde el lunes). El
// rango se respeta: «Desde» no deja elegir después de «Hasta» y al revés.
function CampoFecha({
  etiqueta,
  valor,
  onCambiar,
  desde,
  hasta,
}: {
  etiqueta: string
  valor: string
  onCambiar: (dia: string) => void
  desde?: string
  hasta?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const valido = diaExiste(valor)
  return (
    <FormField etiqueta={etiqueta} className="w-44">
      {(control) => (
        <div className="flex items-center gap-1">
          <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
              <Button
                {...control}
                type="button"
                variant="outline"
                className="min-w-0 flex-1 justify-start font-normal"
              >
                <CalendarDays aria-hidden="true" />
                {valido ? formatearFecha(valor) : 'Elige un día'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                locale={es}
                weekStartsOn={1}
                selected={valido ? aDia(valor) : undefined}
                defaultMonth={valido ? aDia(valor) : undefined}
                disabled={[
                  ...(desde && diaExiste(desde)
                    ? [{ before: aDia(desde) }]
                    : []),
                  ...(hasta && diaExiste(hasta)
                    ? [{ after: aDia(hasta) }]
                    : []),
                ]}
                onSelect={(dia) => {
                  onCambiar(dia ? deDia(dia) : '')
                  setAbierto(false)
                }}
              />
            </PopoverContent>
          </Popover>
          {valor && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={`Quitar fecha ${etiqueta.toLowerCase()}`}
              onClick={() => onCambiar('')}
            >
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </FormField>
  )
}

function Fila({
  evento: e,
  filtrarUsuario,
}: {
  evento: EventoAcceso
  filtrarUsuario: (id: string) => void
}) {
  const { texto, icono: Icono } = TIPOS[e.tipo]
  const falla = e.resultado !== 'EXITOSO'
  const detalle = detalleDe(e)
  return (
    <TableRow
      className={cn(falla && 'bg-destructive/5 hover:bg-destructive/10')}
    >
      <TableCell className="tabular-nums">
        <time dateTime={e.fecha}>{formatearFechaHora(e.fecha)}</time>
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-2">
          <Icono aria-hidden="true" className="size-4 text-muted-foreground" />
          {texto}
        </span>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            falla
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-alert-success-border bg-alert-success text-alert-success-foreground'
          }
        >
          {RESULTADOS[e.resultado]}
        </Badge>
      </TableCell>
      <TableCell>
        {e.usuario ? (
          <span className="grid">
            <button
              type="button"
              title="Filtrar por este usuario"
              onClick={() => filtrarUsuario(e.usuario!.id)}
              className="w-fit cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left font-medium text-foreground hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {e.usuario.nombre}
            </button>
            <span className="text-xs text-muted-foreground">
              {ROLES[e.usuario.rol] ?? e.usuario.rol}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Sin cuenta</span>
        )}
      </TableCell>
      <TableCell>{e.universidad?.nombre ?? '—'}</TableCell>
      <TableCell className="tabular-nums">{e.ip ?? '—'}</TableCell>
      <TableCell>{detalle || '—'}</TableCell>
    </TableRow>
  )
}

// CSV de la página visible (lo que la tabla muestra con los filtros), hecho en
// el cliente. Separador «;» y BOM para que Excel en español lo abra bien.
function exportarCsv(pagina: PaginaEventos) {
  const celda = (v: string) => `"${v.replace(/"/g, '""')}"`
  const filas = [
    [
      'Fecha',
      'Evento',
      'Resultado',
      'Usuario',
      'Rol',
      'Universidad',
      'IP',
      'Detalle',
    ],
    ...pagina.eventos.map((e) => [
      formatearFechaHora(e.fecha),
      TIPOS[e.tipo].texto,
      RESULTADOS[e.resultado],
      e.usuario?.nombre ?? 'Sin cuenta',
      e.usuario ? (ROLES[e.usuario.rol] ?? e.usuario.rol) : '',
      e.universidad?.nombre ?? '',
      e.ip ?? '',
      detalleDe(e),
    ]),
  ]
  const texto = filas.map((fila) => fila.map(celda).join(';')).join('\r\n')
  const url = URL.createObjectURL(
    new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' }),
  )
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `registro-de-accesos-pagina-${pagina.pagina}.csv`
  enlace.click()
  URL.revokeObjectURL(url)
}
