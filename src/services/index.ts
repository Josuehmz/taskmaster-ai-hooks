// Composición de la capa de servicios.
//
// Este módulo y src/services/supabase/ son los ÚNICOS que conocen src/lib/supabaseClient.ts.
// RepositoriesProvider (src/hooks/) llama a createRepositories() una vez; los hooks consumen las
// interfaces de ./types y los componentes solo consumen hooks.
//
// Tamaño de bundle (paso 5): cada modo se carga con import() dinámico, así el chunk inicial no
// lleva ni supabase-js (210 kB, que el modo demo nunca usa) ni el repositorio demo con sus datos
// simulados (que el modo Supabase nunca usa). Por eso aquí NO hay imports estáticos de ./demo,
// ./supabase ni ../lib: solo tipos, que se borran al compilar.
import type { DemoOptions } from './demo'
import type { Repositories } from './types'

/** true si existen las dos variables (Vite las reemplaza al compilar). */
export function hasSupabaseConfig(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  return Boolean(url) && Boolean(anonKey)
}

/**
 * Lee los parámetros que solo valen en modo demo, para poder demostrar los estados:
 *   ?demo=lento          la carga de tareas tarda 2,5 s
 *   ?demo=error          la primera carga de tareas falla («Reintentar» la recupera)
 *   ?demo=falla-guardar  las mutaciones fallan (se ve la reversión del cambio optimista)
 */
export function demoOptionsFromSearch(search: string): DemoOptions {
  const mode = new URLSearchParams(search).get('demo')
  switch (mode) {
    case 'lento':
      return { slowTaskLoads: true }
    case 'error':
      return { failFirstTaskLoad: true }
    case 'falla-guardar':
      return { failWrites: true }
    default:
      return {}
  }
}

/** Crea los repositorios del modo que corresponda, descargando solo el código de ese modo. */
export async function createRepositories(search = ''): Promise<Repositories> {
  if (hasSupabaseConfig()) {
    const [{ supabase }, { createSupabaseRepositories }] = await Promise.all([
      import('../lib/supabaseClient'),
      import('./supabase'),
    ])
    if (supabase !== null) return createSupabaseRepositories(supabase)
  }
  // Sin VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY -> modo demo (la UI lo rotula).
  const { createDemoRepositories } = await import('./demo')
  return createDemoRepositories(demoOptionsFromSearch(search))
}

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
