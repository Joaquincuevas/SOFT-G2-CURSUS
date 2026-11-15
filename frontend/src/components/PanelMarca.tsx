import foto from '@/assets/acceso-auditorio.jpg'

// Panel de marca de las pantallas de acceso: una foto con el mensaje de CURSUS
// encima. Lo usan el login, la verificación en dos pasos, la recuperación y el
// cambio obligatorio de contraseña. Bajo 1024 px se oculta y queda solo el
// formulario. Foto: Philippe Bout, Unsplash (licencia de Unsplash).
export function PanelMarca() {
  return (
    <aside className="relative hidden self-start overflow-hidden bg-(color:--color-primary-dark) lg:sticky lg:top-0 lg:order-first lg:block lg:h-svh">
      {/* La foto es más alta que el panel y sube, para que la persona quede sobre el texto. */}
      <img
        src={foto}
        alt=""
        className="absolute inset-x-0 -top-[35%] h-[135%] w-full object-cover object-[64%_50%]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-(color:--color-primary-dark) via-(color:--color-primary-dark)/55 via-45% to-transparent"
      />
      <div className="relative flex h-full flex-col justify-end gap-3.5 p-12 xl:p-16">
        <span
          aria-hidden="true"
          className="h-1 w-[42px] rounded-xs bg-(color:--color-primary-light)"
        />
        <p className="m-0 text-3xl leading-10 xl:text-4xl xl:leading-[1.2] font-bold text-white">
          Gestión académica,
          <br />
          en un solo lugar.
        </p>
        <p className="m-0 max-w-md text-base leading-6 text-white">
          CURSUS centraliza cursos, materiales, notas y seguimiento académico
          para cada universidad.
        </p>
        <p className="m-0 text-sm leading-5 text-white/85">
          Sistema de Gestión Académica
        </p>
      </div>
    </aside>
  )
}
