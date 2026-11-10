// Prueba de extremo a extremo contra el Supabase LOCAL (CLI + Docker): RLS, privilegios y Realtime
// con tres usuarios reales de Auth.
//   bash herramientas/probar-supabase-local.sh      (lee URL y anon key de `supabase status`)
//
// Ana crea un proyecto y agrega a Beto; Carla queda fuera. Beto y Carla se suscriben a
// postgres_changes de `tasks` filtrado por project_id=eq.<id>; Carla además a la tabla sin filtro.
// Se comprueba que Beto ve en tiempo real lo que hace Ana y que Carla no ve filas ni eventos.
// Salida en formato TAP ("ok N - ..."). No imprime claves ni tokens.
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
if (!URL || !ANON) {
  console.error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY')
  process.exit(2)
}

let n = 0
let fallas = 0
const ok = (cond, msg, detalle = '') => {
  n += 1
  if (!cond) fallas += 1
  console.log(`${cond ? 'ok' : 'not ok'} ${n} - ${msg}${detalle ? ` # ${detalle}` : ''}`)
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const cliente = () =>
  createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

async function usuario(nombre) {
  const c = cliente()
  const sufijo = Date.now().toString(36)
  const email = `${nombre}.${sufijo}@taskmaster.test`
  const password = `clave-local-${crypto.randomUUID()}`
  const { data, error } = await c.auth.signUp({
    email,
    password,
    options: { data: { display_name: nombre } },
  })
  if (error || !data.session) throw new Error(`signUp ${nombre}: ${error?.message ?? 'sin sesión'}`)
  return { c, id: data.user.id, nombre }
}

/** Suscribe y devuelve la lista (viva) de eventos recibidos y el canal. */
async function suscribir(c, nombreCanal, filtro) {
  const eventos = []
  const opciones = { event: '*', schema: 'public', table: 'tasks', ...(filtro ? { filter: filtro } : {}) }
  const canal = c
    .channel(nombreCanal)
    .on('postgres_changes', opciones, (p) => eventos.push(p))
  const estado = await new Promise((resolve) => {
    const t = setTimeout(() => resolve('TIMEOUT'), 15000)
    canal.subscribe((s, err) => {
      if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        clearTimeout(t)
        resolve(err ? `${s}: ${err.message}` : s)
      }
    })
  })
  return { eventos, canal, estado }
}

async function esperarEvento(lista, pred, ms = 8000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const e = lista.find(pred)
    if (e) return e
    await esperar(100)
  }
  return undefined
}

console.log('TAP version 13')
const ana = await usuario('ana')
const beto = await usuario('beto')
const carla = await usuario('carla')
ok(true, 'signUp de ana, beto y carla (Auth local, sin confirmación de correo)')

// --- Perfiles y proyecto -------------------------------------------------------------------
const perfilAna = await ana.c.from('profiles').select('display_name').eq('id', ana.id).single()
ok(perfilAna.data?.display_name === 'ana', 'el trigger de auth.users creó el perfil con display_name', JSON.stringify(perfilAna.data))

const proy = await ana.c.from('projects').insert({ name: 'Lanzamiento' }).select().single()
ok(!proy.error && proy.data?.created_by === ana.id, 'ana crea un proyecto; created_by lo pone la base', proy.error?.message ?? '')
const projectId = proy.data?.id

const owner = await ana.c.from('project_members').select('role').eq('project_id', projectId).eq('user_id', ana.id).single()
ok(owner.data?.role === 'owner', 'el trigger agregó a ana como owner', JSON.stringify(owner.data ?? owner.error?.message))

const alta = await ana.c.from('project_members').insert({ project_id: projectId, user_id: beto.id, role: 'member' })
ok(!alta.error, 'ana (owner) agrega a beto como miembro', alta.error?.message ?? '')

const autoAlta = await carla.c.from('project_members').insert({ project_id: projectId, user_id: carla.id, role: 'member' })
ok(!!autoAlta.error, 'carla NO puede meterse sola al proyecto', autoAlta.error?.message ?? 'se insertó')

