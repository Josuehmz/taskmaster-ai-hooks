// Núcleo reutilizable: estado { data, loading, error } + suscripción Realtime + reconciliación.
//
// useTasks, useComments, useProjectMembers y useProjects lo componen; ninguno repite la lógica
// de carga, suscripción, limpieza ni descarte de respuestas tardías.
//
// Ciclo de vida por scope (projectId, taskId...):
//   1. Al cambiar el scope: se marca el scope actual en scopeRef, se vacía el estado y se limpian
//      las mutaciones pendientes del scope anterior.
//   2. Se abre la suscripción ANTES de la carga inicial, y mientras la carga está en vuelo los
//      eventos se guardan en un búfer; al llegar la lista se reaplican encima (upsert idempotente).
//      Así no se pierde un cambio ocurrido entre la consulta y la llegada de su respuesta.
//   3. Cada SUBSCRIBED posterior (reconexión, o canal que se unió después de que la carga
//      terminó) dispara un refetch: durante la desconexión se pudieron perder eventos.
//   4. Limpieza (cambio de scope o desmontaje): `active = false` descarta eventos tardíos, se aborta
//      la carga en vuelo (AbortController) y se cierra el canal (el repositorio llama a
//      client.removeChannel). Una respuesta que llega igual se descarta porque su scope ya no
//      coincide con scopeRef.current o porque su señal está abortada.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ScopedCollectionSource } from '../services/types'
import { applyChange, removeRow, upsertRow, type Compare, type KeyOf } from './reconcile'

export type { Compare, KeyOf } from './reconcile'

export type CollectionState<T> = {
  readonly data: readonly T[]
  readonly loading: boolean
  readonly error: Error | null
}

export type UseRealtimeCollectionOptions<T> = {
  /** null = no hay nada que cargar (p. ej. ningún proyecto seleccionado). */
  readonly scopeId: string | null
  /** Debe ser estable entre renders (viene del contexto de repositorios). */
  readonly source: ScopedCollectionSource<T>
  /** Debe ser estable: definir a nivel de módulo, no en línea. */
  readonly keyOf: KeyOf<T>
  /** Debe ser estable: definir a nivel de módulo, no en línea. */
  readonly compare: Compare<T>
}

/** Operaciones locales que usan los hooks de entidad para mutar con o sin optimismo. */
export type CollectionControls<T> = {
  /** Inserta o reemplaza una fila por clave (respuesta del servidor o valor optimista). */
  upsertLocal: (row: T) => void
  /** Quita una fila por clave (borrado optimista o fila temporal). */
  removeLocal: (key: string) => void
  /**
   * Cambia una fila temporal (clave `temp:<uuid>`) por la fila real del servidor en un solo
   * setState: la vista nunca muestra las dos a la vez por culpa de este paso.
   */
  replaceLocal: (oldKey: string, row: T) => void
  /**
   * Marca la clave como "mutación propia en vuelo": mientras esté marcada se ignoran los
   * INSERT/UPDATE Realtime de esa clave (evita que el eco pise el estado optimista).
   * Devuelve la función que la desmarca; llamarla más de una vez no hace nada.
   */
  beginMutation: (key: string) => () => void
  /** true si `scopeId` sigue siendo el scope montado (descartar respuestas de mutaciones tardías). */
  isCurrentScope: (scopeId: string | null) => boolean
  /** Lectura síncrona del estado más reciente (para guardar el valor previo antes de revertir). */
  getSnapshot: () => readonly T[]
}

