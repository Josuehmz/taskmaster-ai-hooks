// El proveedor sin `value` carga el modo que toca con import() dinámico (paso 5).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RepositoriesProvider, useDataMode } from './RepositoriesContext'

function Mode() {
  return <p>modo: {useDataMode()}</p>
}

describe('RepositoriesProvider', () => {
  it('sin variables de Supabase muestra "Preparando…" y luego entra en modo demo', async () => {
    render(
      <RepositoriesProvider>
        <Mode />
      </RepositoriesProvider>,
    )
    expect(screen.getByText('Preparando TaskMaster AI…')).toBeTruthy()
    expect(await screen.findByText('modo: demo')).toBeTruthy()
  })
})
