import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Toaster } from '@/components/ui/sonner'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// UIX-01: cada componente de shadcn se monta y se usa en jsdom sin que React ni
// Radix escriban un warning o un error en la consola (por ejemplo, un diálogo
// sin título o sin descripción, o una actualización fuera de act()).
let error: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  const escritos = [...error.mock.calls, ...warn.mock.calls]
  error.mockRestore()
  warn.mockRestore()
  expect(escritos).toEqual([])
})

describe('formulario', () => {
  test('Button: variantes, tamaños, clic y deshabilitado', () => {
    const alClic = vi.fn()
    render(
      <>
        {(
          [
            'default',
            'destructive',
            'outline',
            'secondary',
            'ghost',
            'link',
          ] as const
        ).map((variante) => (
          <Button key={variante} variant={variante} onClick={alClic}>
            {variante}
          </Button>
        ))}
        <Button size="sm">Pequeño</Button>
        <Button size="icon" aria-label="Cerrar">
          x
        </Button>
        <Button disabled>Deshabilitado</Button>
        <Button asChild>
          <a href="/curso">Enlace</a>
        </Button>
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'default' }))
    expect(alClic).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Deshabilitado' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Enlace' })).toHaveAttribute(
      'data-slot',
      'button',
    )
  })

  test('Input, Label y Textarea', () => {
    render(
      <>
        <Label htmlFor="correo">Correo</Label>
        <Input id="correo" type="email" defaultValue="a@b.cl" />
        <Label htmlFor="nota">Comentario</Label>
        <Textarea id="nota" />
      </>,
    )
    expect(screen.getByLabelText('Correo')).toHaveValue('a@b.cl')
    fireEvent.change(screen.getByLabelText('Comentario'), {
      target: { value: 'Hola' },
    })
    expect(screen.getByLabelText('Comentario')).toHaveValue('Hola')
  })

  test('NativeSelect sigue siendo un <select>: combobox, opciones y cambio', () => {
    const alCambiar = vi.fn()
    render(
      <>
        <Label htmlFor="periodo">Período</Label>
        <NativeSelect id="periodo" defaultValue="" onChange={alCambiar}>
          <NativeSelectOption value="">Todos</NativeSelectOption>
          <NativeSelectOptGroup label="2026">
            <NativeSelectOption value="2026-1">2026-1</NativeSelectOption>
            <NativeSelectOption value="2026-2">2026-2</NativeSelectOption>
          </NativeSelectOptGroup>
        </NativeSelect>
      </>,
    )
    const select = screen.getByRole('combobox', { name: 'Período' })
    expect(select.tagName).toBe('SELECT')
    expect(within(select).getAllByRole('option')).toHaveLength(3)
    fireEvent.change(select, { target: { value: '2026-2' } })
    expect(select).toHaveValue('2026-2')
    expect(alCambiar).toHaveBeenCalledTimes(1)
  })

  test('Checkbox y Switch cambian de estado', () => {
    render(
      <>
        <Checkbox aria-label="Acepto" />
        <Switch aria-label="Notificaciones" />
      </>,
    )
    const casilla = screen.getByRole('checkbox', { name: 'Acepto' })
    expect(casilla).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(casilla)
    expect(casilla).toHaveAttribute('aria-checked', 'true')
    const interruptor = screen.getByRole('switch', { name: 'Notificaciones' })
    fireEvent.click(interruptor)
    expect(interruptor).toHaveAttribute('aria-checked', 'true')
  })
})

