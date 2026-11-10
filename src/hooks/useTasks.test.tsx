import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoRepositories } from '../services'
import { PROJECT_A, PROJECT_B, createFakeTaskRepository, deferred, makeTask } from '../test/helpers'
import type { Task } from '../types'
import { RepositoriesProvider } from './RepositoriesContext'
import { useTasks } from './useTasks'

function setup(initial: readonly Task[] = [], projectId: string | null = PROJECT_A) {
  const fake = createFakeTaskRepository(initial)
  const repositories = { ...createDemoRepositories({ latencyMs: 0 }), tasks: fake.repository }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RepositoriesProvider value={repositories}>{children}</RepositoriesProvider>
  )
  const hook = renderHook(({ id }: { id: string | null }) => useTasks(id), {
    initialProps: { id: projectId },
    wrapper,
  })
  return { ...fake, hook }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTasks · carga', () => {
  it('empieza en loading y entrega las tareas del proyecto', async () => {
    const a = makeTask()
    const other = makeTask({ project_id: PROJECT_B })
    const { hook, repository } = setup([a, other])
    expect(hook.result.current.loading).toBe(true)
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(hook.result.current.tasks).toEqual([a])
    expect(hook.result.current.error).toBeNull()
    expect(repository.list).toHaveBeenCalledWith(PROJECT_A, expect.any(AbortSignal))
  })

  it('expone el error de carga y se recupera con refetch', async () => {
    const a = makeTask()
    const { hook, repository } = setup([a])
    repository.list.mockRejectedValueOnce(new Error('sin red'))
    hook.rerender({ id: PROJECT_B })
    hook.rerender({ id: PROJECT_A })
    await waitFor(() => expect(hook.result.current.error?.message).toBe('sin red'))
    expect(hook.result.current.loading).toBe(false)
    await act(() => hook.result.current.refetch())
    expect(hook.result.current.error).toBeNull()
    expect(hook.result.current.tasks).toEqual([a])
  })

  it('sin proyecto (null) no carga ni abre canal', () => {
    const { hook, repository } = setup([], null)
    expect(hook.result.current.loading).toBe(false)
    expect(repository.list).not.toHaveBeenCalled()
    expect(repository.subscribe).not.toHaveBeenCalled()
  })
})

describe('useTasks · mutaciones optimistas', () => {
  it('createTask pinta la tarea antes de que responda el servidor y la confirma', async () => {
    const { hook, repository } = setup([])
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    const reply = deferred<Task>()
    repository.create.mockReturnValueOnce(reply.promise)

    let pending: Promise<Task> = Promise.resolve(makeTask())
    act(() => {
      pending = hook.result.current.createTask({ title: '  Escribir el plan ' })
    })
    expect(hook.result.current.tasks).toHaveLength(1)
    const optimistic = hook.result.current.tasks[0]
    expect(optimistic?.title).toBe('Escribir el plan')
    // El id lo genera el hook y viaja al servidor: la fila optimista ya tiene su clave real.
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ id: optimistic?.id, project_id: PROJECT_A }))

    const saved = makeTask({ id: optimistic?.id ?? '', title: 'Escribir el plan' })
    await act(async () => {
      reply.resolve(saved)
      await pending
    })
    expect(hook.result.current.tasks).toEqual([saved])
  })

  it('createTask revierte si el servidor falla y deja el error visible', async () => {
    const { hook, repository } = setup([])
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    repository.create.mockRejectedValueOnce(new Error('violates row-level security policy'))
    await act(async () => {
      await expect(hook.result.current.createTask({ title: 'X' })).rejects.toThrow('row-level security')
    })
    expect(hook.result.current.tasks).toEqual([])
    expect(hook.result.current.mutationError?.message).toContain('row-level security')
  })

  it('updateTask pinta el cambio y, si falla, vuelve EXACTAMENTE a la fila previa', async () => {
    const a = makeTask({ status: 'todo' })
    const { hook, repository } = setup([a])
    await waitFor(() => expect(hook.result.current.tasks).toEqual([a]))
    const reply = deferred<Task>()
    repository.update.mockReturnValueOnce(reply.promise)

    let pending: Promise<Task> = Promise.resolve(a)
    act(() => {
      pending = hook.result.current.updateTask(a.id, { status: 'done' })
    })
    expect(hook.result.current.tasks[0]?.status).toBe('done')

    await act(async () => {
      reply.reject(new Error('permission denied'))
      await pending.catch(() => {})
    })
    expect(hook.result.current.tasks).toEqual([a])
    expect(hook.result.current.mutationError?.message).toBe('permission denied')
  })

  it('deleteTask quita la fila al instante y la devuelve a su lugar si falla', async () => {
    const a = makeTask()
    const b = makeTask()
    const c = makeTask()
    const { hook, repository } = setup([a, b, c])
    await waitFor(() => expect(hook.result.current.tasks).toHaveLength(3))
    const reply = deferred<void>()
    repository.remove.mockReturnValueOnce(reply.promise)

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = hook.result.current.deleteTask(b.id)
    })
    expect(hook.result.current.tasks).toEqual([a, c])
    await act(async () => {
      reply.reject(new Error('no existe'))
      await pending.catch(() => {})
    })
    expect(hook.result.current.tasks).toEqual([a, b, c])
  })
})

