import { EmptyState, ErrorState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from '@/components/ui/table'
import {
  LARGO_MOTIVO_ASIGNACION,
  type BusquedaIntegrantes,
  type IntegrantesSeccion as DatosIntegrantes,
  type PersonaIntegrante,
  type RolIntegrante,
} from '@cursus/shared'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/auth'
import { usePuede } from '../session/session'
import { AgregarAlumnoDialogo } from './AgregarAlumno'
import { CargarAlumnosCsvDialogo } from './CargarAlumnosCsv'
import { useDatos } from './useDatos'
import { useMigas } from '../layout/migas-contexto'

const TIPOS: { rol: RolIntegrante; nombre: string }[] = [
  { rol: 'PROFESOR', nombre: 'Profesores' },
  { rol: 'AYUDANTE', nombre: 'Ayudantes' },
  { rol: 'ALUMNO', nombre: 'Alumnos' },
]

export function IntegrantesSeccion() {
  const { id = '' } = useParams()
  const puede = usePuede('update', 'Seccion')
  return puede ? (
    <Integrantes key={id} id={id} />
  ) : (
    <Navigate to="/cursos" replace />
  )
}
function Integrantes({ id }: { id: string }) {
  const [datos, recargar, status, fijar] = useDatos<DatosIntegrantes>(
    `/api/secciones/${id}/integrantes`,
  )
  useMigas(
    datos === undefined
      ? null
      : datos
        ? [
            {
              etiqueta: `${datos.seccion.curso.codigo} · Sección ${datos.seccion.numero}`,
              to: `/cursos/${datos.seccion.curso.id}`,
            },
            { etiqueta: 'Integrantes' },
          ]
        : [{ etiqueta: 'Integrantes' }],
  )
  const [parametros, cambiarParametros] = useSearchParams()
  const rol =
    TIPOS.find((t) => t.rol === parametros.get('rol'))?.rol ?? 'PROFESOR'
  const [ocupado, setOcupado] = useState(false)
  if (datos === undefined)
    return (
      <div role="status">
        <span className="sr-only">Cargando integrantes…</span>
        <Skeleton className="h-24 rounded-xl" />
      </div>
    )
  if (datos === null && (status === 404 || status === 400))
    return (
      <section className="grid min-w-0 gap-5">
        <Link
          to="/cursos"
          className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ← Volver a cursos
        </Link>
        <h2 className="m-0 text-xl font-semibold">Sección no encontrada</h2>
        <p>La sección no existe o no pertenece a tu facultad.</p>
      </section>
    )
  if (datos === null)
    return (
      <ErrorState
        mensaje="No se pudieron cargar los integrantes."
        onReintentar={recargar}
      />
    )
  const { seccion, integrantes } = datos
  return (
    <section
      className="grid min-w-0 gap-5"
      aria-label="Integrantes de la sección"
    >
      <Link
        className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
        to={`/cursos/${seccion.curso.id}`}
        onClick={(e) => {
          if (ocupado) e.preventDefault()
        }}
      >
        ← Volver al curso
      </Link>
      <header className="grid gap-1">
        <h2 className="m-0 text-xl font-semibold">
          Integrantes · Sección {seccion.numero}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">
          {seccion.curso.codigo} · {seccion.curso.nombre}
        </p>
      </header>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Tipo de integrante"
      >
        {TIPOS.map((tipo) => (
          <Button
            key={tipo.rol}
            type="button"
            variant={rol === tipo.rol ? 'default' : 'outline'}
            aria-pressed={rol === tipo.rol}
            disabled={ocupado}
            onClick={() => cambiarParametros({ rol: tipo.rol })}
          >
            {tipo.nombre} (
            {integrantes.filter((p) => p.rol === tipo.rol).length})
          </Button>
        ))}
      </div>
      <GrupoIntegrantes
        key={rol}
        seccion={seccion}
        rol={rol}
        personas={integrantes.filter((p) => p.rol === rol)}
        alOcupar={setOcupado}
        alRecargar={recargar}
        alCambiar={(persona, agregar) => {
          fijar({
            ...datos,
            integrantes: agregar
              ? [
                  ...integrantes.filter(
                    (p) => p.id !== persona.id || p.rol !== persona.rol,
                  ),
                  persona,
                ]
              : integrantes.filter(
                  (p) => p.id !== persona.id || p.rol !== persona.rol,
                ),
          })
          recargar()
        }}
      />
    </section>
  )
}
function GrupoIntegrantes({
  seccion,
  rol,
  personas,
  alOcupar,
  alRecargar,
  alCambiar,
}: {
  seccion: DatosIntegrantes['seccion']
  rol: RolIntegrante
  personas: PersonaIntegrante[]
  alOcupar: (valor: boolean) => void
  alRecargar: () => void
  alCambiar: (persona: PersonaIntegrante, agregar: boolean) => void
}) {
  const { fetchConSesion } = useAuth()
  const ruta = `/api/secciones/${seccion.id}/integrantes`
  const [busqueda, setBusqueda] = useState('')
  const [consulta, setConsulta] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [quitando, setQuitando] = useState<PersonaIntegrante | null>(null)
  const [csv, setCsv] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  function ocupar(valor: boolean) {
    setOcupado(valor)
    alOcupar(valor)
  }
  async function agregar(persona: PersonaIntegrante) {
    if (ocupado) return
    ocupar(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol, usuarioId: persona.id }),
      })
      if (!res.ok) {
        setError(await mensajeError(res, 'No se pudo agregar al integrante.'))
        if ([400, 404, 409].includes(res.status)) {
          setConsulta(null)
          alRecargar()
        }
        return
      }
      alCambiar(persona, true)
      setConsulta(null)
      setBusqueda('')
      setAviso(`${persona.nombre} agregado a la sección.`)
    } catch {
      setError(
        'No se pudo agregar al integrante. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      ocupar(false)
    }
  }
  const nombre = TIPOS.find((t) => t.rol === rol)!.nombre
  return (
    <>
      <div className="grid min-w-0 gap-4 rounded-xl border bg-card p-4">
        <h3 className="m-0 text-base font-semibold">{nombre}</h3>
        <form
          className="flex flex-wrap items-end gap-3 [&>label]:min-w-0 [&>label]:flex-[1_1_14rem]"
          aria-label="Buscar integrantes"
          onSubmit={(e) => {
            e.preventDefault()
            if (busqueda.trim().length >= 2 && !ocupado) {
              setError(null)
              setAviso(null)
              setConsulta(busqueda.trim())
            }
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium">
            Buscar por correo o nombre
            <Input
              type="search"
              value={busqueda}
              minLength={2}
              maxLength={150}
              required
              disabled={ocupado}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setConsulta(null)
              }}
              placeholder="Escribe al menos dos caracteres"
            />
          </label>
          <Button
            type="submit"
            disabled={ocupado || busqueda.trim().length < 2}
          >
            Buscar
          </Button>
        </form>
        {consulta !== null && (
          <Resultados
            key={consulta}
            ruta={`${ruta}/buscar?rol=${rol}&q=${encodeURIComponent(consulta)}`}
            ocupado={ocupado}
            alAgregar={(persona) => void agregar(persona)}
          />
        )}
        {rol === 'ALUMNO' && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={() => setNuevo(true)}
            >
              Crear alumno e inscribir
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-label={`Cargar CSV en la sección ${seccion.numero}`}
              disabled={ocupado}
              onClick={() => setCsv(true)}
            >
              Cargar CSV
            </Button>
          </div>
        )}
        {rol === 'ALUMNO' ? (
          <p className="m-0 text-sm break-words text-muted-foreground">
            Busca una cuenta existente. Si el alumno aún no tiene cuenta, puedes
            crearla e inscribirlo o usar la carga CSV.
          </p>
        ) : (
          <p className="m-0 text-sm break-words text-muted-foreground">
            Busca una cuenta existente de tu universidad. Si aún no existe,
            créala en{' '}
            <Link
              className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
              to="/docentes"
            >
              Profesores y ayudantes
            </Link>
            .
          </p>
        )}
      </div>
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="m-0 text-sm text-(color:--color-success)" role="status">
          {aviso}
        </p>
      )}
      <div className="min-w-0 rounded-xl border bg-card">
        {personas.length === 0 ? (
          <EmptyState
            titulo={`No hay ${nombre.toLowerCase()} en esta sección.`}
            mensaje="Usa el buscador para agregar integrantes."
          />
        ) : (
          <Table
            className="[&_td]:whitespace-normal [&_td]:break-all"
            aria-label={nombre}
          >
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Nombre</TableHead>
                <TableHead scope="col">Correo</TableHead>
                <TableHead scope="col">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personas.map((persona) => (
                <TableRow key={persona.id}>
                  <TableCell>{persona.nombre}</TableCell>
                  <TableCell>{persona.correo}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={ocupado || quitando !== null}
                      aria-label={`Quitar a ${persona.nombre}`}
                      onClick={() => {
                        setError(null)
                        setAviso(null)
                        setQuitando(persona)
                      }}
                    >
                      Quitar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {quitando && (
        <RetirarIntegrante
          ruta={ruta}
          persona={quitando}
          numero={seccion.numero}
          alOcupar={ocupar}
          alCerrar={() => setQuitando(null)}
          alRecargar={alRecargar}
          alRetirar={() => {
            alCambiar(quitando, false)
            setAviso(`${quitando.nombre} fue quitado de la sección.`)
            setQuitando(null)
          }}
        />
      )}
      {csv && (
        <CargarAlumnosCsvDialogo
          seccionId={seccion.id}
          numero={seccion.numero}
          onCargados={alRecargar}
          onCerrar={() => setCsv(false)}
        />
      )}
      {nuevo && (
        <AgregarAlumnoDialogo
          seccionId={seccion.id}
          numero={seccion.numero}
          correoInicial={busqueda.includes('@') ? busqueda : ''}
          onAgregado={alRecargar}
          onCerrar={() => setNuevo(false)}
        />
      )}
    </>
  )
}
function Resultados({
  ruta,
  ocupado,
  alAgregar,
}: {
  ruta: string
  ocupado: boolean
  alAgregar: (persona: PersonaIntegrante) => void
}) {
  const [datos, recargar] = useDatos<BusquedaIntegrantes>(ruta)
  if (datos === undefined)
    return (
      <div role="status">
        <span className="sr-only">Buscando personas…</span>
        <Skeleton className="h-24 rounded-xl" />
      </div>
    )
  if (datos === null)
    return (
      <ErrorState
        mensaje="No se pudo realizar la búsqueda."
        onReintentar={recargar}
      />
    )
  return (
    <div className="[&_ul]:m-0 [&_ul]:list-none [&_ul]:p-0 [&_li]:flex [&_li]:flex-wrap [&_li]:items-center [&_li]:justify-between [&_li]:gap-2 [&_li]:border-b [&_li]:py-2">
      {datos.personas.length === 0 ? (
        <p role="status">
          No hay personas disponibles que coincidan con la búsqueda.
        </p>
      ) : (
        <ul aria-label="Resultados de búsqueda">
          {datos.personas.map((persona) => (
            <li key={persona.id}>
              <span>
                <strong>{persona.nombre}</strong>
                <span className="block text-xs break-all text-muted-foreground">
                  {persona.correo}
                </span>
              </span>
              <Button
                type="button"
                aria-label={`Agregar a ${persona.nombre}`}
                disabled={ocupado}
                onClick={() => alAgregar(persona)}
              >
                Agregar
              </Button>
            </li>
          ))}
        </ul>
      )}
      {datos.hayMas && (
        <p className="m-0 text-sm break-words text-muted-foreground">
          Hay más coincidencias. Escribe más caracteres para acotar la búsqueda.
        </p>
      )}
    </div>
  )
}
async function mensajeError(res: Response, defecto: string) {
  const cuerpo = (await res.json().catch(() => null)) as {
    message?: unknown
  } | null
  const mensaje = Array.isArray(cuerpo?.message)
    ? cuerpo.message[0]
    : cuerpo?.message
  return res.status < 500 && typeof mensaje === 'string' ? mensaje : defecto
}
function RetirarIntegrante({
  ruta,
  persona,
  numero,
  alOcupar,
  alCerrar,
  alRetirar,
  alRecargar,
}: {
  ruta: string
  persona: PersonaIntegrante
  numero: number
  alOcupar: (valor: boolean) => void
  alCerrar: () => void
  alRetirar: () => void
  alRecargar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const dialogo = useRef<HTMLDialogElement>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    dialogo.current?.showModal()
  }, [])
  async function retirar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (ocupado || !motivo.trim()) return
    setOcupado(true)
    alOcupar(true)
    setError(null)
    try {
      const res = await fetchConSesion(`${ruta}/${persona.id}/quitar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol: persona.rol, motivo: motivo.trim() }),
      })
      if (res.ok) {
        alRetirar()
        return
      }
      setError(await mensajeError(res, 'No se pudo quitar al integrante.'))
      if ([404, 409].includes(res.status)) alRecargar()
    } catch {
      setError('No se pudo quitar al integrante. Inténtalo nuevamente.')
    } finally {
      setOcupado(false)
      alOcupar(false)
    }
  }
  return (
    <dialog
      ref={dialogo}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border bg-card p-5 text-card-foreground shadow-xl backdrop:bg-black/50 [&>*+*]:mt-3"
      aria-labelledby="retirar-integrante-titulo"
      onClose={alCerrar}
      onCancel={(e) => {
        if (ocupado) e.preventDefault()
      }}
    >
      <h3
        id="retirar-integrante-titulo"
        className="m-0 text-base font-semibold"
      >
        Quitar integrante
      </h3>
      <p className="m-0 text-sm break-words text-muted-foreground">
        ¿Quitar a {persona.nombre} ({persona.correo}) de la sección {numero}? Su
        cuenta se conserva y el retiro queda registrado.
      </p>
      <form className="grid gap-4" onSubmit={(e) => void retirar(e)}>
        <label className="grid gap-1.5 text-sm font-medium">
          Motivo
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
            maxLength={LARGO_MOTIVO_ASIGNACION}
            rows={3}
            disabled={ocupado}
          />
        </label>
        {error && (
          <p className="m-0 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={ocupado}
            onClick={alCerrar}
          >
            Cancelar
          </Button>
          <Button
            type="submit"

            disabled={ocupado || !motivo.trim()}
          >
            {ocupado ? 'Quitando…' : 'Quitar'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
