// Núcleo reutilizable: estado { data, loading, error } + canal Realtime + reconciliación +
// mutaciones optimistas con reversión. useTasks, useComments, useProjectMembers, useProjects y
// useProfiles lo componen; ninguno repite esta lógica.
//
// QUÉ GARANTIZA
//   - Aislamiento por scope (projectId, taskId…): el estado recuerda a qué scope pertenece y el
//     render nunca muestra filas de otro scope. Al cambiar de scope o desmontar se cierra el canal
//     (el repositorio llama a client.removeChannel), se aborta la carga en vuelo y scopeRef pasa a
//     null: ninguna respuesta tardía, de carga o de mutación, vuelve a tocar el estado.
//   - Sin huecos entre carga y canal: el canal se pide ANTES de la carga y los eventos que llegan
//     con la carga en vuelo se reaplican sobre la respuesta (upsert idempotente por clave). Pero
//     el canal solo escucha desde su SUBSCRIBED, que con Supabase suele llegar DESPUÉS de que la
//     consulta salió: un cambio en ese intervalo no está en la respuesta ni llega como evento.
//     Por eso CADA SUBSCRIBED (el primero y los de cada reconexión) lanza una carga nueva que
//     aborta la que estuviera en vuelo: la lista final siempre sale de una consulta hecha con el
//     canal ya escuchando.
//   - Recuperación como red de seguridad: también se recarga cuando la pestaña vuelve a estar
//     visible o el navegador vuelve a estar en línea.
//   - Mutaciones propias: se pintan al instante; si el servidor falla se restaura la fila previa
//     exacta (o se quita la nueva), el error queda en `mutationError` y la promesa se rechaza.
//   - Ecos: mientras una clave tiene una mutación propia en vuelo sus eventos se difieren; al
//     terminar se aplica el último con control de versión. El eco es igual a la respuesta y no
//     cambia nada (ni se anuncia); un cambio ajeno más nuevo gana.
//
// QUÉ NO GARANTIZA
//   - Orden total entre usuarios: si dos personas editan la misma tarea a la vez, gana la última
//     escritura que acepta la base (last-writer-wins por updated_at). No hay fusión de campos.
//   - Que lleguen todos los eventos: Realtime no reenvía lo que se perdió (medido en Supabase local
//     tras reiniciar la base: el primer INSERT no llegó). Por eso las recargas de arriba; mientras
//     tanto la lista puede estar desactualizada, nunca mezclada con otro scope.
//   - Los DELETE no traen más que la clave primaria y le llegan también a quien no es miembro
//     (medido): solo sirven para quitar una fila que ya está en la lista.
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

/**
 * Estado del canal, separado del error de carga:
 * 'off' = la fuente no tiene tiempo real · 'connecting' · 'live' · 'offline' (supabase-js reintenta).
 */
export type RealtimeStatus = 'off' | 'connecting' | 'live' | 'offline'

