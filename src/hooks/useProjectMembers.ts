// useProjectMembers(projectId): miembros de un proyecto (entidad Usuarios), en tiempo real.
//
// Compone el mismo núcleo que useTasks y useComments. La clave de una membresía es compuesta
// (project_id, user_id): es la clave primaria de la tabla y, por tanto, lo único que traen los
// eventos DELETE con RLS activo, así que basta para reconciliarlos.
// Los nombres visibles salen de useProfiles(ids), que tiene su propia caché por id.
import { useCallback } from 'react'
import type { ProjectMember, ProjectRole } from '../types'
import { useRepositories } from './RepositoriesContext'
import { useRealtimeCollection, type Compare, type KeyOf } from './useRealtimeCollection'

export type UseProjectMembersResult = {
  readonly members: readonly ProjectMember[]
  readonly loading: boolean
  readonly error: Error | null
  readonly mutationError: Error | null
  /** Solo un owner puede agregar (política RLS). Sin optimismo: la base valida usuario y duplicado. */
  readonly addMember: (userId: string, role?: ProjectRole) => Promise<ProjectMember>
  /** Optimista con reversión. Un owner quita a cualquiera; un miembro solo a sí mismo. */
  readonly removeMember: (userId: string) => Promise<void>
  readonly refetch: () => Promise<void>
}

export function memberKeyOf(projectId: string, userId: string): string {
  return `${projectId}:${userId}`
}

const memberKey: KeyOf<ProjectMember> = (row) =>
  row.project_id !== undefined && row.user_id !== undefined
    ? memberKeyOf(row.project_id, row.user_id)
    : null

/** Owners primero; dentro de cada rol, por antigüedad. */
const ownersFirst: Compare<ProjectMember> = (a, b) =>
  Number(b.role === 'owner') - Number(a.role === 'owner') ||
  a.created_at.localeCompare(b.created_at) ||
  a.user_id.localeCompare(b.user_id)

/** @param projectId proyecto seleccionado; null = ninguno (lista vacía, sin canal). */
export function useProjectMembers(projectId: string | null): UseProjectMembersResult {
  const { members: repository } = useRepositories()
  const { data, loading, error, mutationError, refetch, controls } = useRealtimeCollection({
    scopeId: projectId,
    source: repository,
    keyOf: memberKey,
    compare: ownersFirst,
  })

  const addMember = useCallback(
    async (userId: string, role?: ProjectRole): Promise<ProjectMember> => {
      if (projectId === null) throw new Error('No hay un proyecto seleccionado')
      // exactOptionalPropertyTypes: `role` solo se incluye si viene definido.
      const added = await repository.add(
        role === undefined
          ? { project_id: projectId, user_id: userId }
          : { project_id: projectId, user_id: userId, role },
      )
      controls.upsertConfirmed(added)
      return added
    },
    [projectId, repository, controls],
  )

  const removeMember = useCallback(
    async (userId: string): Promise<void> => {
      if (projectId === null) throw new Error('No hay un proyecto seleccionado')
      await controls.mutateRemove(memberKeyOf(projectId, userId), () =>
        repository.remove(projectId, userId),
      )
    },
    [projectId, repository, controls],
  )

  return { members: data, loading, error, mutationError, addMember, removeMember, refetch }
}
