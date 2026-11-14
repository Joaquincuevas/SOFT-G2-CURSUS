import { describe, expect, test } from 'vitest'
import { cn } from '@/lib/utils'

// UIX-01: el alias @/ llega a Vitest (si no, este import falla) y cn() hace lo
// que esperan los componentes de shadcn.
describe('cn', () => {
  test('une las clases y descarta lo falso', () => {
    expect(cn('flex', false, null, undefined, 'gap-2')).toBe('flex gap-2')
    expect(cn({ 'font-bold': true, italic: false })).toBe('font-bold')
  })

  test('la última utilidad de Tailwind gana', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
    expect(cn('bg-primary', 'bg-secondary')).toBe('bg-secondary')
  })

  test('no mezcla utilidades que no chocan', () => {
    expect(cn('text-sm', 'text-primary')).toBe('text-sm text-primary')
  })
})
