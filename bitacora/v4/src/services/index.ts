// Composición de la capa de servicios.
//
// Este módulo y src/services/supabase/ son los ÚNICOS que conocen src/lib/supabaseClient.ts.
// El proveedor de datos de src/hooks/DataProvider.tsx llama a createRepositories() una vez; los
// hooks consumen las interfaces de ./types y los componentes solo consumen hooks.
import { supabase } from '../lib/supabaseClient'
import { createDemoRepositories, type DemoOptions } from './demo'
import { createSupabaseRepositories } from './supabase'
import type { Repositories } from './types'

/**
 * Lee los parámetros que solo valen en modo demo, para poder demostrar los estados:
 *   ?demo=lento          la carga tarda 2,5 s
 *   ?demo=error          la carga falla
 *   ?demo=falla-guardar  las mutaciones fallan (se ve la reversión del cambio optimista)
 */
export function demoOptionsFromSearch(search: string): DemoOptions {
  const mode = new URLSearchParams(search).get('demo')
  switch (mode) {
    case 'lento':
      return { latencyMs: 2500 }
    case 'error':
      return { failLoads: true }
    case 'falla-guardar':
      return { failWrites: true }
    default:
      return {}
  }
}

export function createRepositories(search = ''): Repositories {
  // Sin VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY -> modo demo (la UI lo rotula).
  return supabase
    ? createSupabaseRepositories(supabase)
    : createDemoRepositories(demoOptionsFromSearch(search))
}

export { createDemoRepositories, DEMO_USER_ID } from './demo'
export type { DemoOptions } from './demo'
export { RepositoryError } from './errors'
export type { RepositoryErrorCode } from './errors'
export type {
  ChangeEvent,
  DataMode,
  DemoControls,
  Repositories,
  ScopedCollectionSource,
  SubscriptionStatus,
} from './types'
