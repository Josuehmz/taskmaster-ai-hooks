// useTasks(projectId): tareas de un proyecto, en tiempo real. Hook principal del entregable.
//
// Compone el núcleo useRealtimeCollection (carga, canal Realtime, reconciliación, optimismo con
// reversión y descarte de respuestas tardías) y le agrega las mutaciones de la entidad. No importa
// supabase ni src/lib: recibe el TaskRepository por contexto, así funciona igual en modo
// Supabase y en modo demo, y se prueba con un repositorio falso.
//
// ─── Actualización optimista con reversión ─────────────────────────────────────────────────
//   createTask: el id se genera aquí con crypto.randomUUID(). La fila optimista ya tiene su clave
//     definitiva, así que la respuesta HTTP y el eco Realtime del INSERT caen sobre la misma fila
//     (llegue primero el que llegue). Si el servidor falla, la fila se quita.
//   updateTask: pinta { ...previa, ...cambios } al instante; si falla, vuelve EXACTAMENTE a la
//     fila previa (la guarda el núcleo dentro del mismo updater).
//   deleteTask: la quita al instante; si falla, vuelve a su posición (la da `compare`).
//   En los tres casos el error queda en `mutationError` y la promesa se rechaza.
//
// ─── Eco Realtime de las mutaciones propias ────────────────────────────────────────────────
//   Mientras la clave tiene una mutación en vuelo, el núcleo difiere sus eventos. Al terminar
//   aplica el último con control de versión (updated_at): el eco es igual a la respuesta y no
//   cambia nada (ni se anuncia como cambio remoto); un cambio ajeno más nuevo sí gana.
//
// ─── Limpieza y respuestas tardías ─────────────────────────────────────────────────────────
//   Al cambiar de projectId o desmontar: removeChannel del canal del proyecto anterior, abort de
//   la carga en vuelo, y ninguna respuesta (de carga o de mutación) toca el estado después.
import { useCallback } from 'react'
import type { NewTaskFields, Task, UpdateTaskInput } from '../types'
import { useRepositories } from './RepositoriesContext'
import {
  useRealtimeCollection,
  type Compare,
  type KeyOf,
  type RemoteChange,
  type VersionOf,
} from './useRealtimeCollection'

export type UseTasksResult = {
  readonly tasks: readonly Task[]
  readonly loading: boolean
  /** Error de carga o de tiempo real. */
  readonly error: Error | null
  /** Error de la última mutación (el cambio optimista ya se revirtió). */
  readonly mutationError: Error | null
  /** Último cambio de OTRO usuario que llegó por tiempo real (los ecos propios no cuentan). */
  readonly lastRemoteChange: RemoteChange<Task> | null
  readonly createTask: (fields: NewTaskFields) => Promise<Task>
  /** Cambia solo los campos presentes (undefined = no tocar). Devuelve la fila del servidor. */
  readonly updateTask: (id: string, patch: UpdateTaskInput) => Promise<Task>
  readonly deleteTask: (id: string) => Promise<void>
  readonly refetch: () => Promise<void>
  readonly clearMutationError: () => void
}

// Definidos a nivel de módulo: el núcleo los usa como dependencias de sus efectos.
const taskKey: KeyOf<Task> = (row) => row.id ?? null
const oldestFirst: Compare<Task> = (a, b) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
const taskVersion: VersionOf<Task> = (row) => Date.parse(row.updated_at)

/** @param projectId proyecto seleccionado; null = sin proyecto (lista vacía, sin canal). */
export function useTasks(projectId: string | null): UseTasksResult {
  const { tasks: repository } = useRepositories()
  const { data, loading, error, mutationError, lastRemoteChange, refetch, controls } =
    useRealtimeCollection({
      scopeId: projectId,
      source: repository,
      keyOf: taskKey,
      compare: oldestFirst,
      versionOf: taskVersion,
    })

  const createTask = useCallback(
    async (fields: NewTaskFields): Promise<Task> => {
      if (projectId === null) throw new Error('No hay un proyecto seleccionado')
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const optimistic: Task = {
        id,
        project_id: projectId,
        title: fields.title.trim(),
        description: fields.description ?? null,
        status: fields.status ?? 'todo',
        assignee_id: fields.assignee_id ?? null,
        created_by: null, // lo pone la base con auth.uid(); llega en la respuesta
        created_at: now,
        updated_at: now,
      }
      return controls.mutateUpsert(optimistic, () =>
        repository.create({ ...fields, id, project_id: projectId }),
      )
    },
    [projectId, repository, controls],
  )

  const updateTask = useCallback(
    async (id: string, patch: UpdateTaskInput): Promise<Task> => {
      const current = data.find((task) => task.id === id)
      if (current === undefined) throw new Error('La tarea no está en la lista')
      const optimistic: Task = {
        ...current,
        ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
        ...(patch.description === undefined ? {} : { description: patch.description }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.assignee_id === undefined ? {} : { assignee_id: patch.assignee_id }),
      }
      return controls.mutateUpsert(optimistic, () => repository.update(id, patch))
    },
    [data, repository, controls],
  )

  const deleteTask = useCallback(
    (id: string): Promise<void> => controls.mutateRemove(id, () => repository.remove(id)),
    [repository, controls],
  )

  return {
    tasks: data,
    loading,
    error,
    mutationError,
    lastRemoteChange,
    createTask,
    updateTask,
    deleteTask,
    refetch,
    clearMutationError: controls.clearMutationError,
  }
}
