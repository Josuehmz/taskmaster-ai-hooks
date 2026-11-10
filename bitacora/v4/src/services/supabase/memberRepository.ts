// Repositorio de miembros de proyecto sobre Supabase.
import type { TaskMasterClient } from '../../lib/supabaseClient'
import type { ProjectMember } from '../../types'
import { toRepositoryError } from '../errors'
import type { ProjectMemberRepository } from '../types'
import { MEMBER_INSERT_COLUMNS, assertUuid, pickDefined } from '../validation'
import { subscribeToTable } from './realtime'
import { asRow, asRows, ensureDeleted } from './shared'

const MEMBER_COLUMNS = 'project_id, user_id, role, created_at'

export function createSupabaseMemberRepository(client: TaskMasterClient): ProjectMemberRepository {
  return {
    async list(projectId, signal) {
      assertUuid(projectId, 'projectId')
      let query = client
        .from('project_members')
        .select(MEMBER_COLUMNS)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      if (error) throw toRepositoryError(error)
      return asRows<ProjectMember>(data)
    },

    async add(input) {
      assertUuid(input.project_id, 'project_id')
      assertUuid(input.user_id, 'user_id')
      // Solo un owner pasa la política de insert; el rol por defecto es 'member'.
      const { data, error } = await client
        .from('project_members')
        .insert(pickDefined(input, MEMBER_INSERT_COLUMNS))
        .select(MEMBER_COLUMNS)
        .single()
      if (error) throw toRepositoryError(error)
      return asRow<ProjectMember>(data, 'el miembro agregado')
    },

    async remove(projectId, userId) {
      assertUuid(projectId, 'projectId')
      assertUuid(userId, 'userId')
      // Owner quita a cualquiera; un miembro solo se quita a sí mismo. El trigger
      // project_members_protect_last_owner impide dejar el proyecto sin owner.
      const { data, error } = await client
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .select('user_id')
      if (error) throw toRepositoryError(error)
      ensureDeleted(data, 'El miembro')
    },

    subscribe(projectId, onChange, onStatus) {
      return subscribeToTable<ProjectMember>(
        client,
        { table: 'project_members', column: 'project_id', value: projectId },
        onChange,
        onStatus,
      )
    },
  }
}
