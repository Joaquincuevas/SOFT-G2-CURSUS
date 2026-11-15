import { CursusLogo } from '@/components/brand/CursusLogo'

// Panel de marca de las pantallas de acceso (login del Figma, nodo 66:2). Lo
// usan el login, la verificación en dos pasos, la recuperación y el cambio
// obligatorio de contraseña. Bajo 1024 px se oculta y queda solo el formulario.
export function PanelMarca() {
  return (
    <aside className="hidden w-140 flex-none flex-col justify-between bg-(color:--color-primary-dark) px-14 py-12 lg:flex">
      <div className="flex flex-col gap-3">
        <p className="m-0 flex items-center gap-3 text-2xl font-bold tracking-[2px] text-white">
          <CursusLogo size={40} decorativo className="shrink-0 text-white" />
          CURSUS
        </p>
        <span
          aria-hidden="true"
          className="h-1 w-[42px] rounded-xs bg-primary"
        />
      </div>
      <div className="flex h-40 w-105 flex-col gap-3.5">
        <p className="m-0 text-[28px] leading-9 font-bold text-white">
          Gestión académica,
          <br />
          en un solo lugar.
        </p>
        <p className="m-0 max-w-97.5 text-sm leading-[22px] text-(color:--color-primary-light)">
          CURSUS centraliza cursos, materiales, notas y seguimiento académico
          para cada universidad.
        </p>
      </div>
      <p className="m-0 text-xs leading-[18px] text-(color:--color-primary-light)">
        Sistema de Gestión Académica
      </p>
    </aside>
  )
}