const proyCarla = await carla.c.from('projects').select('id').eq('id', projectId)
ok(proyCarla.data?.length === 0, 'carla no ve el proyecto (lista vacía, no error)', JSON.stringify(proyCarla.data ?? proyCarla.error?.message))

// --- Suscripciones Realtime ----------------------------------------------------------------
const filtro = `project_id=eq.${projectId}`
const subBeto = await suscribir(beto.c, `tasks:${projectId}:beto`, filtro)
const subCarla = await suscribir(carla.c, `tasks:${projectId}:carla`, filtro)
const subCarlaTodo = await suscribir(carla.c, 'tasks:todo:carla', null)
ok(subBeto.estado === 'SUBSCRIBED', 'beto se suscribe a postgres_changes con filtro project_id=eq', subBeto.estado)
ok(subCarla.estado === 'SUBSCRIBED' && subCarlaTodo.estado === 'SUBSCRIBED', 'carla se suscribe (con filtro y sin filtro)', `${subCarla.estado} / ${subCarlaTodo.estado}`)
await esperar(1500) // margen para que Realtime registre las suscripciones

// --- INSERT --------------------------------------------------------------------------------
const nueva = await ana.c.from('tasks').insert({ project_id: projectId, title: 'Escribir el plan' }).select().single()
ok(!nueva.error && nueva.data?.created_by === ana.id, 'ana crea una tarea; created_by = ana', nueva.error?.message ?? '')
const taskId = nueva.data?.id
const evIns = await esperarEvento(subBeto.eventos, (e) => e.eventType === 'INSERT' && e.new?.id === taskId)
ok(!!evIns, 'beto recibe el INSERT en tiempo real', evIns ? `title=${evIns.new.title}` : 'no llegó')

// --- UPDATE --------------------------------------------------------------------------------
const upd = await ana.c.from('tasks').update({ status: 'in_progress' }).eq('id', taskId).select().single()
ok(!upd.error && upd.data?.status === 'in_progress', 'ana mueve la tarea a in_progress', upd.error?.message ?? '')
const evUpd = await esperarEvento(subBeto.eventos, (e) => e.eventType === 'UPDATE' && e.new?.id === taskId)
ok(evUpd?.new?.status === 'in_progress', 'beto recibe el UPDATE con el estado nuevo', evUpd ? `old.status=${evUpd.old?.status ?? '(no viene)'}` : 'no llegó')

// --- id generado por el cliente (decisión del paso 2) ---------------------------------------
const idCliente = crypto.randomUUID()
const conId = await beto.c.from('tasks').insert({ id: idCliente, project_id: projectId, title: 'Con id del cliente' }).select().single()
ok(!conId.error && conId.data?.id === idCliente, 'beto crea una tarea con id generado en el cliente (grant insert (id))', conId.error?.message ?? '')
const repetido = await beto.c.from('tasks').insert({ id: idCliente, project_id: projectId, title: 'Id repetido' })
ok(!!repetido.error, 'un id repetido se rechaza (no sobrescribe la fila existente)', repetido.error?.message ?? 'se insertó')
const robarId = await carla.c.from('tasks').insert({ id: crypto.randomUUID(), project_id: projectId, title: 'intrusa con id' })
ok(!!robarId.error, 'mandar el id no le sirve a carla para entrar al proyecto', robarId.error?.message ?? 'se insertó')
if (!conId.error) await beto.c.from('tasks').delete().eq('id', idCliente)

// --- Lo que carla no puede hacer -----------------------------------------------------------
const verCarla = await carla.c.from('tasks').select('id').eq('project_id', projectId)
ok(verCarla.data?.length === 0, 'carla no ve las tareas del proyecto', JSON.stringify(verCarla.data ?? verCarla.error?.message))
const insCarla = await carla.c.from('tasks').insert({ project_id: projectId, title: 'intrusa' })
ok(!!insCarla.error, 'carla no puede crear tareas en el proyecto', insCarla.error?.message ?? 'se insertó')
const updCarla = await carla.c.from('tasks').update({ title: 'hackeada' }).eq('id', taskId).select()
ok(!updCarla.error && updCarla.data?.length === 0, 'el update de carla no afecta filas', JSON.stringify(updCarla.data ?? updCarla.error?.message))
const delCarla = await carla.c.from('tasks').delete().eq('id', taskId).select()
ok(!delCarla.error && delCarla.data?.length === 0, 'el delete de carla no afecta filas', JSON.stringify(delCarla.data ?? delCarla.error?.message))

