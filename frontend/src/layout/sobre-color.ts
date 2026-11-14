// Clases de los controles del encabezado, que va sobre el color de la
// universidad: texto blanco (colorConContraste asegura 4,5:1 con blanco),
// hover y estado abierto con el tono oscuro del mismo color, y el foco como un
// aro blanco separado del fondo.
export const SOBRE_COLOR =
  'text-primary-foreground hover:bg-(color:--color-primary-dark) hover:text-primary-foreground aria-expanded:bg-(color:--color-primary-dark) focus-visible:border-primary-foreground focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary'
