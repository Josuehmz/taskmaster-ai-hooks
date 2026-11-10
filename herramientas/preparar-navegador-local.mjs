// Prepara el Supabase LOCAL para ver la app en el navegador con datos reales:
//   - registra dos usuarios desechables (ana y beto) con contraseñas aleatorias que no se guardan;
//   - ana crea el proyecto «Lanzamiento» con dos tareas y agrega a beto como miembro;
//   - escribe en el archivo indicado (fuera del repo) las dos sesiones, para inyectar la de ana
//     en el navegador (localStorage) y actuar como beto desde otro proceso.
//   node herramientas/preparar-navegador-local.mjs <archivo-sesiones.json>
// Lee SUPABASE_URL y SUPABASE_ANON_KEY del entorno (los pone probar-supabase-local.sh). No imprime
// claves ni tokens.
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [archivo] = process.argv.slice(2)
const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
if (!archivo || !URL || !ANON) {
  console.error('uso: SUPABASE_URL=… SUPABASE_ANON_KEY=… node preparar-navegador-local.mjs <archivo>')
  process.exit(2)
}

const cliente = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

async function registrar(nombre) {
  const c = cliente()
  const sufijo = Date.now().toString(36)
  const { data, error } = await c.auth.signUp({
    email: `${nombre}.${sufijo}@taskmaster.test`,
    password: `clave-local-${crypto.randomUUID()}`,
    options: { data: { display_name: nombre === 'ana' ? 'Ana (owner)' : 'Beto (miembro)' } },
  })
  if (error || !data.session) throw new Error(`signUp ${nombre}: ${error?.message ?? 'sin sesión'}`)
  return { c, session: data.session }
}

const ana = await registrar('ana')
const beto = await registrar('beto')
const { data: proyecto, error: e1 } = await ana.c.from('projects').insert({ name: 'Lanzamiento' }).select().single()
if (e1) throw e1
const { error: e2 } = await ana.c.from('project_members').insert({ project_id: proyecto.id, user_id: beto.session.user.id })
if (e2) throw e2
const { error: e3 } = await ana.c.from('tasks').insert([
  { project_id: proyecto.id, title: 'Escribir el plan de lanzamiento', status: 'in_progress', assignee_id: ana.session.user.id },
  { project_id: proyecto.id, title: 'Revisar las políticas RLS', status: 'todo', assignee_id: beto.session.user.id },
])
if (e3) throw e3

writeFileSync(
  archivo,
  JSON.stringify({ url: URL, projectId: proyecto.id, ana: ana.session, beto: beto.session }),
  'utf8',
)
console.log(`Proyecto ${proyecto.id} listo: ana (owner) y beto (miembro), 2 tareas.`)