export type CollectionState<T> = {
  readonly data: readonly T[]
  readonly loading: boolean
  /** Error de la carga (consulta). Un problema del canal NO va aquí: va en `realtime`. */
  readonly error: Error | null
  /** Error de la última mutación que falló (el cambio optimista ya se revirtió). */
  readonly mutationError: Error | null
  readonly lastRemoteChange: RemoteChange<T> | null
  readonly realtime: RealtimeStatus
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

function emptyState<T>(scope: string | null, hasRealtime: boolean): InternalState<T> {
  return {
    scope,
    data: NO_ROWS,
    loading: scope !== null,
    error: null,
    mutationError: null,
    lastRemoteChange: null,
    realtime: scope !== null && hasRealtime ? 'connecting' : 'off',
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function useRealtimeCollection<T extends object>(
  options: UseRealtimeCollectionOptions<T>,
): UseRealtimeCollectionResult<T> {
  const { scopeId, source, keyOf, compare, versionOf } = options
  const hasRealtime = source.subscribe !== undefined

  const [state, setState] = useState<InternalState<T>>(() => emptyState(scopeId, hasRealtime))
  // Derivado en el render: al cambiar de scope no se ve ni un frame de datos del scope anterior.
  const view: InternalState<T> = state.scope === scopeId ? state : emptyState(scopeId, hasRealtime)

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

  /** Cambia el estado del scope `scope`; si el estado aún es de otro scope, parte de uno vacío. */
  const patchScope = useCallback(
    (scope: string, change: (base: InternalState<T>) => InternalState<T>) => {
      if (scopeRef.current !== scope) return
      setState((prev) => change(prev.scope === scope ? prev : emptyState<T>(scope, hasRealtime)))
    },
    [hasRealtime],
  )

  /** Aplica un evento remoto (si cambia algo, queda como último cambio remoto). */
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
        patchScope(scope, (base) => {
          let data = buffered.reduce<readonly T[]>(
            (acc, event) => applyChange(acc, event, keyOf, compare, versionOf).data,
            rows.toSorted(compare),
          )
          // Las claves con una mutación propia en vuelo conservan su versión local (optimista):
          // una recarga no debe borrar ni deshacer lo que el usuario acaba de hacer.
          for (const key of pendingKeys) {
            const mine = base.data.find((row) => keyOf(row) === key)
            data = removeRow(data, key, keyOf)
            if (mine !== undefined) data = upsertRow(data, mine, keyOf, compare)
          }
          return { ...base, data, loading: false, error: null }
        })
      } catch (error) {
        if (isStale()) return
        bufferRef.current = null
        patchScope(scope, (base) => ({ ...base, loading: false, error: toError(error) }))
      } finally {
        if (loadControllerRef.current === controller) loadControllerRef.current = null
      }
    },
    [source, keyOf, compare, versionOf, patchScope],
  )

  useEffect(() => {
    if (scopeId === null) return
    scopeRef.current = scopeId
    pendingRef.current = new Map()
    bufferRef.current = null
    let active = true
    let loadedOnce = false

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
      (status) => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          patchScope(scopeId, (base) => ({ ...base, realtime: 'live' }))
          // Siempre se recarga, aunque haya una carga en vuelo (v3 la dejaba seguir y fallaba): esa
          // carga pudo salir antes de que el canal escuchara, o antes de la caída, y no trae lo que
          // pasó entretanto. load() aborta la anterior; su respuesta tardía se descarta.
          void load(scopeId)
          return
        }
        // CHANNEL_ERROR, TIMED_OUT o CLOSED: los datos siguen siendo válidos; solo se marca el canal.
        patchScope(scopeId, (base) => ({ ...base, realtime: 'offline' }))
      },
    )

    void load(scopeId).then(() => {
      loadedOnce = true
    })

    // Red de seguridad para eventos perdidos: recargar al volver a la pestaña o a la red.
    const reloadIfVisible = () => {
      if (active && loadedOnce && document.visibilityState === 'visible') void load(scopeId)
    }
    document.addEventListener('visibilitychange', reloadIfVisible)
    window.addEventListener('online', reloadIfVisible)

    return () => {
      active = false
      scopeRef.current = null
      bufferRef.current = null
      loadControllerRef.current?.abort()
      document.removeEventListener('visibilitychange', reloadIfVisible)
      window.removeEventListener('online', reloadIfVisible)
      unsubscribe?.()
    }
  }, [scopeId, source, load, keyOfEvent, applyRemote, patchScope])

  const refetch = useCallback(async () => {
    const scope = scopeRef.current
    if (scope === null) return
    patchScope(scope, (base) => ({ ...base, loading: true, error: null }))
    await load(scope)
  }, [load, patchScope])

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
    const setData = (scope: string, change: (rows: readonly T[]) => readonly T[], mutationError?: Error | null) =>
      patchScope(scope, (base) => ({
        ...base,
        data: change(base.data),
        ...(mutationError === undefined ? {} : { mutationError }),
      }))

    return {
      async mutateUpsert(row, request) {
        const scope = requireScope()
        const key = keyOf(row)
        if (key === null) throw new Error('La fila no tiene clave')
        const entry = beginPending(key)
        let previous: T | undefined
        setData(
          scope,
          (rows) => {
            previous = rows.find((current) => keyOf(current) === key)
            return upsertRow(rows, row, keyOf, compare)
          },
          null,
        )
        try {
          const saved = await request()
          setData(scope, (rows) => upsertRow(rows, saved, keyOf, compare))
          return saved
        } catch (error) {
          setData(
            scope,
            (rows) =>
              previous === undefined ? removeRow(rows, key, keyOf) : upsertRow(rows, previous, keyOf, compare),
            toError(error),
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
        setData(
          scope,
          (rows) => {
            previous = rows.find((current) => keyOf(current) === key)
            return removeRow(rows, key, keyOf)
          },
          null,
        )
        try {
          await request()
        } catch (error) {
          setData(scope, (rows) => (previous === undefined ? rows : upsertRow(rows, previous, keyOf, compare)), toError(error))
          throw error
        } finally {
          endPending(scope, key, entry)
        }
      },

      upsertConfirmed(row) {
        const scope = scopeRef.current
        if (scope !== null) setData(scope, (rows) => upsertRow(rows, row, keyOf, compare))
      },

      clearMutationError() {
        setState((prev) => (prev.mutationError === null ? prev : { ...prev, mutationError: null }))
      },
    }
  }, [keyOf, compare, beginPending, endPending, patchScope])

  const { data, loading, error, mutationError, lastRemoteChange, realtime } = view
  return { data, loading, error, mutationError, lastRemoteChange, realtime, refetch, controls }
}
