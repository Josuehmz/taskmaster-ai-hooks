import { describe, expect, it, vi } from 'vitest'
import type { ChangeEvent } from '../types'
import { createFakeSupabase } from './fakeSupabase'
import { subscribeToTable } from './realtime'

const PROJECT = '10000000-0000-4000-8000-00000000000a'

describe('subscribeToTable (supabase-js con cliente falso)', () => {
  it('se suscribe a postgres_changes filtrado por project_id y cierra con removeChannel', () => {
    const { client, channels, removeChannel } = createFakeSupabase()
    const unsubscribe = subscribeToTable(client, { table: 'tasks', column: 'project_id', value: PROJECT }, () => {})
    expect(channels).toHaveLength(1)
    const binding = channels[0]?.bindings[0]
    expect(binding?.type).toBe('postgres_changes')
    expect(binding?.filter).toEqual({ event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${PROJECT}` })
    unsubscribe()
    expect(removeChannel).toHaveBeenCalledTimes(1)
    expect(removeChannel).toHaveBeenCalledWith(channels[0])
  })

  it('normaliza INSERT, UPDATE y DELETE (el DELETE solo con la clave)', () => {
    const { client, channels } = createFakeSupabase()
    const events: ChangeEvent<{ id: string }>[] = []
    subscribeToTable<{ id: string }>(client, { table: 'tasks', column: 'project_id', value: PROJECT }, (e) => events.push(e))
    const callback = channels[0]?.bindings[0]?.callback
    callback?.({ eventType: 'INSERT', new: { id: '1' }, old: {} })
    callback?.({ eventType: 'UPDATE', new: { id: '1' }, old: {} })
    callback?.({ eventType: 'DELETE', new: {}, old: { id: '1' } })
    expect(events).toEqual([
      { type: 'INSERT', row: { id: '1' } },
      { type: 'UPDATE', row: { id: '1' } },
      { type: 'DELETE', old: { id: '1' } },
    ])
  })

  it('rechaza un valor de filtro que no es UUID (no se puede inyectar otro filtro)', () => {
    const { client, channels } = createFakeSupabase()
    const listener = vi.fn()
    expect(() =>
      subscribeToTable(client, { table: 'tasks', column: 'project_id', value: `${PROJECT},title=like.%` }, listener),
    ).toThrow('UUID')
    expect(channels).toHaveLength(0)
  })
})
