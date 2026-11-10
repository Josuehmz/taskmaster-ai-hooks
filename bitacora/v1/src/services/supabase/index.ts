// Ensambla los repositorios reales a partir del cliente de Supabase.
import type { TaskMasterClient } from '../../lib/supabaseClient'
import type { Repositories } from '../types'
import { createSupabaseCommentRepository } from './commentRepository'
import { createSupabaseMemberRepository } from './memberRepository'
import {
  createSupabaseProfileRepository,
  createSupabaseProjectRepository,
} from './projectRepository'
import { createSupabaseTaskRepository } from './taskRepository'

export function createSupabaseRepositories(client: TaskMasterClient): Repositories {
  return {
    mode: 'supabase',
    projects: createSupabaseProjectRepository(client),
    members: createSupabaseMemberRepository(client),
    tasks: createSupabaseTaskRepository(client),
    comments: createSupabaseCommentRepository(client),
    profiles: createSupabaseProfileRepository(client),
  }
}
