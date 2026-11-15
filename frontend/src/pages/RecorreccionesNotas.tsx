import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  LARGO_MOTIVO_NOTA,
  MENSAJES_NOTA_INVALIDA,
  motivoNotaInvalida,
  type NotaAlumno,
  type NotasEvaluacion,
  type RecorregirNota,
} from '@cursus/shared'
import { useId, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'

const formato = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function RecorreccionesNotas({
  ruta,
  alumnos,
  editable = true,
  alGuardar,
  alRecargar,
}: {
  ruta: string
  alumnos: NotaAlumno[]
  editable?: boolean
  alGuardar: (notas: NotasEvaluacion) => void
  alRecargar: () => void
}) {
  const [elegido, setElegido] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const alumno = alumnos.find((a) => a.id === elegido)
  return (
    <>
      <div className="min-w-0 rounded-xl border bg-card">
        <Table
          className="[&_td]:whitespace-normal [&_th]:whitespace-normal"
          aria-label="Notas publicadas"
        >
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Alumno</TableHead>
              <TableHead scope="col">Nota</TableHead>
              <TableHead scope="col">Estado</TableHead>
              {editable && <TableHead scope="col">Recorrección</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {alumnos.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.nombre}</TableCell>
                <TableCell>
                  {a.nota === null ? 'Sin nota' : formato.format(a.nota)}
                </TableCell>
                <TableCell>
                  {a.estado === 'PUBLICADA' ? 'Publicada' : 'Sin publicar'}
                  {a.recorregida && (
                    <span className="ml-2 inline-flex rounded-full border px-2 py-0.5 text-xs text-primary">
                      Recorregida
                    </span>
                  )}
                </TableCell>
                {editable && (
                  <TableCell>
                    {a.estado === 'PUBLICADA' && a.nota !== null && (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto justify-start px-0 py-1 whitespace-normal text-left"
                        aria-label={`Recorregir nota de ${a.nombre}`}
                        disabled={elegido !== null}
                        onClick={() => {
                          setAviso(null)
                          setElegido(a.id)
                        }}
                      >
                        Recorregir
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editable && alumno && alumno.nota !== null && (
        <FormularioRecorreccion
          key={`${alumno.id}-${alumno.nota}`}
          ruta={`${ruta}/${alumno.id}/recorreccion`}
          alumno={alumno}
          notaAnterior={alumno.nota}
          alCancelar={() => setElegido(null)}
          alGuardar={(notas) => {
            alGuardar(notas)
            setElegido(null)
            setAviso(
              `Recorrección guardada para ${alumno.nombre}. El alumno verá la nota nueva.`,
            )
          }}
          alRecargar={() => {
            setElegido(null)
            alRecargar()
          }}
        />
      )}
      {aviso && (
        <p className="m-0 text-sm text-(color:--color-success)" role="status">
          {aviso}
        </p>
      )}
    </>
  )
}

function FormularioRecorreccion({
  ruta,
  alumno,
  notaAnterior,
  alCancelar,
  alGuardar,
  alRecargar,
}: {
  ruta: string
  alumno: NotaAlumno
  notaAnterior: number
  alCancelar: () => void
  alGuardar: (notas: NotasEvaluacion) => void
  alRecargar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const id = useId()
  const [nota, setNota] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [desactualizada, setDesactualizada] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valor = Number(nota.trim().replace(',', '.'))
  const motivoNota =
    nota.trim() === ''
      ? null
      : /^\d+(?:[.,]\d*)?$/.test(nota.trim())
        ? motivoNotaInvalida(valor)
        : 'formato'
  const largo = [...motivo].length
  const excedido = [...motivo.trim()].length > LARGO_MOTIVO_NOTA
  const invalida =
    !nota.trim() ||
    motivoNota !== null ||
    valor === notaAnterior ||
    !motivo.trim() ||
    excedido

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando || desactualizada || invalida) return
    setGuardando(true)
    setError(null)
    const datos: RecorregirNota = {
      notaAnterior,
      notaNueva: valor,
      motivo: motivo.trim(),
    }
    try {
      const res = await fetchConSesion(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (res.ok) {
        alGuardar((await res.json()) as NotasEvaluacion)
        return
      }
      const cuerpo = (await res.json().catch(() => null)) as {
        message?: unknown
      } | null
      if (res.status === 409) setDesactualizada(true)
      const mensaje = Array.isArray(cuerpo?.message)
        ? cuerpo.message[0]
        : cuerpo?.message
      setError(
        typeof mensaje === 'string' && [400, 403, 404, 409].includes(res.status)
          ? mensaje
          : 'No pudimos guardar la recorrección. Inténtalo nuevamente.',
      )
    } catch {
      setError(
        'No pudimos guardar la recorrección. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border bg-muted/50 p-4"
      aria-label={`Recorregir nota de ${alumno.nombre}`}
      onSubmit={(event) => void guardar(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !guardando) alCancelar()
      }}
    >
      <h5 className="m-0 text-base font-semibold">
        Recorrección de {alumno.nombre}
      </h5>
      <p>
        Nota publicada: <strong>{formato.format(notaAnterior)}</strong>. La nota
        nueva será visible para el alumno.
      </p>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">
        Nota nueva
        <Input
          autoFocus
          type="text"
          inputMode="decimal"
          className="w-20 tabular-nums"
          value={nota}
          disabled={guardando || desactualizada}
          required
          aria-invalid={motivoNota ? true : undefined}
          aria-describedby={motivoNota ? `${id}-nota` : undefined}
          onChange={(event) => {
            setNota(event.target.value)
            setError(null)
          }}
        />
      </label>
      {motivoNota && (
        <p id={`${id}-nota`} className="m-0 text-sm text-destructive">
          {MENSAJES_NOTA_INVALIDA[motivoNota]}
        </p>
      )}
      {nota.trim() && !motivoNota && valor === notaAnterior && (
        <p className="m-0 text-sm text-destructive">
          La nota nueva debe ser distinta de la publicada.
        </p>
      )}
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">
        Motivo de la recorrección
        <Textarea
          value={motivo}
          required
          rows={3}
          disabled={guardando || desactualizada}
          aria-invalid={excedido ? true : undefined}
          aria-describedby={`${id}-contador`}
          onChange={(event) => {
            setMotivo(event.target.value)
            setError(null)
          }}
        />
      </label>
      <p
        id={`${id}-contador`}
        className={
          excedido
            ? 'm-0 text-sm text-destructive'
            : 'm-0 text-sm text-muted-foreground'
        }
      >
        {largo}/{LARGO_MOTIVO_NOTA} caracteres
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"

          disabled={guardando || desactualizada || invalida}
        >
          {guardando ? 'Guardando…' : 'Guardar recorrección'}
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-auto justify-start px-0 py-1 whitespace-normal text-left"
          disabled={guardando}
          onClick={alCancelar}
        >
          Cancelar
        </Button>
        {desactualizada && (
          <Button type="button" onClick={alRecargar}>
            Recargar notas
          </Button>
        )}
      </div>
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
