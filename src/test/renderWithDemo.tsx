// Monta componentes con repositorios del modo demo (o con reemplazos) para las pruebas de UI.
// Vive en src/test/ y no en src/components/: la regla de capas prohíbe que la UI importe
// src/services, y las pruebas del componente no necesitan saltársela.
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { RepositoriesProvider } from '../hooks/RepositoriesContext'
import { createDemoRepositories, DEMO_USER_ID, type DemoOptions } from '../services/demo'
import type { Repositories } from '../services/types'

export type { AuthRepository, Repositories } from '../services/types'

export { DEMO_USER_ID }
export const DEMO_PROJECT_ID = '00000000-0000-4000-8000-000000000101'

export function renderWithDemo(
  ui: ReactElement,
  override: Partial<Repositories> = {},
  options: DemoOptions = {},
) {
  const repositories: Repositories = { ...createDemoRepositories({ latencyMs: 0, ...options }), ...override }
  return { repositories, ...render(<RepositoriesProvider value={repositories}>{ui}</RepositoriesProvider>) }
}

export function demoRepositories(override: Partial<Repositories> = {}): Repositories {
  return { ...createDemoRepositories({ latencyMs: 0 }), ...override }
}
