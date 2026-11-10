// Tabla en memoria con eventos de cambio, para el modo demo.
// Imita lo que hace Supabase Realtime para que los hooks se prueben igual en ambos modos:
// - los eventos llegan de forma asíncrona (microtarea), también el "eco" de mutaciones propias;
// - INSERT/UPDATE se entregan solo a los suscriptores del scope;
// - DELETE se entrega a TODOS los suscriptores y solo con la clave primaria (como con RLS).
import type { ChangeEvent, ChangeListener, StatusListener, Unsubscribe } from '../types'

type Subscriber<T> = { readonly scopeId: string; readonly onChange: ChangeListener<T> }

export type DemoTable<T> = {
  list(predicate: (row: T) => boolean): T[]
  get(key: string): T | undefined
  insert(row: T): T
  replace(row: T): T
  remove(key: string): T | undefined
  subscribe(scopeId: string, onChange: ChangeListener<T>, onStatus?: StatusListener): Unsubscribe
}

export type DemoTableOptions<T> = {
  readonly keyOf: (row: T) => string
  readonly scopeOf: (row: T) => string
  readonly primaryKeyOf: (row: T) => Partial<T>
  readonly seed: readonly T[]
}

export function createDemoTable<T>(options: DemoTableOptions<T>): DemoTable<T> {
  const { keyOf, scopeOf, primaryKeyOf } = options
  const rows = new Map<string, T>(options.seed.map((row) => [keyOf(row), row]))
  const subscribers = new Set<Subscriber<T>>()

  function emit(event: ChangeEvent<T>, scopeId: string | null): void {
    for (const subscriber of subscribers) {
      if (scopeId !== null && subscriber.scopeId !== scopeId) continue
      queueMicrotask(() => {
        // Si se desuscribió antes de la microtarea, no se entrega (igual que removeChannel).
        if (subscribers.has(subscriber)) subscriber.onChange(event)
      })
    }
  }

  return {
    list(predicate) {
      return [...rows.values()].filter(predicate)
    },
    get(key) {
      return rows.get(key)
    },
    insert(row) {
      rows.set(keyOf(row), row)
      emit({ type: 'INSERT', row }, scopeOf(row))
      return row
    },
    replace(row) {
      rows.set(keyOf(row), row)
      emit({ type: 'UPDATE', row }, scopeOf(row))
      return row
    },
    remove(key) {
      const row = rows.get(key)
      if (row === undefined) return undefined
      rows.delete(key)
      emit({ type: 'DELETE', old: primaryKeyOf(row) }, null)
      return row
    },
    subscribe(scopeId, onChange, onStatus) {
      const subscriber: Subscriber<T> = { scopeId, onChange }
      subscribers.add(subscriber)
      queueMicrotask(() => {
        if (subscribers.has(subscriber)) onStatus?.('SUBSCRIBED')
      })
      return () => {
        subscribers.delete(subscriber)
      }
    },
  }
}

/** Latencia simulada que respeta AbortSignal (para probar respuestas tardías). */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Solicitud cancelada', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Solicitud cancelada', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
