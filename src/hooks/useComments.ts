// useComments(taskId): comentarios de una tarea, en tiempo real.
//
// Mismo patrón que useTasks sobre el mismo núcleo: este hook solo agrega las mutaciones de la
// entidad. Los comentarios no se editan (no hay grant de update en la base): crear y borrar.
// El borrado en cascada de una tarea borra sus comentarios: llegan DELETE con solo la PK y el
// núcleo los aplica como "quitar si está".
import { useCallback } from 'react'
import type { Comment } from '../types'
import { useRepositories } from './RepositoriesContext'
import {
  useRealtimeCollection,
  type Compare,
  type KeyOf,
  type RemoteChange,
} from './useRealtimeCollection'

export type UseCommentsResult = {
  readonly comments: readonly Comment[]
  readonly loading: boolean
  readonly error: Error | null
  readonly mutationError: Error | null
  readonly lastRemoteChange: RemoteChange<Comment> | null
  /**
   * Crea el comentario de forma optimista. author_id lo pone la base con auth.uid(); la fila
   * optimista usa `authorId` (el usuario de la sesión) solo para pintarse mientras tanto.
   */
  readonly addComment: (body: string, authorId: string) => Promise<Comment>
  /** Solo el autor puede borrar (política RLS); si no, rechaza y el comentario vuelve. */
  readonly deleteComment: (id: string) => Promise<void>
  readonly refetch: () => Promise<void>
}

const commentKey: KeyOf<Comment> = (row) => row.id ?? null
const chronological: Compare<Comment> = (a, b) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

/** @param taskId tarea abierta; null = ninguna (lista vacía, sin canal). */
export function useComments(taskId: string | null): UseCommentsResult {
  const { comments: repository } = useRepositories()
  const { data, loading, error, mutationError, lastRemoteChange, refetch, controls } =
    useRealtimeCollection({
      scopeId: taskId,
      source: repository,
      keyOf: commentKey,
      compare: chronological,
    })

  const addComment = useCallback(
    async (body: string, authorId: string): Promise<Comment> => {
      if (taskId === null) throw new Error('No hay una tarea seleccionada')
      const id = crypto.randomUUID()
      const optimistic: Comment = {
        id,
        task_id: taskId,
        author_id: authorId,
        body: body.trim(),
        created_at: new Date().toISOString(),
      }
      return controls.mutateUpsert(optimistic, () => repository.create({ id, task_id: taskId, body }))
    },
    [taskId, repository, controls],
  )

  const deleteComment = useCallback(
    (id: string): Promise<void> => controls.mutateRemove(id, () => repository.remove(id)),
    [repository, controls],
  )

  return { comments: data, loading, error, mutationError, lastRemoteChange, addComment, deleteComment, refetch }
}
