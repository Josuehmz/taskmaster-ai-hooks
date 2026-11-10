// Repositorio de tareas sobre Supabase.
import type { TaskMasterClient } from '../../lib/supabaseClient'
import type { Task } from '../../types'
import { RepositoryError, toRepositoryError } from '../errors'
import type { TaskRepository } from '../types'
import { TASK_INSERT_COLUMNS, TASK_UPDATE_COLUMNS, assertUuid, pickDefined } from '../validation'
import { subscribeToTable } from './realtime'
import { asRow, asRows, ensureDeleted } from './shared'

const TASK_COLUMNS =
  'id, project_id, title, description, status, assignee_id, created_by, created_at, updated_at'

export function createSupabaseTaskRepository(client: TaskMasterClient): TaskRepository {
  return {
    async list(projectId, signal) {
      assertUuid(projectId, 'projectId')
      let query = client
        .from('tasks')
        .select(TASK_COLUMNS)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      if (error) throw toRepositoryError(error)
      return asRows<Task>(data)
    },

    async create(input) {
      assertUuid(input.project_id, 'project_id')
      if (input.id !== undefined) assertUuid(input.id, 'id')
      // created_by NO va en el payload: default auth.uid() + with check de la política.
      // id SÍ puede ir: lo genera el hook para que la fila optimista tenga su clave definitiva.
      const { data, error } = await client
        .from('tasks')
        .insert(pickDefined(input, TASK_INSERT_COLUMNS))
        .select(TASK_COLUMNS)
        .single()
      if (error) throw toRepositoryError(error)
      return asRow<Task>(data, 'la tarea creada')
    },

    async update(id, patch) {
      assertUuid(id, 'id')
      const changes = pickDefined(patch, TASK_UPDATE_COLUMNS)
      if (Object.keys(changes).length === 0) {
        throw new RepositoryError('validation', 'No hay cambios que guardar')
      }
      // updated_at lo pone el trigger tasks_set_updated_at, no el cliente.
      const { data, error } = await client
        .from('tasks')
        .update(changes)
        .eq('id', id)
        .select(TASK_COLUMNS)
        .single()
      if (error) throw toRepositoryError(error)
      return asRow<Task>(data, 'la tarea actualizada')
    },

    async remove(id) {
      assertUuid(id, 'id')
      const { data, error } = await client.from('tasks').delete().eq('id', id).select('id')
      if (error) throw toRepositoryError(error)
      ensureDeleted(data, 'La tarea')
    },

    subscribe(projectId, onChange, onStatus) {
      return subscribeToTable<Task>(
        client,
        { table: 'tasks', column: 'project_id', value: projectId },
        onChange,
        onStatus,
      )
    },
  }
}
