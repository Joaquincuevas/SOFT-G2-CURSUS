import type {
  CrearUniversidad,
  ElegirContexto,
  UniversidadElegible,
  UsuarioSesion,
} from '@cursus/shared'
import { Building2, CircleAlert, CircleCheck, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { EmptyState, ErrorState, PageHeader } from '@/components/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '../session/session'
import { FormularioUniversidad } from './FormularioUniversidad'
import {
  enviar,
  RUTA_UNIVERSIDADES,
  rutaAdministrarUniversidad,
  rutaCuentasUniversidad,
} from './superadmin'
import { useDatos } from './useDatos'

// MT-04: Dashboard del superadmin. Muestra las universidades con sus
// facultades; al elegir una facultad, la app pasa a trabajar en ella con las
// vistas del Administrativo. Desde aquí crea universidades y entra a
// administrar cada una y sus cuentas (GES-23, GES-24). No tiene vista en el
// Figma: usa las mismas cards que el resto del Dashboard.
export function PanelSuperadmin() {
  const { fetchConSesion } = useAuth()
  const { user, reemplazarUsuario } = useSession()
  const navigate = useNavigate()
  const [universidades, recargar] =
    useDatos<UniversidadElegible[]>(RUTA_UNIVERSIDADES)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  if (universidades === undefined) {
    return (
      <div role="status" className="grid gap-4">
        <span className="sr-only">Cargando las universidades…</span>
        <Skeleton className="h-14 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    )
  }
  if (universidades === null) {
    return (
      <ErrorState
        mensaje="No se pudieron cargar las universidades."
        onReintentar={recargar}
      />
    )
  }

  async function elegir(eleccion: ElegirContexto) {
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion('/api/superadmin/contexto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eleccion),
      })
      if (respuesta.ok) {
        reemplazarUsuario((await respuesta.json()) as UsuarioSesion)
        void navigate('/cursos')
        return
      }
      setError(
        respuesta.status === 404
          ? 'Esa facultad ya no está disponible. Recarga la página y elige otra.'
          : 'No se pudo entrar a la facultad.',
      )
    } catch {
      setError('No se pudo entrar a la facultad.')
    }
    setEnviando(false)
  }

  async function crear(datos: CrearUniversidad): Promise<string | null> {
    const resultado = await enviar<UniversidadElegible>(
      fetchConSesion,
      RUTA_UNIVERSIDADES,
      'POST',
      datos,
    )
    if (!resultado.ok) return resultado.error
    setCreando(false)
    setAviso(`${resultado.datos.nombre} creada`)
    recargar()
    return null
  }

  // La sesión trae el nombre de la facultad elegida, no su id.
  const esLaActual = (universidadId: string, facultad: string) =>
    user.universidadId === universidadId && user.facultadNombre === facultad

  const nFacultades = universidades.reduce(
    (total, u) => total + u.facultades.length,
    0,
  )
  const resumen = `${plural(universidades.length, 'universidad', 'universidades')} y ${plural(nFacultades, 'facultad', 'facultades')}.`

  const nueva = (
    <Button
      type="button"
      onClick={() => {
        setCreando(true)
        setAviso(null)
      }}
    >
      <Plus aria-hidden="true" />
      Nueva universidad
    </Button>
  )

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        titulo="Universidades"
        descripcion={
          <>
            Elige una facultad para trabajar en ella con las vistas del
            Administrativo. Cada cambio que hagas queda registrado.{' '}
            <span className="whitespace-nowrap">{resumen}</span>
          </>
        }
        acciones={!creando && nueva}
      />
      {aviso && (
        <Alert variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}
      {creando && (
        <FormularioUniversidad
          titulo="Nueva universidad"
          textoBoton="Crear universidad"
          onGuardar={crear}
          onCancelar={() => setCreando(false)}
        />
      )}
      {error && (
        <Alert variant="danger">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {universidades.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icono={Building2}
            titulo="Todavía no hay universidades"
            mensaje="Crea la primera para poder elegir una facultad y trabajar en ella."
            accion={!creando && nueva}
          />
        </Card>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {universidades.map((universidad) => (
            <li key={universidad.id} className="min-w-0">
              <Card
                role="region"
                aria-label={universidad.nombre}
                className="h-full gap-4 p-5"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="size-8 shrink-0 rounded-full border border-border"
                    style={{ background: universidad.color }}
                    aria-hidden="true"
                  />
                  <div className="grid min-w-0">
                    <h3 className="m-0 text-base leading-6 font-semibold break-words text-foreground">
                      {universidad.nombre}
                    </h3>
                    <p className="m-0 text-sm break-all text-muted-foreground">
                      @{universidad.dominioCorreo}
                    </p>
                  </div>
                </div>
                {universidad.facultades.length === 0 ? (
                  <p className="m-0 text-sm text-muted-foreground">
                    Esta universidad no tiene facultades.
                  </p>
                ) : (
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {universidad.facultades.map((facultad) => (
                      <li key={facultad.id}>
                        {esLaActual(universidad.id, facultad.nombre) ? (
                          <p className="m-0 flex min-h-11 items-center justify-between gap-2 rounded-md border border-primary bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
                            {facultad.nombre}
                            <Badge className="shrink-0 bg-primary text-primary-foreground">
                              Trabajando aquí
                            </Badge>
                          </p>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-auto min-h-11 w-full justify-start px-4 py-2 text-left font-normal whitespace-normal"
                            disabled={enviando}
                            aria-label={`Trabajar en ${facultad.nombre}, ${universidad.nombre}`}
                            onClick={() =>
                              void elegir({
                                universidadId: universidad.id,
                                facultadId: facultad.id,
                              })
                            }
                          >
                            {facultad.nombre}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button asChild variant="outline" size="sm">
                    <Link
                      to={rutaAdministrarUniversidad(universidad.id)}
                      aria-label={`Administrar ${universidad.nombre}`}
                    >
                      Administrar
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      to={rutaCuentasUniversidad(universidad.id)}
                      aria-label={`Cuentas de ${universidad.nombre}`}
                    >
                      Cuentas
                    </Link>
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const plural = (n: number, singular: string, pluralTexto: string) =>
  `${n} ${n === 1 ? singular : pluralTexto}`
