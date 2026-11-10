// Repositorios de proyectos y perfiles sobre Supabase.
import type { TaskMasterClient } from '../../lib/supabaseClient'
import type { Profile, Project } from '../../types'
import { RepositoryError, toRepositoryError } from '../errors'
import type { ProfileRepository, ProjectRepository } from '../types'
import { PROJECT_INSERT_COLUMNS, assertUuid, pickDefined } from '../validation'
import { asRow, asRows } from './shared'

const PROJECT_COLUMNS = 'id, name, description, created_by, created_at'
const PROFILE_COLUMNS = 'id, display_name, created_at'

export function createSupabaseProjectRepository(client: TaskMasterClient): ProjectRepository {
  return {
    // El scope se ignora: RLS ya devuelve solo los proyectos donde el usuario es miembro.
    // Sin subscribe: projects no está en la publicación Realtime (cambia poco); se usa refetch.
    async list(_scope, signal) {
      let query = client
        .from('projects')
        .select(PROJECT_COLUMNS)
        .order('created_at', { ascending: false })
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      if (error) throw toRepositoryError(error)
      return asRows<Project>(data)
    },

    async create(input) {
      const name = input.name.trim()
      if (name.length === 0) throw new RepositoryError('validation', 'El proyecto necesita nombre')
      // created_by: default auth.uid(). El trigger on_project_created inserta al creador como owner.
      const { data, error } = await client
        .from('projects')
        .insert(pickDefined({ ...input, name }, PROJECT_INSERT_COLUMNS))
        .select(PROJECT_COLUMNS)
        .single()
      if (error) throw toRepositoryError(error)
      return asRow<Project>(data, 'el proyecto creado')
    },
  }
}

export function createSupabaseProfileRepository(client: TaskMasterClient): ProfileRepository {
  return {
    async getByIds(ids, signal) {
      if (ids.length === 0) return []
      for (const id of ids) assertUuid(id, 'id de perfil')
      let query = client.from('profiles').select(PROFILE_COLUMNS).in('id', [...ids])
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      if (error) throw toRepositoryError(error)
      return asRows<Profile>(data)
    },
  }
}
