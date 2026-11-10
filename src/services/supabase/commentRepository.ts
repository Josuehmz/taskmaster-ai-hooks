// Repositorio de comentarios sobre Supabase.
import type { TaskMasterClient } from '../../lib/supabaseClient'
import type { Comment } from '../../types'
import { RepositoryError, toRepositoryError } from '../errors'
import type { CommentRepository } from '../types'
import { assertUuid } from '../validation'
import { subscribeToTable } from './realtime'
import { asRow, asRows, ensureDeleted } from './shared'

const COMMENT_COLUMNS = 'id, task_id, author_id, body, created_at'

export function createSupabaseCommentRepository(client: TaskMasterClient): CommentRepository {
  return {
    async list(taskId, signal) {
      assertUuid(taskId, 'taskId')
      let query = client
        .from('comments')
        .select(COMMENT_COLUMNS)
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      if (error) throw toRepositoryError(error)
      return asRows<Comment>(data)
    },

    async create(input) {
      assertUuid(input.task_id, 'task_id')
      const body = input.body.trim()
      if (body.length === 0) throw new RepositoryError('validation', 'El comentario está vacío')
      // author_id lo pone la base (default auth.uid() + with check de la política).
      const { data, error } = await client
        .from('comments')
        .insert({ task_id: input.task_id, body })
        .select(COMMENT_COLUMNS)
        .single()
      if (error) throw toRepositoryError(error)
      return asRow<Comment>(data, 'el comentario creado')
    },

    async remove(id) {
      assertUuid(id, 'id')
      const { data, error } = await client.from('comments').delete().eq('id', id).select('id')
      if (error) throw toRepositoryError(error)
      ensureDeleted(data, 'El comentario')
    },

    subscribe(taskId, onChange, onStatus) {
      return subscribeToTable<Comment>(
        client,
        { table: 'comments', column: 'task_id', value: taskId },
        onChange,
        onStatus,
      )
    },
  }
}
