import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createDemoRepositories, DEMO_USER_ID } from '../services/demo'
import type { CommentRepository } from '../services/types'
import { RepositoriesProvider } from './RepositoriesContext'
import { useComments } from './useComments'

const TASK_WITH_COMMENT = '00000000-0000-4000-8000-000000001002'

function setup(override?: Partial<CommentRepository>) {
  const base = createDemoRepositories({ latencyMs: 0 })
  const repositories = { ...base, comments: { ...base.comments, ...override } }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RepositoriesProvider value={repositories}>{children}</RepositoriesProvider>
  )
  return renderHook(() => useComments(TASK_WITH_COMMENT), { wrapper })
}

describe('useComments', () => {
  it('carga los comentarios de la tarea y crea uno de forma optimista', async () => {
    const hook = setup()
    await waitFor(() => expect(hook.result.current.comments).toHaveLength(1))
    await act(async () => {
      await hook.result.current.addComment('Lo reviso hoy', DEMO_USER_ID)
    })
    expect(hook.result.current.comments.map((c) => c.body)).toEqual([
      'Recordar limpiar el canal con removeChannel.',
      'Lo reviso hoy',
    ])
  })

  it('si crear falla, el comentario optimista desaparece y el error queda visible', async () => {
    let fail: (error: Error) => void = () => {}
    const create = vi.fn<CommentRepository['create']>(() => new Promise((_resolve, reject) => { fail = reject }))
    const hook = setup({ create })
    await waitFor(() => expect(hook.result.current.comments).toHaveLength(1))

    let pending: Promise<unknown> = Promise.resolve()
    act(() => {
      pending = hook.result.current.addComment('Se va a perder', DEMO_USER_ID)
    })
    expect(hook.result.current.comments).toHaveLength(2)
    await act(async () => {
      fail(new Error('permission denied for table comments'))
      await pending.catch(() => {})
    })
    expect(hook.result.current.comments).toHaveLength(1)
    expect(hook.result.current.mutationError?.message).toContain('permission denied')
  })
})
