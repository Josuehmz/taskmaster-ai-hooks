// Acceso a los repositorios desde React. Los hooks lo usan; los componentes no lo ven: solo
// consumen hooks (useDataMode, useDemoControls, useTasks...).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
 * una sola vez y, como ese código se descarga con import() dinámico, muestra un estado de carga
 * hasta tenerlos. Las pruebas pasan `value` (createDemoRepositories({ latencyMs: 0 }) o un doble)
 * y entonces todo es síncrono, como antes.
 */
export function RepositoriesProvider({ value, children }: RepositoriesProviderProps) {
  const [repositories, setRepositories] = useState<Repositories | null>(value ?? null)
  const [failure, setFailure] = useState<Error | null>(null)

  useEffect(() => {
    if (repositories !== null) return
    let active = true
    createRepositories(typeof window === 'undefined' ? '' : window.location.search).then(
      (created) => {
        if (active) setRepositories(created)
      },
      (error: unknown) => {
        if (active) setFailure(error instanceof Error ? error : new Error(String(error)))
      },
    )
    return () => {
      active = false
    }
  }, [repositories])

  if (failure !== null) {
    return (
      <p role="alert" className="p-6 text-sm text-red-700">
        No se pudo iniciar la capa de datos: {failure.message}
      </p>
    )
  }
  if (repositories === null) {
    return <output className="block p-6 text-sm text-slate-600">Preparando TaskMaster AI…</output>
  }
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
