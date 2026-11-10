// Acceso a los repositorios desde React. Los hooks lo usan; los componentes no lo ven: solo
// consumen hooks (useDataMode, useDemoControls, useTasks...).
import { createContext, useContext, useState, type ReactNode } from 'react'
import { createRepositories } from '../services'
import type { DataMode, DemoControls, Repositories } from '../services/types'

const RepositoriesContext = createContext<Repositories | null>(null)

export type RepositoriesProviderProps = {
  /** Si se omite, se crean los repositorios reales (o demo si faltan las variables). */
  readonly value?: Repositories
  readonly children: ReactNode
}

/**
 * Inyecta los repositorios. La app no pasa `value`: el proveedor llama a createRepositories()
 * una sola vez (useState perezoso), así App.tsx no importa src/services. Las pruebas pasan
 * createDemoRepositories({ latencyMs: 0 }) o un doble a medida.
 */
export function RepositoriesProvider({ value, children }: RepositoriesProviderProps) {
  const [repositories] = useState<Repositories>(
    () => value ?? createRepositories(typeof window === 'undefined' ? '' : window.location.search),
  )
  return <RepositoriesContext value={repositories}>{children}</RepositoriesContext>
}

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoriesContext)
  if (repositories === null) {
    throw new Error('useRepositories debe usarse dentro de <RepositoriesProvider>')
  }
  return repositories
}

/** 'demo' cuando la app corre sin Supabase; la UI debe mostrarlo. */
export function useDataMode(): DataMode {
  return useRepositories().mode
}

/** Controles del modo demo (simular a otro usuario); null en modo Supabase. */
export function useDemoControls(): DemoControls | null {
  return useRepositories().demo ?? null
}
