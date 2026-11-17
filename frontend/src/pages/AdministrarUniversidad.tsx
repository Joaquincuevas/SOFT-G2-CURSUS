import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
} from '@/components/shared'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  colorConContraste,
  type CrearUniversidad,
  type FacultadElegible,
  LARGO_MOTIVO_ARCHIVAR,
  LARGO_NOMBRE_FACULTAD,
  type UniversidadElegible,
  type UsuariosAfectados,
} from '@cursus/shared'
import { type FormEvent, useState } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router'
import { useAuth } from '../auth/auth'
import { pedirUsuario, useSession } from '../session/session'
import { FormularioUniversidad } from './FormularioUniversidad'
import { CuentasUniversidad } from './CuentasUniversidad'
import {
  enviar,
  RUTA_UNIVERSIDADES,
  rutaCuentasUniversidad,
} from './superadmin'
import { useDatos } from './useDatos'
import { useMigas } from '../layout/migas-contexto'

// GES-23: el superadmin edita los datos de una universidad, la archiva y
// administra sus facultades. Se llega desde el Dashboard ("Administrar") y
// funciona sin universidad elegida. No tiene vista en el Figma: sigue el
// estilo de Carreras.
export function AdministrarUniversidad() {
  const { id } = useParams()
  const { fetchConSesion } = useAuth()
  const { user, reemplazarUsuario } = useSession()
  const [universidades, recargar] =
    useDatos<UniversidadElegible[]>(RUTA_UNIVERSIDADES)
  useMigas(
    universidades === undefined
      ? null
      : [
          {
            etiqueta:
              universidades?.find((u) => u.id === id)?.nombre ?? 'Universidad',
          },
        ],
  )
  const [aviso, setAviso] = useState<string | null>(null)

  if (universidades === undefined)
    return (
      <div role="status">
        <span className="sr-only">Cargando universidad…</span>
        <Skeleton className="h-36 rounded-xl" />
      </div>
    )
  if (universidades === null) {
    return (
      <ErrorState
        mensaje="No se pudo cargar la universidad."
        onReintentar={recargar}
      />
    )
  }
  const universidad = universidades.find((u) => u.id === id)
  if (!universidad) {
    return (
      <section
        className="grid w-fit gap-3 rounded-xl border border-border bg-card p-4"
        role="status"
      >
        <h2 className="m-0 text-base font-semibold">
          Universidad no disponible
        </h2>
        <p className="m-0 text-sm text-muted-foreground">
          La universidad no existe o está archivada.
        </p>
        <Link
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'border-border text-foreground no-underline',
          )}
          to="/"
        >
          Volver al Dashboard
        </Link>
      </section>
    )
  }

  async function guardarDatos(datos: CrearUniversidad): Promise<string | null> {
    const resultado = await enviar<UniversidadElegible>(
      fetchConSesion,
      `${RUTA_UNIVERSIDADES}/${universidad?.id}`,
      'PATCH',
      datos,
    )
    if (!resultado.ok) return resultado.error
    // UI-04: si está trabajando en esta universidad, el cambio de color se
    // ve de inmediato. Las sesiones de otros usuarios lo leen al recargar.
    if (user.universidadId === resultado.datos.id) {
      reemplazarUsuario({
        ...user,
        universidadNombre: resultado.datos.nombre,
        universidadColor: resultado.datos.color,
      })
    }
    setAviso('Datos de la universidad guardados')
    recargar()
    return null
  }

  return (
    <section
      className="grid min-w-0 gap-5"
      aria-label="Administrar universidad"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 [&_h2]:m-0 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:m-0 [&_p]:mt-1 [&_p]:text-sm [&_p]:text-muted-foreground">
        <div>
          <h2>{universidad.nombre}</h2>
          <p>
            Correos @{universidad.dominioCorreo}. Cada cambio queda registrado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'border-border text-foreground no-underline',
            )}
            to={rutaCuentasUniversidad(universidad.id)}
          >
            Administrar cuentas
          </Link>
          <Link
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'border-border text-foreground no-underline',
            )}
            to="/"
          >
            Volver al Dashboard
          </Link>
        </div>
      </div>
      {aviso && (
        <p
          className="m-0 rounded-lg border border-alert-success-border bg-alert-success p-3 text-sm text-alert-success-foreground"
          role="status"
        >
          {aviso}
        </p>
      )}
      {!colorConContraste(universidad.color) && (
        <p
          className="m-0 rounded-lg border border-alert-success-border bg-alert-success p-3 text-sm text-alert-success-foreground"
          role="status"
          aria-label="Color institucional"
        >
          El color guardado no tiene contraste suficiente. Las sesiones de esta
          universidad usan el tema de CURSUS como respaldo. Elige un color más
          oscuro en Datos de la universidad.
        </p>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Facultades
          universidad={universidad}
          onCambio={(mensaje) => {
            setAviso(mensaje)
            recargar()
          }}
        />
        <div className="grid min-w-0 gap-4">
          <FormularioUniversidad
            key={`${universidad.nombre}-${universidad.dominioCorreo}-${universidad.color}`}
            inicial={universidad}
            titulo="Datos de la universidad"
            textoBoton="Guardar cambios"
            onGuardar={guardarDatos}
          />
          <ArchivarUniversidad universidad={universidad} />
        </div>
      </div>
    </section>
  )
}

