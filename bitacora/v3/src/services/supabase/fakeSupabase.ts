// Cliente de Supabase falso para pruebas: imita channel().on().subscribe(), removeChannel y
// la cadena de PostgREST from().select().eq().order().abortSignal() que usan los repositorios.
import { vi } from 'vitest'
import type { TaskMasterClient } from '../../lib/supabaseClient'

type Binding = { readonly type: string; readonly filter: Record<string, string>; readonly callback: (payload: unknown) => void }

export type FakeChannel = {
  readonly name: string
  readonly bindings: Binding[]
  removed: boolean
  on(type: string, filter: Record<string, string>, callback: (payload: unknown) => void): FakeChannel
  subscribe(callback?: (status: string, error?: Error) => void): FakeChannel
}

export function createFakeSupabase(rowsFor: (table: string, eq: Record<string, string>) => unknown[] = () => []) {
  const channels: FakeChannel[] = []
  const removeChannel = vi.fn(async (channel: FakeChannel) => {
    channel.removed = true
    return 'ok' as const
  })

  function channel(name: string): FakeChannel {
    const created: FakeChannel = {
      name,
      bindings: [],
      removed: false,
      on(type, filter, callback) {
        created.bindings.push({ type, filter, callback })
        return created
      },
      subscribe() {
        return created
      },
    }
    channels.push(created)
    return created
  }

  function from(table: string) {
    const eq: Record<string, string> = {}
    const result = () => Promise.resolve({ data: rowsFor(table, eq), error: null })
    const builder = {
      select: () => builder,
      order: () => builder,
      abortSignal: () => builder,
      eq: (column: string, value: string) => {
        eq[column] = value
        return builder
      },
      // PostgREST devuelve un "thenable": await builder ejecuta la consulta.
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        result().then(onFulfilled, onRejected),
    }
    return builder
  }

  const fake = { channel: vi.fn(channel), removeChannel, from }
  return {
    client: fake as unknown as TaskMasterClient,
    channels,
    removeChannel,
    /** Canales abiertos y todavía no cerrados con removeChannel. */
    openChannels: () => channels.filter((c) => !c.removed),
  }
}
