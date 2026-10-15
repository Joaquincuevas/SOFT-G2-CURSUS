import './Placeholder.css'

// Página vacía para las rutas del menú, hasta que cada historia la implemente.
export function Placeholder({ title }: { title: string }) {
  return <h1 className="placeholder__title">{title}</h1>
}
