// Utilidades de prueba: promesas controlables, filas de ejemplo y un TaskRepository falso
// cuyo canal "Realtime" se dispara a mano desde la prueba.
import { vi } from 'vitest'
import type { ChangeEvent, ChangeListener, TaskRepository } from '../services/types'
import type { Task } from '../types'

export type Deferred<T> = {
  readonly promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export const PROJECT_A = '10000000-0000-4000-8000-00000000000a'
export const PROJECT_B = '10000000-0000-4000-8000-00000000000b'

let counter = 0
export function makeTask(overrides: Partial<Task> = {}): Task {
  counter += 1
  const stamp = new Date(Date.UTC(2026, 10, 10, 12, 0, counter)).toISOString()
  return {
    id: crypto.randomUUID(),
    project_id: PROJECT_A,
    title: `Tarea ${counter}`,
    description: null,
    status: 'todo',
    assignee_id: null,
    created_by: '20000000-0000-4000-8000-000000000001',
    created_at: stamp,
    updated_at: stamp,
    ...overrides,
  }
}

type Subscriber = { readonly scope: string; readonly onChange: ChangeListener<Task> }

/**
 * Repositorio falso. Por defecto list() responde con las filas del proyecto; con
 * `holdLists = true` cada list() queda pendiente en `pendingLists` hasta que la prueba la resuelva.
 */
export function createFakeTaskRepository(initial: readonly Task[] = []) {
  const rows = new Map(initial.map((task) => [task.id, task]))
  const subscribers = new Set<Subscriber>()
  const pendingLists: { scope: string; signal: AbortSignal | undefined; reply: Deferred<Task[]> }[] = []
  const control = { holdLists: false, unsubscribed: 0 }

  const repository = {
    list: vi.fn((scope: string, signal?: AbortSignal): Promise<Task[]> => {
      if (control.holdLists) {
        const reply = deferred<Task[]>()
        pendingLists.push({ scope, signal, reply })
        return reply.promise
      }
      return Promise.resolve([...rows.values()].filter((task) => task.project_id === scope))
    }),
    create: vi.fn<TaskRepository['create']>(),
    update: vi.fn<TaskRepository['update']>(),
    remove: vi.fn<TaskRepository['remove']>(),
    subscribe: vi.fn((scope: string, onChange: ChangeListener<Task>) => {
      const subscriber = { scope, onChange }
      subscribers.add(subscriber)
      return () => {
        if (subscribers.delete(subscriber)) control.unsubscribed += 1
      }
    }),
  } satisfies TaskRepository

  /** Entrega un evento como lo haría Supabase: INSERT/UPDATE por scope, DELETE a todos. */
  function emit(event: ChangeEvent<Task>): void {
    for (const subscriber of [...subscribers]) {
      const inScope = event.type === 'DELETE' || subscriber.scope === event.row.project_id
      if (inScope) subscriber.onChange(event)
    }
  }

  return { repository, emit, pendingLists, control, subscriberCount: () => subscribers.size }
}
