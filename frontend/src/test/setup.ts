import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sin `globals: true`, RTL no registra su cleanup automático
afterEach(cleanup)
