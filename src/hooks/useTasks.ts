// useTasks(projectId): tareas de un proyecto, en tiempo real.
//
// Compone el núcleo useRealtimeCollection (carga, suscripción, reconciliación, descarte de
// respuestas tardías) y le agrega las mutaciones de la entidad. No importa supabase ni src/lib:
// recibe el TaskRepository por contexto, así funciona igual en modo Supabase y en modo demo.
//
// ESTADO DE ESTE PASO: las firmas y el contrato son los definitivos. Las mutaciones ya hacen lo
// mínimo correcto (esperan al servidor y reconcilian por clave); la versión optimista con
// reversión llega en el siguiente paso y está descrita abajo para que su implementación no
// cambie la interfaz pública.
//
// ─── Actualización optimista con reversión (siguiente paso) ────────────────────────────────
//   createTask:
//     1. Se arma una fila temporal con clave `temp:<uuid>` (el id real lo da la base; el cliente
//        no puede fijarlo) y se pinta con controls.upsertLocal.
//     2. Al responder el servidor: controls.replaceLocal(tempKey, filaReal), en un solo setState.
//     3. Si falla: controls.removeLocal(tempKey) y se relanza el error para que la UI lo muestre.
//   updateTask:
//     1. previa = controls.getSnapshot().find(id); fin = controls.beginMutation(id).
//     2. controls.upsertLocal({ ...previa, ...cambios }) pinta el cambio al instante.
//     3. Éxito: upsertLocal(filaDelServidor) (trae updated_at real del trigger).
//        Error: upsertLocal(previa) revierte. En ambos casos fin() en un finally.
//     4. Tras revertir se hace refetch: mientras la clave estaba marcada se ignoraron ecos
//        ajenos, y la versión previa puede estar desactualizada.
//   deleteTask:
//     1. previa = snapshot; fin = beginMutation(id); removeLocal(id).
//     2. Error: upsertLocal(previa) la devuelve a su lugar (el orden lo da `compare`).
//
// ─── Eco Realtime de las mutaciones propias ────────────────────────────────────────────────
//   - Toda fila se reconcilia por clave con upsert idempotente: el eco INSERT/UPDATE y la
//     respuesta HTTP traen la misma clave real, así que aplicar ambos deja una sola fila.
//   - Mientras una mutación propia está en vuelo (beginMutation), el núcleo ignora los
//     INSERT/UPDATE de esa clave: un eco intermedio no pisa el valor optimista.
//   - El eco DELETE de un borrado propio quita una fila que ya no está: no-op.
//   - Hueco conocido: si el eco INSERT llega ANTES que la respuesta del create, durante ese
//     intervalo conviven la fila temporal y la real. Se cierra en el siguiente paso reteniendo
//     los INSERT con created_by = usuario actual mientras haya creates propios en vuelo.
//
// ─── Limpieza del canal ────────────────────────────────────────────────────────────────────
//   El núcleo llama al Unsubscribe que devuelve repository.subscribe; en Supabase eso es
//   client.removeChannel(channel) (src/services/supabase/realtime.ts), no solo unsubscribe(),
//   para que el canal salga del cliente y el socket se cierre si no quedan canales. Pasa al
//   cambiar de projectId y al desmontar; en StrictMode el doble montaje abre y cierra un canal
//   con nombre único, sin choques de topic.
//
// ─── Respuestas tardías ────────────────────────────────────────────────────────────────────
//   - Cargas: el núcleo aborta la consulta en vuelo (AbortController) y, si igual llega, la
//     descarta porque su scope ya no coincide con el actual.
//   - Mutaciones: NO se abortan (la escritura ya pudo aplicarse en la base), pero su resultado
//     solo toca el estado si controls.isCurrentScope(scopeDeLaLlamada) sigue siendo cierto.
//     La promesa se resuelve igual para quien la espera.
import { useCallback } from 'react'
import type { NewTaskFields, Task, UpdateTaskInput } from '../types'
import { useRepositories } from './RepositoriesContext'
import { useRealtimeCollection, type Compare, type KeyOf } from './useRealtimeCollection'

export type UseTasksResult = {
  readonly tasks: readonly Task[]
  readonly loading: boolean
  /** Último error de carga o de tiempo real. Los errores de mutación se lanzan (rechazo). */
  readonly error: Error | null
  /** Crea en el proyecto actual. Rechaza si no hay proyecto o si la base lo impide. */
  readonly createTask: (fields: NewTaskFields) => Promise<Task>
  /** Cambia solo los campos presentes (undefined = no tocar). Devuelve la fila del servidor. */
  readonly updateTask: (id: string, patch: UpdateTaskInput) => Promise<Task>
  readonly deleteTask: (id: string) => Promise<void>
  /** Recarga desde el servidor (también se hace solo al reconectar el canal). */
  readonly refetch: () => Promise<void>
}

// Definidos a nivel de módulo: el núcleo los usa como dependencias de sus efectos.
const taskKey: KeyOf<Task> = (row) => row.id ?? null
const oldestFirst: Compare<Task> = (a, b) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

/** @param projectId proyecto seleccionado; null = sin proyecto (lista vacía, sin canal). */
export function useTasks(projectId: string | null): UseTasksResult {
  const { tasks: repository } = useRepositories()
  const { data, loading, error, refetch, controls } = useRealtimeCollection({
    scopeId: projectId,
    source: repository,
    keyOf: taskKey,
    compare: oldestFirst,
  })

  const createTask = useCallback(
    async (fields: NewTaskFields): Promise<Task> => {
      if (projectId === null) throw new Error('No hay un proyecto seleccionado')
      // SIGUIENTE PASO: fila temporal optimista + replaceLocal / removeLocal (ver cabecera).
      const created = await repository.create({ ...fields, project_id: projectId })
      if (controls.isCurrentScope(projectId)) controls.upsertLocal(created)
      return created
    },
    [projectId, repository, controls],
  )

  const updateTask = useCallback(
    async (id: string, patch: UpdateTaskInput): Promise<Task> => {
      const scope = projectId
      const end = controls.beginMutation(id)
      try {
        // SIGUIENTE PASO: upsertLocal({ ...previa, ...patch }) antes de esperar, y revertir.
        const updated = await repository.update(id, patch)
        if (controls.isCurrentScope(scope)) controls.upsertLocal(updated)
        return updated
      } finally {
        end()
      }
    },
    [projectId, repository, controls],
  )

  const deleteTask = useCallback(
    async (id: string): Promise<void> => {
      const scope = projectId
      const end = controls.beginMutation(id)
      try {
        // SIGUIENTE PASO: removeLocal(id) antes de esperar y upsertLocal(previa) si falla.
        await repository.remove(id)
        if (controls.isCurrentScope(scope)) controls.removeLocal(id)
      } finally {
        end()
      }
    },
    [projectId, repository, controls],
  )

  return { tasks: data, loading, error, createTask, updateTask, deleteTask, refetch }
}