export type UseRealtimeCollectionResult<T> = CollectionState<T> & {
  readonly refetch: () => Promise<void>
  readonly controls: CollectionControls<T>
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function useRealtimeCollection<T>(
  options: UseRealtimeCollectionOptions<T>,
): UseRealtimeCollectionResult<T> {
  const { scopeId, source, keyOf, compare } = options

  const [state, setState] = useState<CollectionState<T>>(() => ({
    data: [],
    loading: scopeId !== null,
    error: null,
  }))

  const scopeRef = useRef<string | null>(scopeId)
  const dataRef = useRef<readonly T[]>(state.data)
  const pendingRef = useRef(new Map<string, number>())
  /** null = no hay carga en vuelo; arreglo = eventos recibidos durante la carga. */
  const bufferRef = useRef<ChangeEvent<T>[] | null>(null)
  const loadControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    dataRef.current = state.data
  }, [state.data])

  const isPending = useCallback((key: string) => pendingRef.current.has(key), [])

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
        const data = buffered.reduce<readonly T[]>(
          (acc, event) => applyChange(acc, event, keyOf, compare, isPending),
          rows.toSorted(compare),
        )
        // SIGUIENTE PASO: fusionar aquí las filas optimistas aún pendientes (claves temporales y
        // claves en pendingRef) para que un refetch no las borre de la vista.
        setState({ data, loading: false, error: null })
      } catch (error) {
        if (isStale()) return
        const buffered = bufferRef.current ?? []
        bufferRef.current = null
        setState((prev) => ({
          data: buffered.reduce<readonly T[]>(
            (acc, event) => applyChange(acc, event, keyOf, compare, isPending),
            prev.data,
          ),
          loading: false,
          error: toError(error),
        }))
      } finally {
        if (loadControllerRef.current === controller) loadControllerRef.current = null
      }
    },
    [source, keyOf, compare, isPending],
  )

  useEffect(() => {
    scopeRef.current = scopeId
    pendingRef.current.clear()
    bufferRef.current = null

    if (scopeId === null) {
      setState({ data: [], loading: false, error: null })
      return
    }

    setState({ data: [], loading: true, error: null })
    let active = true

    const unsubscribe = source.subscribe?.(
      scopeId,
      (event) => {
        if (!active) return
        const buffer = bufferRef.current
        if (buffer !== null) {
          buffer.push(event)
          return
        }
        setState((prev) => ({
          ...prev,
          data: applyChange(prev.data, event, keyOf, compare, isPending),
        }))
      },
      (status, error) => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          // Si la carga sigue en vuelo, el búfer cubre el hueco; si ya terminó, se recarga.
          if (bufferRef.current === null) void load(scopeId)
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setState((prev) => ({
            ...prev,
            error: error ?? new Error(`Tiempo real no disponible (${status})`),
          }))
        }
      },
    )

    void load(scopeId)

    return () => {
      active = false
      loadControllerRef.current?.abort()
      unsubscribe?.()
    }
  }, [scopeId, source, keyOf, compare, isPending, load])

  const refetch = useCallback(async () => {
    const scope = scopeRef.current
    if (scope !== null) await load(scope)
  }, [load])

  const controls = useMemo<CollectionControls<T>>(
    () => ({
      upsertLocal: (row) => {
        setState((prev) => ({ ...prev, data: upsertRow(prev.data, row, keyOf, compare) }))
      },
      removeLocal: (key) => {
        setState((prev) => ({ ...prev, data: removeRow(prev.data, key, keyOf) }))
      },
      replaceLocal: (oldKey, row) => {
        setState((prev) => ({
          ...prev,
          data: upsertRow(removeRow(prev.data, oldKey, keyOf), row, keyOf, compare),
        }))
      },
      beginMutation: (key) => {
        const pending = pendingRef.current
        pending.set(key, (pending.get(key) ?? 0) + 1)
        let ended = false
        return () => {
          if (ended) return
          ended = true
          const remaining = (pending.get(key) ?? 1) - 1
          if (remaining <= 0) pending.delete(key)
          else pending.set(key, remaining)
        }
      },
      isCurrentScope: (scope) => scopeRef.current === scope,
      getSnapshot: () => dataRef.current,
    }),
    [keyOf, compare],
  )

  return { ...state, refetch, controls }
}
