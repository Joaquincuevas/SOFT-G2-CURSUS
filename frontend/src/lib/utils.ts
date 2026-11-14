import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Une clases condicionales (clsx) y resuelve los conflictos de Tailwind
// (tailwind-merge): la última utilidad gana. Es la función que usan los
// componentes de shadcn.
export function cn(...entradas: ClassValue[]) {
  return twMerge(clsx(entradas))
}
