// Suscripción Realtime genérica (postgres_changes) para los repositorios Supabase.
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { TaskMasterClient } from '../../lib/supabaseClient'
import type { ChangeListener, StatusListener, SubscriptionStatus, Unsubscribe } from '../types'
import { assertUuid } from '../validation'

const STATUSES: readonly SubscriptionStatus[] = ['SUBSCRIBED', 'TIMED_OUT', 'CLOSED', 'CHANNEL_ERROR']

function toStatus(raw: string): SubscriptionStatus {
  return STATUSES.find((status) => status === raw) ?? 'CHANNEL_ERROR'
}

export type TableFilter = {
  readonly table: 'tasks' | 'comments' | 'project_members'
  readonly column: 'project_id' | 'task_id'
  readonly value: string
}

/**
 * Abre un canal propio para (tabla, filtro) y devuelve la función que lo cierra.
 *
 * - El nombre del canal lleva un sufijo aleatorio: en StrictMode React monta, desmonta y vuelve a
 *   montar; removeChannel es asíncrono y dos canales con el mismo topic chocarían.
 * - La limpieza llama a client.removeChannel(channel) (no solo unsubscribe), que además saca el
 *   canal de la lista del cliente y cierra el socket si ya no quedan canales.
 * - Los INSERT/UPDATE llegan filtrados por el servidor (`column=eq.value`) y por RLS. Los DELETE
 *   no se pueden filtrar ni pasan por RLS: llegan a todos los suscriptores de la tabla con solo la
 *   clave primaria. El núcleo los aplica como "quitar si está", que es inocuo si no está.
 */
export function subscribeToTable<T extends { [key: string]: unknown }>(
  client: TaskMasterClient,
  { table, column, value }: TableFilter,
  onChange: ChangeListener<T>,
  onStatus?: StatusListener,
): Unsubscribe {
  assertUuid(value, column)
  const channel = client
    .channel(`${table}:${column}:${value}:${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `${column}=eq.${value}` },
      (payload: RealtimePostgresChangesPayload<T>) => {
        switch (payload.eventType) {
          case 'INSERT':
          case 'UPDATE':
            onChange({ type: payload.eventType, row: payload.new })
            break
          case 'DELETE':
            onChange({ type: 'DELETE', old: payload.old })
            break
        }
      },
    )
    .subscribe((status, error) => {
      onStatus?.(toStatus(`${status}`), error)
    })

  return () => {
    void client.removeChannel(channel)
  }
}
