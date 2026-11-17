// El comentario es texto del profesor, nunca HTML. Puede incluir saltos de
// línea; el estilo conserva esos saltos y evita que un texto largo desborde.
export function ComentarioDevolucion({
  comentario,
}: {
  comentario: string | null | undefined
}) {
  return (
    <div
      className="max-w-lg rounded-lg border-l-4 border-primary bg-muted/60 p-3"
      role="note"
      aria-label="Comentario del profesor"
    >
      <p className="m-0 mb-1 text-sm font-semibold">Comentario del profesor</p>
      <p className="m-0 text-sm break-words whitespace-pre-wrap">
        {comentario || 'No hay comentario disponible.'}
      </p>
    </div>
  )
}
