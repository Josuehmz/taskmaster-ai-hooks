// Cliente único de Supabase.
//
// Regla de capas: SOLO src/services/ importa este archivo. Ni los hooks ni los componentes lo
// conocen; así la app puede correr contra un repositorio demo en memoria sin cambiar la UI.
//
// El cliente se crea solo si existen VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Si falta
// alguna, `supabase` vale null y src/services/index.ts elige el repositorio demo.
// Solo la anon (publishable) key va aquí: la service_role nunca va en el frontend.
import { createClient } from '@supabase/supabase-js'

function readEnv(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const url = readEnv(import.meta.env.VITE_SUPABASE_URL)
const anonKey = readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabase = url !== null && anonKey !== null ? createClient(url, anonKey) : null

export type TaskMasterClient = NonNullable<typeof supabase>