// Archivar corta a todos sus usuarios y no se deshace por la API: antes de
// confirmar muestra a cuántos afecta y pide el motivo, que queda en
// superadmin_cambio.
function ArchivarUniversidad({
  universidad,
}: {
  universidad: UniversidadElegible
}) {
  const { fetchConSesion } = useAuth()
  const { user, reemplazarUsuario } = useSession()
  const navigate = useNavigate()
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [archivando, setArchivando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [afectados, recargarAfectados] = useDatos<UsuariosAfectados>(
    confirmando
      ? `${RUTA_UNIVERSIDADES}/${universidad.id}/usuarios-afectados`
      : null,
  )

  function cancelar() {
    setConfirmando(false)
    setMotivo('')
    setError(null)
  }

  async function archivar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setArchivando(true)
    setError(null)
    const resultado = await enviar<void>(
      fetchConSesion,
      `${RUTA_UNIVERSIDADES}/${universidad.id}/archivar`,
      'PATCH',
      { motivo: motivo.trim() },
    )
    if (!resultado.ok) {
      setArchivando(false)
      setError(resultado.error)
      return
    }
    // Si trabajaba en ella, su elección dejó de valer: se pide la sesión de
    // nuevo para que la barra muestre la vista global.
    if (user.universidadId === universidad.id) {
      const nuevo = await pedirUsuario(fetchConSesion)
      if (nuevo) reemplazarUsuario(nuevo)
    }
    void navigate('/')
  }

  return (
    <div className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold">
      <h2>Archivar universidad</h2>
      <p>
        Deja de aparecer en las listas y sus usuarios ya no pueden iniciar
        sesión. Sus datos se conservan, pero no se puede deshacer desde CURSUS.
      </p>
      {!confirmando ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmando(true)}
        >
          Archivar universidad
        </Button>
      ) : (
        <Dialog
          open
          onOpenChange={(abierto) => {
            if (!abierto && !archivando) cancelar()
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <DialogTitle>Archivar {universidad.nombre}</DialogTitle>
            <DialogDescription>
              Revisa a cuántos usuarios afecta antes de confirmar.
            </DialogDescription>
            <form
              className="grid min-w-0 gap-3 [&_p]:m-0 [&_p]:text-sm"
              aria-label="Confirmar archivo"
              onSubmit={(event) => void archivar(event)}
            >
              {afectados === undefined && (
                <p role="status">Contando usuarios…</p>
              )}
              {afectados === null && (
                <p className="m-0 text-sm text-destructive" role="alert">
                  No se pudo contar a sus usuarios.{' '}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={recargarAfectados}
                  >
                    Reintentar
                  </Button>
                </p>
              )}
              {afectados && (
                <p
                  className="m-0 rounded-lg bg-accent p-3 text-sm font-medium"
                  role="status"
                >
                  {afectados.usuarios === 1
                    ? '1 usuario dejará de poder iniciar sesión.'
                    : `${afectados.usuarios} usuarios dejarán de poder iniciar sesión.`}
                </p>
              )}
              <Label htmlFor="archivar-motivo">Motivo</Label>
              <Textarea
                id="archivar-motivo"
                className="min-h-20"
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                maxLength={LARGO_MOTIVO_ARCHIVAR}
                rows={3}
                required
                disabled={archivando}
                placeholder="Por ejemplo: la universidad dejó el directorio"
              />
              <p>El motivo queda registrado con la fecha y tu nombre.</p>
              {error && (
                <p className="m-0 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={archivando || !afectados || !motivo.trim()}
                >
                  Sí, archivar {universidad.nombre}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={archivando}
                  onClick={cancelar}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// Facultades vigentes de la universidad: crear, renombrar y archivar.
function Facultades({
  universidad,
  onCambio,
}: {
  universidad: UniversidadElegible
  onCambio: (mensaje: string) => void
}) {
  const { fetchConSesion } = useAuth()
  const [nombre, setNombre] = useState('')
  const [editando, setEditando] = useState<FacultadElegible | null>(null)
  const [porArchivar, setPorArchivar] = useState<FacultadElegible | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function limpiar() {
    setNombre('')
    setEditando(null)
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setError(null)
    const resultado = await enviar<FacultadElegible>(
      fetchConSesion,
      editando
        ? `/api/superadmin/facultades/${editando.id}`
        : `${RUTA_UNIVERSIDADES}/${universidad.id}/facultades`,
      editando ? 'PATCH' : 'POST',
      { nombre: nombre.trim().replace(/\s+/gu, ' ') },
    )
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    onCambio(editando ? 'Facultad guardada' : 'Facultad creada')
    limpiar()
  }

  async function archivar(facultad: FacultadElegible) {
    setGuardando(true)
    setError(null)
    const resultado = await enviar<void>(
      fetchConSesion,
      `/api/superadmin/facultades/${facultad.id}/archivar`,
      'PATCH',
    )
    setGuardando(false)
    setPorArchivar(null)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    onCambio(`${facultad.nombre} archivada`)
  }

  return (
    <div className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold">
      <h2>Facultades</h2>
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <DataTable
        etiqueta={`Facultades de ${universidad.nombre}`}
        filas={universidad.facultades}
        claveFila={(facultad) => facultad.id}
        vacio={
          <EmptyState mensaje="Esta universidad todavía no tiene facultades." />
        }
        columnas={[
          {
            clave: 'nombre',
            encabezado: 'Nombre',
            valor: (facultad) => facultad.nombre,
            celda: (facultad) => facultad.nombre,
            className: 'min-w-24 whitespace-normal',
          },
          {
            clave: 'acciones',
            encabezado: 'Acciones',
            celda: (facultad) => (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={guardando}
                  aria-label={`Editar ${facultad.nombre}`}
                  onClick={() => {
                    setEditando(facultad)
                    setNombre(facultad.nombre)
                    setError(null)
                  }}
                >
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={guardando}
                  aria-label={`Archivar ${facultad.nombre}`}
                  onClick={() => {
                    setPorArchivar(facultad)
                    setError(null)
                  }}
                >
                  Archivar
                </Button>
              </div>
            ),
          },
        ]}
      />
      {porArchivar && (
        <ConfirmDialog
          abierto
          onAbiertoChange={(abierto) => {
            if (!abierto) setPorArchivar(null)
          }}
          titulo="Archivar facultad"
          descripcion={`¿Archivar ${porArchivar.nombre}?`}
          destructivo
          cargando={guardando}
          onConfirmar={() => void archivar(porArchivar)}
        />
      )}
      <form
        className="grid min-w-0 gap-3 [&_p]:m-0 [&_p]:text-sm"
        aria-label={editando ? 'Editar facultad' : 'Nueva facultad'}
        onSubmit={(event) => void guardar(event)}
      >
        <Label htmlFor="facultad-nombre">
          {editando ? 'Nuevo nombre de la facultad' : 'Nueva facultad'}
        </Label>
        <Input
          id="facultad-nombre"
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
          maxLength={LARGO_NOMBRE_FACULTAD}
          required
          disabled={guardando}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={guardando}>
            {editando ? 'Guardar facultad' : 'Crear facultad'}
          </Button>
          {editando && (
            <Button
              variant="outline"
              type="button"
              disabled={guardando}
              onClick={limpiar}
            >
              Cancelar edición
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

// Subrutas de /superadmin: administrar una universidad y sus cuentas.
export function RutasSuperadmin() {
  return (
    <Routes>
      <Route path="universidades/:id" element={<AdministrarUniversidad />} />
      <Route
        path="universidades/:id/cuentas"
        element={<CuentasUniversidad />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