describe('useTasks · tiempo real', () => {
  it('aplica INSERT, UPDATE y DELETE de otros usuarios y avisa del último', async () => {
    const a = makeTask()
    const { hook, emit } = setup([a])
    await waitFor(() => expect(hook.result.current.loading).toBe(false))

    const remote = makeTask({ title: 'De otro usuario' })
    act(() => emit({ type: 'INSERT', row: remote }))
    expect(hook.result.current.tasks).toEqual([a, remote])
    expect(hook.result.current.lastRemoteChange?.type).toBe('INSERT')

    const moved = { ...remote, status: 'done' as const, updated_at: '2026-11-10T13:00:00.000Z' }
    act(() => emit({ type: 'UPDATE', row: moved }))
    expect(hook.result.current.tasks[1]).toEqual(moved)

    // Medido en Supabase local: con RLS el DELETE trae solo { id }.
    act(() => emit({ type: 'DELETE', old: { id: remote.id } }))
    expect(hook.result.current.tasks).toEqual([a])
    expect(hook.result.current.lastRemoteChange).toMatchObject({ type: 'DELETE', row: { title: 'De otro usuario' } })
  })

  it('ignora el INSERT de otro proyecto y el DELETE de una fila ajena', async () => {
    const a = makeTask()
    const { hook, emit } = setup([a])
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    act(() => emit({ type: 'DELETE', old: { id: crypto.randomUUID() } }))
    expect(hook.result.current.tasks).toEqual([a])
    expect(hook.result.current.lastRemoteChange).toBeNull()
  })

  it('no duplica el eco de un create propio, aunque llegue ANTES que la respuesta HTTP', async () => {
    const { hook, repository, emit } = setup([])
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    const reply = deferred<Task>()
    repository.create.mockReturnValueOnce(reply.promise)

    let pending: Promise<Task> = Promise.resolve(makeTask())
    act(() => {
      pending = hook.result.current.createTask({ title: 'Eco' })
    })
    const id = hook.result.current.tasks[0]?.id ?? ''
    const saved = makeTask({ id, title: 'Eco' })

    act(() => emit({ type: 'INSERT', row: saved })) // el eco gana la carrera
    expect(hook.result.current.tasks).toHaveLength(1)

    await act(async () => {
      reply.resolve(saved)
      await pending
    })
    act(() => emit({ type: 'INSERT', row: saved })) // y otro eco tardío, por si acaso
    expect(hook.result.current.tasks).toEqual([saved])
    expect(hook.result.current.lastRemoteChange).toBeNull() // el eco propio no se anuncia
  })
})

describe('useTasks · ciclo de vida', () => {
  it('al cambiar de proyecto cierra el canal anterior y descarta la respuesta tardía', async () => {
    const a = makeTask()
    const b = makeTask({ project_id: PROJECT_B })
    const { hook, control, pendingLists, subscriberCount } = setup([a, b])
    control.holdLists = true
    hook.rerender({ id: PROJECT_B })
    hook.rerender({ id: PROJECT_A })
    hook.rerender({ id: PROJECT_B })
    // La primera carga (de A) ya respondió; quedan pendientes las de B, A, B.
    const [firstB, lateA, lastB] = pendingLists
    expect(firstB?.signal?.aborted).toBe(true)
    expect(lateA?.signal?.aborted).toBe(true)
    expect(subscriberCount()).toBe(1)
    expect(control.unsubscribed).toBe(3)

    await act(async () => {
      lateA?.reply.resolve([a]) // llega tarde: no debe pintarse en B
      lastB?.reply.resolve([b])
    })
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(hook.result.current.tasks).toEqual([b])
  })

  it('una mutación que termina después de cambiar de proyecto no toca el estado nuevo', async () => {
    const a = makeTask()
    const b = makeTask({ project_id: PROJECT_B })
    const { hook, repository } = setup([a, b])
    await waitFor(() => expect(hook.result.current.tasks).toEqual([a]))
    const reply = deferred<Task>()
    repository.update.mockReturnValueOnce(reply.promise)
    let pending: Promise<Task> = Promise.resolve(a)
    act(() => {
      pending = hook.result.current.updateTask(a.id, { title: 'cambiado' })
    })
    hook.rerender({ id: PROJECT_B })
    await waitFor(() => expect(hook.result.current.tasks).toEqual([b]))
    await act(async () => {
      reply.resolve({ ...a, title: 'cambiado' })
      await pending
    })
    expect(hook.result.current.tasks).toEqual([b])
  })

  it('al desmontar aborta la carga, cierra el canal y no hay setState después', async () => {
    const errors = vi.spyOn(console, 'error')
    const { hook, control, pendingLists, subscriberCount, emit } = setup([])
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    control.holdLists = true
    await act(() => {
      void hook.result.current.refetch()
      return Promise.resolve()
    })
    hook.unmount()
    expect(pendingLists[0]?.signal?.aborted).toBe(true)
    expect(subscriberCount()).toBe(0)
    expect(control.unsubscribed).toBe(1)
    await act(async () => {
      pendingLists[0]?.reply.resolve([makeTask()])
      emit({ type: 'INSERT', row: makeTask() })
    })
    expect(errors).not.toHaveBeenCalled()
  })
})