// --- Privilegios por columna ---------------------------------------------------------------
const robo = await beto.c.from('tasks').update({ created_by: beto.id }).eq('id', taskId)
ok(!!robo.error, 'beto (miembro) no puede reescribir created_by', robo.error?.message ?? 'se actualizó')
const mover = await beto.c.from('tasks').update({ project_id: crypto.randomUUID() }).eq('id', taskId)
ok(!!mover.error, 'nadie puede mover una tarea de proyecto (sin grant de update en project_id)', mover.error?.message ?? 'se actualizó')
const anon = cliente()
const verAnon = await anon.from('tasks').select('id')
ok(!!verAnon.error || verAnon.data?.length === 0, 'anon (sin sesión) no lee tareas', verAnon.error?.message ?? JSON.stringify(verAnon.data))

// --- Comentarios ---------------------------------------------------------------------------
const com = await beto.c.from('comments').insert({ task_id: taskId, body: 'Yo reviso el plan' }).select().single()
ok(!com.error && com.data?.author_id === beto.id, 'beto comenta; author_id lo pone la base', com.error?.message ?? '')
const comCarla = await carla.c.from('comments').select('id').eq('task_id', taskId)
ok(comCarla.data?.length === 0, 'carla no ve los comentarios', JSON.stringify(comCarla.data ?? comCarla.error?.message))

// --- DELETE --------------------------------------------------------------------------------
const del = await ana.c.from('tasks').delete().eq('id', taskId).select()
ok(!del.error && del.data?.length === 1, 'ana borra la tarea', del.error?.message ?? '')
const evDel = await esperarEvento(subBeto.eventos, (e) => e.eventType === 'DELETE' && e.old?.id === taskId)
ok(!!evDel, 'beto recibe el DELETE (filtro project_id con replica identity full)', evDel ? `columnas de old: ${Object.keys(evDel.old).join(',')}` : 'no llegó')

await esperar(2500) // margen para que llegue cualquier evento rezagado a carla
const tiposCarla = [...subCarla.eventos, ...subCarlaTodo.eventos].map((e) => e.eventType)
ok(tiposCarla.filter((t) => t !== 'DELETE').length === 0, 'carla no recibe INSERT ni UPDATE de un proyecto ajeno', `eventos: [${tiposCarla.join(',')}]`)
const delCarlaEv = [...subCarla.eventos, ...subCarlaTodo.eventos].filter((e) => e.eventType === 'DELETE')
console.log(
  `# DELETE recibidos por carla: ${delCarlaEv.length}` +
    (delCarlaEv.length ? ` (columnas de old: ${Object.keys(delCarlaEv[0].old).join(',')})` : ''),
)
ok(
  delCarlaEv.every((e) => Object.keys(e.old).every((k) => k === 'id')),
  'si a carla le llega un DELETE ajeno, solo trae la clave primaria (no filtra datos)',
  `${delCarlaEv.length} DELETE`,
)

// --- Cascada y último owner ----------------------------------------------------------------
const salirOwner = await ana.c.from('project_members').delete().eq('project_id', projectId).eq('user_id', ana.id)
ok(!!salirOwner.error, 'el último owner no puede salirse del proyecto', salirOwner.error?.message ?? 'se borró')
const borrarProy = await ana.c.from('projects').delete().eq('id', projectId).select()
ok(!borrarProy.error && borrarProy.data?.length === 1, 'ana borra el proyecto (la cascada pasa el trigger del último owner)', borrarProy.error?.message ?? '')

// --- Limpieza de canales -------------------------------------------------------------------
await beto.c.removeChannel(subBeto.canal)
await carla.c.removeAllChannels()
ok(beto.c.getChannels().length === 0 && carla.c.getChannels().length === 0, 'removeChannel deja los clientes sin canales')

console.log(`1..${n}`)
console.log(`# ${n - fallas} de ${n} pasan`)
process.exit(fallas ? 1 : 0)
