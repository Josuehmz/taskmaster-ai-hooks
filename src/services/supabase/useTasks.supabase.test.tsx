// useTasks contra el repositorio REAL de Supabase con un cliente falso: comprueba que el hook
// abre un canal por proyecto y lo cierra con removeChannel al cambiar de proyecto y al desmontar.
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../hooks/RepositoriesContext'
import { useTasks } from '../../hooks/useTasks'
import { PROJECT_A, PROJECT_B, makeTask } from '../../test/helpers'
import { createFakeSupabase } from './fakeSupabase'
import { createSupabaseRepositories } from './index'

function setup(strict: boolean) {
  const a = makeTask({ project_id: PROJECT_A })
  const b = makeTask({ project_id: PROJECT_B })
  const fake = createFakeSupabase((table, eq) =>
    table === 'tasks' ? [a, b].filter((task) => task.project_id === eq['project_id']) : [],
  )
  const repositories = createSupabaseRepositories(fake.client)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RepositoriesProvider value={repositories}>{children}</RepositoriesProvider>
  )
  const hook = renderHook(({ id }: { id: string }) => useTasks(id), {
    initialProps: { id: PROJECT_A },
    wrapper,
    reactStrictMode: strict,
  })
  return { ...fake, hook, a, b }
}

describe('useTasks + supabase-js: limpieza de canales', () => {
  it('un canal por proyecto; removeChannel al cambiar de proyecto y al desmontar', async () => {
    const { hook, channels, removeChannel, openChannels, a, b } = setup(false)
    await waitFor(() => expect(hook.result.current.tasks).toEqual([a]))
    expect(channels).toHaveLength(1)
    expect(channels[0]?.bindings[0]?.filter['filter']).toBe(`project_id=eq.${PROJECT_A}`)

    hook.rerender({ id: PROJECT_B })
    await waitFor(() => expect(hook.result.current.tasks).toEqual([b]))
    expect(removeChannel).toHaveBeenCalledWith(channels[0])
    expect(openChannels()).toHaveLength(1)
    expect(openChannels()[0]?.bindings[0]?.filter['filter']).toBe(`project_id=eq.${PROJECT_B}`)

    hook.unmount()
    expect(openChannels()).toHaveLength(0)
    expect(removeChannel).toHaveBeenCalledTimes(channels.length) // ni uno sin cerrar
  })

  it('en StrictMode (montar, desmontar, montar) no quedan canales huérfanos', async () => {
    const { hook, channels, openChannels, a } = setup(true)
    await waitFor(() => expect(hook.result.current.tasks).toEqual([a]))
    expect(channels.length).toBeGreaterThanOrEqual(2)
    expect(openChannels()).toHaveLength(1)
    // Nombres únicos: el canal que se cierra y el que se abre no chocan por topic.
    expect(new Set(channels.map((c) => c.name)).size).toBe(channels.length)
    hook.unmount()
    expect(openChannels()).toHaveLength(0)
  })
})
