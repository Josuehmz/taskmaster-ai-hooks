/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    // threads en vez de forks: en este equipo (carpeta en OneDrive) un fork tardaba más de los 60 s
    // fijos que Vitest espera a que arranque el worker, y la corrida fallaba sin ejecutar pruebas.
    pool: 'threads',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
