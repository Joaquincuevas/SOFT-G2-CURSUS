// El comentario es texto del profesor, nunca HTML. Puede incluir saltos de
// línea; el estilo conserva esos saltos y evita que un texto largo desborde.
export function ComentarioDevolucion({
  comentario,
}: {
  comentario: string | null | undefined
}) {
  return (
    <div
      className="notas__devolucion"
      role="note"
      aria-label="Comentario del profesor"
    >
      <p className="notas__devolucion-titulo">Comentario del profesor</p>
      <p className="notas__devolucion-texto">
        {comentario || 'No hay comentario disponible.'}
      </p>
    </div>
  )
}
