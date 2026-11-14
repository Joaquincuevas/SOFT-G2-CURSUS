import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useAuth } from '../auth/auth'
import { ROL_LABEL } from '../session/roles'
import { useSession } from '../session/session'
import { iniciales } from './iniciales'
import { SOBRE_COLOR } from './sobre-color'

// Cada fila del panel: 44 px de alto como mínimo para el dedo. Al enfocar o
// pasar el mouse toma el tinte de la universidad (--accent, con su texto
// oscuro); con el teclado suma un aro dentro de la fila.
const FILA =
  'min-h-11 gap-3 px-3 text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[variant=destructive]:focus-visible:ring-destructive'

// Menú de la cuenta, en el encabezado: quién es la persona, el perfil (PER-01)
// y Cerrar sesión, aparte y en el color de peligro. El egresado no tiene
// perfil: solo puede ver su historial.
export function MenuUsuario() {
  const { user } = useSession()
  const { cerrarSesion } = useAuth()
  const rol = user.egresado ? 'Egresado' : ROL_LABEL[user.rol]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            'group h-auto min-h-11 min-w-11 gap-2 px-2 py-1.5 data-[state=open]:bg-(color:--color-primary-dark)',
            SOBRE_COLOR,
          )}
        >
          <Avatar className="size-9">
            <AvatarFallback
              aria-hidden="true"
              className="bg-accent text-[13px] font-semibold text-accent-foreground"
            >
              {iniciales(user.nombre)}
            </AvatarFallback>
          </Avatar>
          {/* Bajo 768 px quedan el avatar y el chevron; el nombre sigue siendo
              el nombre accesible del botón. */}
          <span className="grid min-w-0 text-left max-md:sr-only">
            <span
              title={user.nombre}
              className="max-w-40 truncate text-sm leading-5 font-medium"
            >
              {user.nombre}
            </span>
            <span className="text-xs leading-[18px] font-normal">{rol}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={8}
        className="max-w-[min(22rem,calc(100vw-1rem))] min-w-70 overflow-hidden p-0 shadow-lg motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none"
      >
        {/* Cabecera con un 8 % del color de la universidad (con --primary del
            tema; el Director conserva el azul de CURSUS). */}
        <DropdownMenuLabel className="flex items-start gap-3 bg-[color-mix(in_srgb,var(--color-primary)_8%,#fff)] p-4 font-normal">
          <Avatar className="size-10 shrink-0">
            <AvatarFallback
              aria-hidden="true"
              className="bg-primary text-sm font-semibold text-primary-foreground"
            >
              {iniciales(user.nombre)}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 justify-items-start gap-1.5">
            <span className="text-sm leading-5 font-semibold break-words text-foreground">
              {user.nombre}
            </span>
            <span className="text-xs leading-4 break-all text-muted-foreground">
              {user.correo}
            </span>
            <Badge variant="outline" className="bg-card">
              {rol}
            </Badge>
            <span className="flex items-center gap-1.5 text-xs leading-4 text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-primary"
              />
              {user.universidadNombre}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        {!user.egresado && (
          <>
            <DropdownMenuGroup className="p-1">
              <DropdownMenuItem asChild className={FILA}>
                <Link to="/perfil">
                  <UserRound />
                  Mi perfil
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="m-0" />
          </>
        )}
        <DropdownMenuGroup className="p-1">
          <DropdownMenuItem
            variant="destructive"
            className={FILA}
            onSelect={() => void cerrarSesion()}
          >
            <LogOut />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
