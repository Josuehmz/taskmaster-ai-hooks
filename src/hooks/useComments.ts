// useComments(taskId): comentarios de una tarea, en tiempo real.
//
// Mismo patrón que useTasks: el núcleo useRealtimeCollection pone carga, canal, reconciliación
// y descarte de respuestas tardías; este hook solo agrega las mutaciones de la entidad.
// Los comentarios no se editan (no hay grant de update en la base): solo crear y borrar.
//
// Siguiente paso (sin cambiar la firma):
//   - addComment optimista: fila `temp:<uuid>` con author_id del usuario actual, replaceLocal al
//     responder, removeLocal si falla. El eco INSERT trae la clave real: upsert idempotente.
//   - deleteComment optimista: beginMutation + removeLocal, upsertLocal(previa) si falla.
//   - El borrado en cascada de una tarea borra sus comentarios: llegan DELETE con solo la PK y
//     el núcleo los aplica como "quitar si está".
import { useCallback } from 'react'
import type { Comment } from '../types'
import { useRepositories } from './RepositoriesContext'
import { useRealtimeCollection, type Compare, type KeyOf } from './useRealtimeCollection'

export type UseCommentsResult = {
  readonly comments: readonly Comment[]
  readonly loading: boolean
  readonly error: Error | null
  /** author_id lo pone la base con auth.uid(); el hook solo manda task_id y body. */
  readonly addComment: (body: string) => Promise<Comment>
  /** Solo el autor puede borrar (política RLS); si no, rechaza con RepositoryError 'not_found'. */
  readonly deleteComment: (id: string) => Promise<void>
  readonly refetch: () => Promise<void>
}

const commentKey: KeyOf<Comment> = (row) => row.id ?? null
const chronological: Compare<Comment> = (a, b) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

/** @param taskId tarea abierta; null = ninguna (lista vacía, sin canal). */
export function useComments(taskId: string | null): UseCommentsResult {
  const { comments: repository } = useRepositories()
  const { data, loading, error, refetch, controls } = useRealtimeCollection({
    scopeId: taskId,
    source: repository,
    keyOf: commentKey,
    compare: chronological,
  })

  const addComment = useCallback(
    async (body: string): Promise<Comment> => {
      if (taskId === null) throw new Error('No hay una tarea seleccionada')
      const created = await repository.create({ task_id: taskId, body })
      if (controls.isCurrentScope(taskId)) controls.upsertLocal(created)
      return created
    },
    [taskId, repository, controls],
  )

  const deleteComment = useCallback(
    async (id: string): Promise<void> => {
      const scope = taskId
      const end = controls.beginMutation(id)
      try {
        await repository.remove(id)
        if (controls.isCurrentScope(scope)) controls.removeLocal(id)
      } finally {
        end()
      }
    },
    [taskId, repository, controls],
  )

  return { comments: data, loading, error, addComment, deleteComment, refetch }
}
