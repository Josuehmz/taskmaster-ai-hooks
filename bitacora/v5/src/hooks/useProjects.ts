// useProjects(): proyectos del usuario. Usa el mismo núcleo, sin Realtime (la fuente no
// implementa subscribe porque projects no está en la publicación): se actualiza con refetch.
import { useCallback } from 'react'
import type { CreateProjectInput, Project } from '../types'
import { useRepositories } from './RepositoriesContext'
import { useRealtimeCollection, type Compare, type KeyOf } from './useRealtimeCollection'

export type UseProjectsResult = {
  readonly projects: readonly Project[]
  readonly loading: boolean
  readonly error: Error | null
  readonly createProject: (input: CreateProjectInput) => Promise<Project>
  readonly refetch: () => Promise<void>
}

/** Scope fijo: RLS ya limita la lista al usuario de la sesión. */
const MY_PROJECTS_SCOPE = 'me'

const projectKey: KeyOf<Project> = (row) => row.id ?? null
const newestFirst: Compare<Project> = (a, b) =>
  b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)

export function useProjects(): UseProjectsResult {
  const { projects: repository } = useRepositories()
  const { data, loading, error, refetch, controls } = useRealtimeCollection({
    scopeId: MY_PROJECTS_SCOPE,
    source: repository,
    keyOf: projectKey,
    compare: newestFirst,
  })

  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<Project> => {
      // Sin optimismo: el id y la membresía de owner los crea la base (default + trigger).
      const created = await repository.create(input)
      controls.upsertConfirmed(created)
      return created
    },
    [repository, controls],
  )

  return { projects: data, loading, error, createProject, refetch }
}
