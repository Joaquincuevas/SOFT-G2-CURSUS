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
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type CuentaCreada,
  type CuentaUniversidad,
  type GuardarCuenta,
  LARGO_NOMBRE_USUARIO,
  ROLES_CUENTA,
  type RolCuenta,
  type UniversidadElegible,
} from '@cursus/shared'
import { type FormEvent, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/auth'
import { ROL_LABEL } from '../session/roles'
import { PasswordProvisoria } from './PasswordProvisoria'
import {
  enviar,
  rutaAdministrarUniversidad,
  RUTA_UNIVERSIDADES,
} from './superadmin'
import { useDatos } from './useDatos'

// GES-24: el superadmin crea, edita y archiva cuentas de cualquier rol en una
// universidad. Se llega desde "Administrar universidad" y funciona sin
// universidad elegida. No tiene vista en el Figma: sigue el estilo de Carreras.
export function CuentasUniversidad() {
  const { id = '' } = useParams()
  const [universidades, recargarUniversidades] =
    useDatos<UniversidadElegible[]>(RUTA_UNIVERSIDADES)

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
        onReintentar={recargarUniversidades}
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
  return <Cuentas key={universidad.id} universidad={universidad} />
}

function Cuentas({ universidad }: { universidad: UniversidadElegible }) {
  const { fetchConSesion } = useAuth()
  const ruta = `${RUTA_UNIVERSIDADES}/${universidad.id}/cuentas`
  const [cuentas, recargar] = useDatos<CuentaUniversidad[]>(ruta)
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [editando, setEditando] = useState<CuentaUniversidad | null>(null)
  const [cambio, setCambio] = useState<{
    cuenta: CuentaUniversidad
    accion: 'archivar' | 'egresar'
  } | null>(null)
  const [guardandoCuenta, setGuardandoCuenta] = useState(false)
  const [archivando, setArchivando] = useState(false)
  const [creada, setCreada] = useState<CuentaCreada | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')
  const [rol, setRol] = useState<RolCuenta | ''>('')

  async function guardar(datos: GuardarCuenta): Promise<string | null> {
    setAviso(null)
    if (editando) {
      const resultado = await enviar<CuentaUniversidad>(
        fetchConSesion,
        `${ruta}/${editando.id}`,
        'PATCH',
        datos,
      )
      if (!resultado.ok) return resultado.error
      setAviso(`Cuenta de ${resultado.datos.nombre} guardada`)
      setEditando(null)
    } else {
      const resultado = await enviar<CuentaCreada>(
        fetchConSesion,
        ruta,
        'POST',
        datos,
      )
      if (!resultado.ok) return resultado.error
      setCreada(resultado.datos)
    }
    setFormularioAbierto(false)
    recargar()
    return null
  }

  async function confirmarCambio() {
    if (!cambio) return
    const { cuenta, accion } = cambio
    setArchivando(true)
    setError(null)
    setAviso(null)
    const resultado = await enviar<void>(
      fetchConSesion,
      `${ruta}/${cuenta.id}/${accion}`,
      'PATCH',
    )
    setArchivando(false)
    setCambio(null)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    if (editando?.id === cuenta.id) setEditando(null)
    setAviso(
      accion === 'egresar'
        ? `${cuenta.nombre} figura como egresado`
        : `Cuenta de ${cuenta.nombre} archivada`,
    )
    recargar()
  }

  const texto = buscar.trim().toLowerCase()
  const visibles = (cuentas ?? []).filter(
    (cuenta) =>
      (!rol || cuenta.rol === rol) &&
      (!texto ||
        cuenta.nombre.toLowerCase().includes(texto) ||
        cuenta.correo.includes(texto)),
  )

  return (
    <section
      className="grid min-w-0 gap-5"
      aria-label="Cuentas de la universidad"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 [&_h2]:m-0 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:m-0 [&_p]:mt-1 [&_p]:text-sm [&_p]:text-muted-foreground">
        <div>
          <h2>Cuentas de {universidad.nombre}</h2>
          <p>
            Correos @{universidad.dominioCorreo}. Cada cambio queda registrado.
          </p>
        </div>
        <Link
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'border-border text-foreground no-underline',
          )}
          to={rutaAdministrarUniversidad(universidad.id)}
        >
          Volver a la universidad
        </Link>
      </div>
      {aviso && (
        <p
          className="m-0 rounded-lg border border-alert-success-border bg-alert-success p-3 text-sm text-alert-success-foreground"
          role="status"
        >
          {aviso}
        </p>
      )}
      <div className="min-w-0">
        <div className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>Cuentas vigentes</h2>
            <Button
              onClick={() => {
                setEditando(null)
                setFormularioAbierto(true)
              }}
            >
              Nueva cuenta
            </Button>
          </div>
          {error && (
            <p className="m-0 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 [&_label]:grid [&_label]:gap-2 [&_label]:text-sm [&_label]:font-medium">
            <Label>
              Buscar
              <Input
                type="search"
                value={buscar}
                onChange={(event) => setBuscar(event.target.value)}
                placeholder="Nombre o correo"
              />
            </Label>
            <Label>
              Filtrar por rol
              <NativeSelect
                value={rol}
                onChange={(event) =>
                  setRol(event.target.value as RolCuenta | '')
                }
              >
                <option value="">Todos</option>
                {ROLES_CUENTA.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {ROL_LABEL[opcion]}
                  </option>
                ))}
              </NativeSelect>
            </Label>
          </div>
          {cuentas === null ? (
            <ErrorState
              mensaje="No se pudieron cargar las cuentas."
              onReintentar={recargar}
            />
          ) : (
            <DataTable
              etiqueta={`Cuentas de ${universidad.nombre}`}
              filas={visibles}
              claveFila={(cuenta) => cuenta.id}
              cargando={cuentas === undefined}
              vacio={
                <EmptyState
                  mensaje={
                    cuentas?.length === 0
                      ? 'Esta universidad todavía no tiene cuentas.'
                      : 'Ninguna cuenta coincide con la búsqueda.'
                  }
                />
              }
              columnas={[
                {
                  clave: 'nombre',
                  encabezado: 'Nombre',
                  valor: (cuenta) => cuenta.nombre,
                  celda: (cuenta) => (
                    <div className="grid min-w-0 gap-1">
                      <span className="font-medium">{cuenta.nombre}</span>
                      <span className="break-all text-xs text-muted-foreground sm:hidden">
                        {cuenta.correo}
                      </span>
                      <span className="text-xs text-muted-foreground sm:hidden">
                        Rol:{' '}
                        {cuenta.egresado ? 'Egresado' : ROL_LABEL[cuenta.rol]} ·{' '}
                        {cuenta.facultad?.nombre ?? 'Sin facultad'}
                      </span>
                    </div>
                  ),
                  className: 'whitespace-normal',
                },
                {
                  clave: 'correo',
                  encabezado: 'Correo',
                  valor: (cuenta) => cuenta.correo,
                  celda: (cuenta) => cuenta.correo,
                  className:
                    'hidden min-w-36 whitespace-normal break-all sm:table-cell',
                },
                {
                  clave: 'rol',
                  encabezado: 'Rol',
                  className: 'hidden sm:table-cell',
                  valor: (cuenta) =>
                    cuenta.egresado ? 'Egresado' : ROL_LABEL[cuenta.rol],
                  celda: (cuenta) => (
                    <Badge variant="secondary">
                      {cuenta.egresado ? 'Egresado' : ROL_LABEL[cuenta.rol]}
                    </Badge>
                  ),
                },
                {
                  clave: 'facultad',
                  encabezado: 'Facultad',
                  celda: (cuenta) => cuenta.facultad?.nombre ?? 'Sin facultad',
                  className: 'hidden min-w-24 whitespace-normal sm:table-cell',
                },
                {
                  clave: 'acciones',
                  encabezado: 'Acciones',
                  className: 'w-[6.5rem] sm:w-auto',
                  celda: (cuenta) => (
                    <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:flex-wrap">
                      {cuenta.rol === 'ALUMNO' && !cuenta.egresado && (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Registrar egreso de ${cuenta.nombre}`}
                          onClick={() => {
                            setCambio({ cuenta, accion: 'egresar' })
                            setError(null)
                          }}
                        >
                          Egresar
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Editar ${cuenta.nombre}`}
                        onClick={() => {
                          setEditando(cuenta)
                          setFormularioAbierto(true)
                          setAviso(null)
                        }}
                      >
                        Editar
                      </Button>
                      {!cuenta.egresado && (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Archivar ${cuenta.nombre}`}
                          onClick={() => {
                            setCambio({ cuenta, accion: 'archivar' })
                            setError(null)
                          }}
                        >
                          Archivar
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>
      </div>
      {formularioAbierto && (
        <Dialog
          open
          onOpenChange={(abierto) => {
            if (!abierto && !guardandoCuenta) {
              setFormularioAbierto(false)
              setEditando(null)
            }
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <DialogTitle>
              {editando ? `Editar a ${editando.nombre}` : 'Nueva cuenta'}
            </DialogTitle>
            <DialogDescription>
              Completa los datos de la cuenta institucional.
            </DialogDescription>
            <FormularioCuenta
              universidad={universidad}
              inicial={editando}
              onGuardar={guardar}
              onOcupar={setGuardandoCuenta}
              onCancelar={() => {
                setFormularioAbierto(false)
                setEditando(null)
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {cambio && (
        <ConfirmDialog
          abierto
          onAbiertoChange={(abierto) => {
            if (!abierto) setCambio(null)
          }}
          titulo={
            cambio.accion === 'egresar' ? 'Registrar egreso' : 'Archivar cuenta'
          }
          descripcion={
            cambio.accion === 'egresar'
              ? `${cambio.cuenta.nombre} conservará el acceso a su historial de notas en solo lectura.`
              : `${cambio.cuenta.nombre} dejará de poder iniciar sesión, y sus datos se conservan. Si tiene secciones a cargo, seguirán mostrándola hasta que se asigne a otra persona.`
          }
          destructivo={cambio.accion === 'archivar'}
          cargando={archivando}
          onConfirmar={() => void confirmarCambio()}
        />
      )}
      {creada && (
        <DialogoCuentaCreada creada={creada} onCerrar={() => setCreada(null)} />
      )}
    </section>
  )
}

// Crear o editar una cuenta. La facultad se pide solo para un Administrativo.
function FormularioCuenta({
  universidad,
  inicial,
  onGuardar,
  onOcupar,
  onCancelar,
}: {
  universidad: UniversidadElegible
  inicial: CuentaUniversidad | null
  onGuardar: (datos: GuardarCuenta) => Promise<string | null>
  onOcupar: (ocupado: boolean) => void
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [correo, setCorreo] = useState(inicial?.correo ?? '')
  const [rol, setRol] = useState<RolCuenta>(inicial?.rol ?? 'DIRECTOR')
  const [facultadId, setFacultadId] = useState(inicial?.facultad?.id ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esAdministrativo = rol === 'ADMINISTRATIVO'

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando) return
    setGuardando(true)
    onOcupar(true)
    setError(null)
    const mensaje = await onGuardar({
      nombre: nombre.trim().replace(/\s+/gu, ' '),
      correo: correo.trim(),
      rol,
      ...(esAdministrativo ? { facultadId } : {}),
    })
    onOcupar(false)
    setGuardando(false)
    setError(mensaje)
  }

  return (
    <form
      className="grid min-w-0 gap-3 [&_p]:m-0 [&_p]:text-sm"
      aria-label={inicial ? 'Editar cuenta' : 'Nueva cuenta'}
      onSubmit={(event) => void guardar(event)}
    >
      <Label htmlFor="cuenta-nombre">Nombre</Label>
      <Input
        id="cuenta-nombre"
        value={nombre}
        onChange={(event) => setNombre(event.target.value)}
        maxLength={LARGO_NOMBRE_USUARIO}
        required
        disabled={guardando}
        autoComplete="off"
      />
      <Label htmlFor="cuenta-correo">Correo institucional</Label>
      <Input
        id="cuenta-correo"
        type="email"
        value={correo}
        onChange={(event) => setCorreo(event.target.value)}
        placeholder={`nombre@${universidad.dominioCorreo}`}
        required
        disabled={guardando}
        autoComplete="off"
      />
      <Label htmlFor="cuenta-rol">Rol</Label>
      <NativeSelect
        id="cuenta-rol"
        className="w-full"
        value={rol}
        onChange={(event) => setRol(event.target.value as RolCuenta)}
        disabled={guardando || inicial?.egresado}
      >
        {ROLES_CUENTA.map((opcion) => (
          <option key={opcion} value={opcion}>
            {ROL_LABEL[opcion]}
          </option>
        ))}
      </NativeSelect>
      {esAdministrativo && (
        <>
          <Label htmlFor="cuenta-facultad">Facultad</Label>
          <NativeSelect
            id="cuenta-facultad"
            className="w-full"
            value={facultadId}
            onChange={(event) => setFacultadId(event.target.value)}
            required
            disabled={guardando}
          >
            <option value="" disabled>
              Selecciona una facultad
            </option>
            {universidad.facultades.map((facultad) => (
              <option key={facultad.id} value={facultad.id}>
                {facultad.nombre}
              </option>
            ))}
          </NativeSelect>
          {universidad.facultades.length === 0 && (
            <p>Primero crea una facultad en esta universidad.</p>
          )}
        </>
      )}
      <p>
        {inicial
          ? 'Si cambias el rol, se cerrarán sus sesiones abiertas.'
          : 'Recibirá una contraseña provisoria, que deberá cambiar al entrar.'}
      </p>
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={guardando}>
          {inicial ? 'Guardar cambios' : 'Crear cuenta'}
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={guardando}
          onClick={onCancelar}
        >
          {inicial ? 'Cancelar edición' : 'Cancelar'}
        </Button>
      </div>
    </form>
  )
}

// La contraseña provisoria se muestra una sola vez: se descarta del estado al
// cerrar el diálogo.
function DialogoCuentaCreada({
  creada,
  onCerrar,
}: {
  creada: CuentaCreada
  onCerrar: () => void
}) {
  const { cuenta, passwordProvisoria } = creada

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar()
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <DialogTitle>Cuenta de {ROL_LABEL[cuenta.rol]} creada</DialogTitle>
        <PasswordProvisoria
          nombre={cuenta.nombre}
          correo={cuenta.correo}
          password={passwordProvisoria}
          destinatario="a esa persona"
          onCerrar={onCerrar}
        />
      </DialogContent>
    </Dialog>
  )
}
