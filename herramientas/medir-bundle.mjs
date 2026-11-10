// Mide de qué está hecho el bundle: compila con Vite separando cada grupo grande en su propio
// chunk (solo para medir; la app real no usa esta configuración) e imprime tamaño y gzip.
//   node herramientas/medir-bundle.mjs            (sin variables de entorno)
//   VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… node herramientas/medir-bundle.mjs
import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync } from 'node:fs'
import { build } from 'vite'

const grupo = (id) => {
  // null = se queda en el chunk de entrada (index): ahí queda el código propio de la app.
  if (!id.includes('node_modules')) return /[\/]src[\/]services[\/]demo[\/]/.test(id) ? 'app-modo-demo' : null
  if (id.includes('@supabase')) return 'supabase-js'
  if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
  return 'otros-paquetes'
}

await build({
  logLevel: 'silent',
  build: {
    outDir: 'dist-medicion',
    emptyOutDir: true,
    // Vite 8 empaqueta con Rolldown: la opción es output.codeSplitting.groups (manualChunks y
    // rolldownOptions se ignoraron al probarlos aquí).
    rollupOptions: { output: { codeSplitting: { groups: [{ name: grupo }] } } },
  },
})

const dir = 'dist-medicion/assets'
const filas = readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => {
    const buf = readFileSync(`${dir}/${f}`)
    return { chunk: f.replace(/-[\w-]{8}\.js$/, ''), bytes: buf.length, gzip: gzipSync(buf).length }
  })
  .sort((a, b) => b.bytes - a.bytes)
for (const f of filas) {
  console.log(`${f.chunk.padEnd(16)} ${(f.bytes / 1000).toFixed(2).padStart(8)} kB   gzip ${(f.gzip / 1000).toFixed(2).padStart(7)} kB`)
}
const total = filas.reduce((s, f) => s + f.bytes, 0)
const totalGzip = filas.reduce((s, f) => s + f.gzip, 0)
console.log(`${'TOTAL'.padEnd(16)} ${(total / 1000).toFixed(2).padStart(8)} kB   gzip ${(totalGzip / 1000).toFixed(2).padStart(7)} kB`)
