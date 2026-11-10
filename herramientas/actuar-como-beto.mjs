// Actúa como "beto" (otro usuario) sobre el Supabase local, con la sesión que dejó
// preparar-navegador-local.mjs. Sirve para ver en el navegador de ana un cambio en tiempo real.
//   node herramientas/actuar-como-beto.mjs <archivo-sesiones.json> crear|mover|borrar
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [archivo, accion] = process.argv.slice(2)
const ANON = process.env.SUPABASE_ANON_KEY
if (!archivo || !accion || !ANON) {
  console.error('uso: SUPABASE_ANON_KEY=… node actuar-como-beto.mjs <archivo> crear|mover|borrar')
  process.exit(2)
}
const datos = JSON.parse(readFileSync(archivo, 'utf8'))
const c = createClient(datos.url, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const { error: eSesion } = await c.auth.setSession({
  access_token: datos.beto.access_token,
  refresh_token: datos.beto.refresh_token,
})
if (eSesion) throw eSesion

const titulo = 'Preparar la demo (creada por Beto)'
if (accion === 'crear') {
  const { error } = await c.from('tasks').insert({ project_id: datos.projectId, title: titulo, assignee_id: datos.beto.user.id })
  if (error) throw error
} else if (accion === 'mover') {
  const { error } = await c.from('tasks').update({ status: 'done' }).eq('project_id', datos.projectId).eq('title', titulo)
  if (error) throw error
} else if (accion === 'borrar') {
  const { error } = await c.from('tasks').delete().eq('project_id', datos.projectId).eq('title', titulo)
  if (error) throw error
} else {
  throw new Error(`acción desconocida: ${accion}`)
}
console.log(`beto: ${accion} hecho`)
