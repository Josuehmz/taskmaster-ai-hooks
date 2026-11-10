// Núcleo reutilizable: estado { data, loading, error } + suscripción Realtime + reconciliación +
// mutaciones optimistas con reversión.
//
// useTasks, useComments, useProjectMembers, useProjects y useProfiles lo componen; ninguno repite
// la lógica de carga, suscripción, limpieza, optimismo ni descarte de respuestas tardías.
//
// Ciclo de vida por scope (projectId, taskId...):
//   1. El estado guarda a qué scope pertenece. Si el scope pedido no coincide, el render muestra
//      un estado vacío "cargando" calculado en el render (no hay setState síncrono en el efecto).
//   2. Se abre la suscripción ANTES de la carga inicial; los eventos que llegan con la carga en
//      vuelo se guardan en un búfer y se reaplican sobre la respuesta (upsert idempotente).
//   3. Cada SUBSCRIBED posterior a la carga (reconexión) dispara un refetch: durante la
//      desconexión se pudieron perder eventos.
//   4. Limpieza (cambio de scope o desmontaje): `active = false` descarta eventos tardíos,
//      scopeRef pasa a null (ninguna mutación tardía vuelve a tocar el estado), se aborta la
//      carga en vuelo y se cierra el canal (el repositorio llama a client.removeChannel).
//
// Mutaciones (mutateUpsert / mutateRemove):
//   - Pintan el cambio al instante y guardan la fila previa DENTRO del mismo updater.
//   - Mientras la clave tiene una mutación propia en vuelo, los eventos Realtime de esa clave se
//     difieren (no se aplican): el eco no pisa el valor optimista. Al terminar se aplica el último
//     evento diferido con control de versión: si era el eco, no cambia nada; si era un cambio de
//     otro usuario más nuevo, gana.
//   - Si el servidor falla: se restaura la fila previa exacta (o se quita la fila nueva), se
//     guarda el error en `mutationError` y la promesa se rechaza.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ScopedCollectionSource } from '../services/types'
import {
  applyChange,
  removeRow,
  upsertRow,
  type Compare,
  type KeyOf,
  type VersionOf,
} from './reconcile'

export type { Compare, KeyOf, VersionOf } from './reconcile'

/** Último cambio que llegó por tiempo real y modificó la lista (para avisar en la UI). */
export type RemoteChange<T> = {
  readonly type: 'INSERT' | 'UPDATE' | 'DELETE'
  readonly row: T
  readonly at: number
}

export type CollectionState<T> = {
  readonly data: readonly T[]
  readonly loading: boolean
  /** Error de carga o del canal de tiempo real. */
  readonly error: Error | null
  /** Error de la última mutación que falló (el cambio optimista ya se revirtió). */
  readonly mutationError: Error | null
  readonly lastRemoteChange: RemoteChange<T> | null
}

type InternalState<T> = CollectionState<T> & { readonly scope: string | null }

export type UseRealtimeCollectionOptions<T> = {
  /** null = no hay nada que cargar (p. ej. ningún proyecto seleccionado). */
  readonly scopeId: string | null
  /** Debe ser estable entre renders (viene del contexto de repositorios). */
  readonly source: ScopedCollectionSource<T>
  /** Debe ser estable: definir a nivel de módulo, no en línea. */
  readonly keyOf: KeyOf<T>
  /** Debe ser estable: definir a nivel de módulo, no en línea. */
  readonly compare: Compare<T>
  /** Opcional y estable: descarta eventos más viejos que la fila actual. */
  readonly versionOf?: VersionOf<T>
}

export type CollectionControls<T> = {
  /** Upsert optimista de `row`; `request` confirma con el servidor (su fila reemplaza a la optimista). */
  mutateUpsert: (row: T, request: () => Promise<T>) => Promise<T>
  /** Borrado optimista por clave; si `request` falla, la fila vuelve a su lugar. */
  mutateRemove: (key: string, request: () => Promise<void>) => Promise<void>
  /** Inserción sin optimismo (cuando no vale la pena pintar algo que se puede revertir). */
  upsertConfirmed: (row: T) => void
  clearMutationError: () => void
}

export type UseRealtimeCollectionResult<T> = CollectionState<T> & {
  readonly refetch: () => Promise<void>
  readonly controls: CollectionControls<T>
}

