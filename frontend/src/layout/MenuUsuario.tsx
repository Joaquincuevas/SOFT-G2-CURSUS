import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '../auth/auth'
import { ROL_LABEL } from '../session/roles'
import { useSession } from '../session/session'
import { iniciales } from './iniciales'

// Menú de la cuenta, en el encabezado: nombre y rol, el perfil (PER-01) y
// Cerrar sesión. El egresado no tiene perfil: solo puede ver su historial.
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
          className="h-auto gap-2.5 px-2 py-1.5 data-[state=open]:bg-muted"
        >
          <Avatar className="size-9">
            <AvatarFallback
              aria-hidden="true"
              className="bg-accent text-[13px] font-semibold text-accent-foreground"
            >
              {iniciales(user.nombre)}
            </AvatarFallback>
          </Avatar>
          {/* En pantallas angostas queda solo el avatar; el nombre sigue siendo
              el nombre accesible del botón. */}
          <span className="grid min-w-0 text-left max-sm:sr-only">
            <span className="max-w-40 truncate text-sm leading-5 font-medium text-foreground">
              {user.nombre}
            </span>
            <span className="text-xs leading-[18px] font-normal text-muted-foreground">
              {rol}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="text-muted-foreground max-sm:hidden"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="truncate font-semibold text-foreground">
            {user.nombre}
          </span>
          <span className="text-xs text-muted-foreground">{rol}</span>
          <span className="truncate text-xs text-muted-foreground">
            {user.universidadNombre}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!user.egresado && (
          <DropdownMenuItem asChild>
            <Link to="/perfil">
              <UserRound />
              Mi perfil
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void cerrarSesion()}>
          <LogOut />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
