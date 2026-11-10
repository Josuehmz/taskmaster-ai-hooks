// Acceso a los repositorios desde React. Los hooks lo usan; los componentes, no directamente
// (salvo useDataMode para rotular el modo demo).
import { createContext, useContext, type ReactNode } from 'react'
import type { DataMode, Repositories } from '../services/types'

const RepositoriesContext = createContext<Repositories | null>(null)

export type RepositoriesProviderProps = {
  readonly value: Repositories
  readonly children: ReactNode
}

/**
 * Inyecta los repositorios. App.tsx pasa los reales (o demo si faltan las variables); las
 * pruebas pasan createDemoRepositories({ latencyMs: 0 }) o un doble a medida.
 * `value` debe ser estable (crearlo una vez fuera del render): es dependencia de los efectos.
 */
export function RepositoriesProvider({ value, children }: RepositoriesProviderProps) {
  return <RepositoriesContext value={value}>{children}</RepositoriesContext>
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