describe('contenido', () => {
  test('Card, Badge, Separator, Skeleton, Avatar y Table', () => {
    render(
      <>
        <Card>
          <CardHeader>
            <CardTitle>Cálculo I</CardTitle>
            <CardDescription>Sección 1</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">Vigente</Badge>
          </CardContent>
          <CardFooter>Pie</CardFooter>
        </Card>
        <Separator />
        <Skeleton data-testid="cargando" />
        <Avatar>
          <AvatarFallback>CR</AvatarFallback>
        </Avatar>
        <Table>
          <TableCaption>Alumnos</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Ana</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </>,
    )
    expect(screen.getByText('Cálculo I')).toBeInTheDocument()
    expect(screen.getByText('Vigente')).toHaveAttribute('data-slot', 'badge')
    expect(screen.getByText('CR')).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Nombre' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Ana' })).toBeInTheDocument()
    expect(screen.getByTestId('cargando')).toHaveAttribute(
      'data-slot',
      'skeleton',
    )
  })

  test('Breadcrumb marca la página actual', () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Inicio</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Notas</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    )
    expect(
      screen.getByRole('navigation', { name: 'breadcrumb' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Notas')).toHaveAttribute('aria-current', 'page')
  })

  test('Tabs muestra el panel de la pestaña elegida', () => {
    render(
      <Tabs defaultValue="material">
        <TabsList>
          <TabsTrigger value="material">Material</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
        </TabsList>
        <TabsContent value="material">Archivos</TabsContent>
        <TabsContent value="notas">Calificaciones</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole('tab', { name: 'Material' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Notas' }))
    expect(screen.getByRole('tab', { name: 'Notas' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('Calificaciones')).toBeVisible()
  })
})

describe('alertas suaves', () => {
  const VARIANTES = ['success', 'danger', 'warning', 'info', 'accent'] as const

  test.each(VARIANTES)(
    '%s usa los tokens de su estado y su enlace va en negrita y subrayado',
    (variante) => {
      render(
        <Alert variant={variante}>
          <AlertTitle>Título</AlertTitle>
          <AlertDescription>
            Texto <a href="/ayuda">con enlace</a>
          </AlertDescription>
        </Alert>,
      )
      const alerta = screen.getByText('Título').closest('[data-slot=alert]')!
      expect(alerta).toHaveAttribute('data-variant', variante)
      for (const clase of [
        `bg-alert-${variante}`,
        `border-alert-${variante}-border`,
        `text-alert-${variante}-foreground`,
        '[&_a]:alert-link',
      ]) {
        expect(alerta.className.split(' ')).toContain(clase)
      }
    },
  )

  test('danger y warning interrumpen (alert); el resto se anuncia sin interrumpir (status)', () => {
    render(
      <>
        {VARIANTES.map((v) => (
          <Alert key={v} variant={v} data-testid={v}>
            {v}
          </Alert>
        ))}
        <Alert data-testid="default">neutra</Alert>
      </>,
    )
    expect(screen.getByTestId('danger')).toHaveAttribute('role', 'alert')
    expect(screen.getByTestId('warning')).toHaveAttribute('role', 'alert')
    for (const v of ['success', 'info', 'accent', 'default']) {
      expect(screen.getByTestId(v)).toHaveAttribute('role', 'status')
    }
  })

  test('la alerta neutra no usa los tokens de ningún estado', () => {
    render(<Alert data-testid="neutra">x</Alert>)
    expect(screen.getByTestId('neutra').className).not.toMatch(
      /alert-(success|danger|warning|info|accent)/,
    )
  })
})

describe('superficies', () => {
  test('Dialog se abre con título y descripción', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archivar curso</DialogTitle>
            <DialogDescription>
              Esta acción se puede revertir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button>Archivar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )
    const dialogo = screen.getByRole('dialog', { name: 'Archivar curso' })
    expect(dialogo).toHaveAccessibleDescription(
      'Esta acción se puede revertir.',
    )
    expect(
      within(dialogo).getByRole('button', { name: 'Cerrar' }),
    ).toBeInTheDocument()
  })

  test('Sheet se abre desde el lado con título y descripción', () => {
    render(
      <Sheet open>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Menú</SheetTitle>
            <SheetDescription>Navegación principal</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Menú' })).toBeInTheDocument()
  })

  test('DropdownMenu muestra sus ítems y ejecuta el elegido', () => {
    const alElegir = vi.fn()
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <Button>Cuenta</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Camila Rojas</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={alElegir}>Cerrar sesión</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))
    expect(alElegir).toHaveBeenCalledTimes(1)
  })

  test('Tooltip muestra su contenido', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button size="icon" aria-label="Notas">
              N
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver notas</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ver notas')
  })

  test('Toaster muestra un aviso', async () => {
    render(<Toaster />)
    toast('Cambios guardados')
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
  })
})
