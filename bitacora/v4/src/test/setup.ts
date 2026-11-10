// Se carga antes de cada archivo de pruebas (vite.config.ts → test.setupFiles).
// Testing Library solo se limpia sola si Vitest corre con `globals: true`; aquí no, así que el
// DOM de una prueba se quedaba en la siguiente ("Found multiple elements", fallo real de v2).
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