type PendingEntry<T> = { count: number; deferred: ChangeEvent<T> | null }

const NO_ROWS: readonly never[] = []

function emptyState<T>(scope: string | null): InternalState<T> {
  return {
    scope,
    data: NO_ROWS,
    loading: scope !== null,
    error: null,
    mutationError: null,
    lastRemoteChange: null,
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function useRealtimeCollection<T extends object>(
  options: UseRealtimeCollectionOptions<T>,
): UseRealtimeCollectionResult<T> {
  const { scopeId, source, keyOf, compare, versionOf } = options

  const [state, setState] = useState<InternalState<T>>(() => emptyState(scopeId))
  // Derivado en el render: al cambiar de scope no se ve ni un frame de datos del scope anterior.
  const view: InternalState<T> = state.scope === scopeId ? state : emptyState(scopeId)

  /** Scope montado. null tras la limpieza: las respuestas tardías ya no tocan el estado. */
  const scopeRef = useRef<string | null>(null)
  const pendingRef = useRef(new Map<string, PendingEntry<T>>())
  /** null = no hay carga en vuelo; arreglo = eventos recibidos durante la carga. */
  const bufferRef = useRef<ChangeEvent<T>[] | null>(null)
  const loadControllerRef = useRef<AbortController | null>(null)

  const keyOfEvent = useCallback(
    (event: ChangeEvent<T>) => (event.type === 'DELETE' ? keyOf(event.old) : keyOf(event.row)),
    [keyOf],
  )

  /** Aplica un evento remoto sobre el estado del scope `scope` (si sigue siendo el montado). */
  const applyRemote = useCallback(
    (scope: string, event: ChangeEvent<T>) => {
      setState((prev) => {
        if (prev.scope !== scope) return prev
        const { data, row } = applyChange(prev.data, event, keyOf, compare, versionOf)
        if (row === null) return prev
        return { ...prev, data, lastRemoteChange: { type: event.type, row, at: Date.now() } }
      })
    },
    [keyOf, compare, versionOf],
  )

  /** Cambia los datos del scope `scope`; si el estado aún es de otro scope, parte de uno vacío. */
  const updateScope = useCallback(
    (scope: string, change: (rows: readonly T[]) => readonly T[], patch?: Partial<CollectionState<T>>) => {
      if (scopeRef.current !== scope) return
      setState((prev) => {
        const base = prev.scope === scope ? prev : emptyState<T>(scope)
        return { ...base, ...patch, data: change(base.data) }
      })
    },
    [],
  )

  const load = useCallback(
    async (scope: string): Promise<void> => {
      loadControllerRef.current?.abort()
      const controller = new AbortController()
      loadControllerRef.current = controller
      bufferRef.current = []
      const isStale = () => controller.signal.aborted || scopeRef.current !== scope

      try {
        const rows = await source.list(scope, controller.signal)
        if (isStale()) return
        const buffered = bufferRef.current ?? []
        bufferRef.current = null
        const pendingKeys = [...pendingRef.current.keys()]
        setState((prev) => {
          let data = buffered.reduce<readonly T[]>(
            (acc, event) => applyChange(acc, event, keyOf, compare, versionOf).data,
            rows.toSorted(compare),
          )
          // Las claves con una mutación propia en vuelo conservan su versión local (optimista):
          // un refetch no debe borrar ni deshacer lo que el usuario acaba de hacer.
          const local = prev.scope === scope ? prev.data : NO_ROWS
          for (const key of pendingKeys) {
            const mine = local.find((row) => keyOf(row) === key)
            data = removeRow(data, key, keyOf)
            if (mine !== undefined) data = upsertRow(data, mine, keyOf, compare)
          }
          const base = prev.scope === scope ? prev : emptyState<T>(scope)
          return { ...base, data, loading: false, error: null }
        })
      } catch (error) {
        if (isStale()) return
        bufferRef.current = null
        setState((prev) => {
          const base = prev.scope === scope ? prev : emptyState<T>(scope)
          return { ...base, loading: false, error: toError(error) }
        })
      } finally {
        if (loadControllerRef.current === controller) loadControllerRef.current = null
      }
    },
    [source, keyOf, compare, versionOf],
  )

  useEffect(() => {
    if (scopeId === null) return
    scopeRef.current = scopeId
    pendingRef.current = new Map()
    bufferRef.current = null
    let active = true

    const unsubscribe = source.subscribe?.(
      scopeId,
      (event) => {
        if (!active) return
        const key = keyOfEvent(event)
        const pending = key === null ? undefined : pendingRef.current.get(key)
        if (pending !== undefined) {
          pending.deferred = event // se aplica cuando termine la mutación propia
          return
        }
        const buffer = bufferRef.current
        if (buffer !== null) {
          buffer.push(event)
          return
        }
        applyRemote(scopeId, event)
      },
      (status, error) => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          // Si la carga sigue en vuelo, el búfer cubre el hueco; si ya terminó, se recarga.
          if (bufferRef.current === null) void load(scopeId)
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setState((prev) =>
            prev.scope === scopeId
              ? { ...prev, error: error ?? new Error(`Tiempo real no disponible (${status})`) }
              : prev,
          )
        }
      },
    )

    void load(scopeId)

    return () => {
      active = false
      scopeRef.current = null
      bufferRef.current = null
      loadControllerRef.current?.abort()
      unsubscribe?.()
    }
  }, [scopeId, source, load, keyOfEvent, applyRemote])

  const refetch = useCallback(async () => {
    const scope = scopeRef.current
    if (scope === null) return
    setState((prev) => (prev.scope === scope ? { ...prev, loading: true, error: null } : prev))
    await load(scope)
  }, [load])

  const beginPending = useCallback((key: string) => {
    const pending = pendingRef.current
    const entry = pending.get(key) ?? { count: 0, deferred: null }
    entry.count += 1
    pending.set(key, entry)
    return entry
  }, [])

  const endPending = useCallback(
    (scope: string, key: string, entry: PendingEntry<T>) => {
      entry.count -= 1
      if (entry.count > 0) return
      if (pendingRef.current.get(key) === entry) pendingRef.current.delete(key)
      const deferred = entry.deferred
      if (deferred !== null && scopeRef.current === scope) applyRemote(scope, deferred)
    },
    [applyRemote],
  )

  const controls = useMemo<CollectionControls<T>>(() => {
    const requireScope = (): string => {
      const scope = scopeRef.current
      if (scope === null) throw new Error('No hay nada seleccionado')
      return scope
    }

    return {
      async mutateUpsert(row, request) {
        const scope = requireScope()
        const key = keyOf(row)
        if (key === null) throw new Error('La fila no tiene clave')
        const entry = beginPending(key)
        let previous: T | undefined
        updateScope(
          scope,
          (rows) => {
            previous = rows.find((current) => keyOf(current) === key)
            return upsertRow(rows, row, keyOf, compare)
          },
          { mutationError: null },
        )
        try {
          const saved = await request()
          updateScope(scope, (rows) => upsertRow(rows, saved, keyOf, compare))
          return saved
        } catch (error) {
          updateScope(
            scope,
            (rows) =>
              previous === undefined ? removeRow(rows, key, keyOf) : upsertRow(rows, previous, keyOf, compare),
            { mutationError: toError(error) },
          )
          throw error
        } finally {
          endPending(scope, key, entry)
        }
      },

      async mutateRemove(key, request) {
        const scope = requireScope()
        const entry = beginPending(key)
        let previous: T | undefined
        updateScope(
          scope,
          (rows) => {
            previous = rows.find((current) => keyOf(current) === key)
            return removeRow(rows, key, keyOf)
          },
          { mutationError: null },
        )
        try {
          await request()
        } catch (error) {
          updateScope(
            scope,
            (rows) => (previous === undefined ? rows : upsertRow(rows, previous, keyOf, compare)),
            { mutationError: toError(error) },
          )
          throw error
        } finally {
          endPending(scope, key, entry)
        }
      },

      upsertConfirmed(row) {
        const scope = scopeRef.current
        if (scope !== null) updateScope(scope, (rows) => upsertRow(rows, row, keyOf, compare))
      },

      clearMutationError() {
        setState((prev) => (prev.mutationError === null ? prev : { ...prev, mutationError: null }))
      },
    }
  }, [keyOf, compare, beginPending, endPending, updateScope])

  const { data, loading, error, mutationError, lastRemoteChange } = view
  return { data, loading, error, mutationError, lastRemoteChange, refetch, controls }
}
