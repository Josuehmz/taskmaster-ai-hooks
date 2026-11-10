// Composición de la capa de servicios.
//
// Este módulo y src/services/supabase/ son los ÚNICOS que conocen src/lib/supabaseClient.ts.
// App.tsx (raíz de composición) llama a createRepositories() una vez y lo entrega por contexto;
// los hooks consumen las interfaces de ./types y los componentes solo consumen hooks.
import { supabase } from '../lib/supabaseClient'
import { createDemoRepositories } from './demo'
import { createSupabaseRepositories } from './supabase'
import type { Repositories } from './types'

export function createRepositories(): Repositories {
  // Sin VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY -> modo demo (la UI lo rotula).
  return supabase ? createSupabaseRepositories(supabase) : createDemoRepositories()
}

export { createDemoRepositories } from './demo'
export { RepositoryError } from './errors'
export type { RepositoryErrorCode } from './errors'
export type {
  ChangeEvent,
  DataMode,
  Repositories,
  ScopedCollectionSource,
  SubscriptionStatus,
} from './types'
