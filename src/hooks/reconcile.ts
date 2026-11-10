// Reconciliación pura de colecciones: sin React, para probarla con Vitest sin montar nada.
import type { ChangeEvent } from '../services/types'

/** Clave estable de una fila. Recibe también filas parciales (los DELETE solo traen la PK). */
export type KeyOf<T> = (row: T | Partial<T>) => string | null

export type Compare<T> = (a: T, b: T) => number

/** Inserta o reemplaza por clave y reordena. Idempotente: aplicar dos veces = aplicar una. */
export function upsertRow<T>(
  rows: readonly T[],
  row: T,
  keyOf: KeyOf<T>,
  compare: Compare<T>,
): readonly T[] {
  const key = keyOf(row)
  if (key === null) return rows
  const index = rows.findIndex((current) => keyOf(current) === key)
  const next = index === -1 ? [...rows, row] : rows.with(index, row)
  return next.toSorted(compare)
}

/** Quita por clave. Si no estaba, devuelve el mismo arreglo (React no re-renderiza). */
export function removeRow<T>(rows: readonly T[], key: string, keyOf: KeyOf<T>): readonly T[] {
  const next = rows.filter((row) => keyOf(row) !== key)
  return next.length === rows.length ? rows : next
}

/**
 * Aplica un evento Realtime a la colección.
 *
 * - INSERT/UPDATE: upsert por clave. Así el eco de un INSERT propio no duplica: cuando llega la
 *   respuesta del servidor y cuando llega el eco, ambos traen la misma clave real.
 * - Si la clave tiene una mutación propia en vuelo (`isPending`), se ignora el evento: la
 *   respuesta de esa mutación trae la versión final y un eco viejo no debe "pisar" el estado
 *   optimista con un valor intermedio.
 * - DELETE: se quita por clave aunque haya mutación en vuelo (otro usuario borró la fila).
 *   Como los DELETE no se filtran por scope en el servidor, quitar una clave ajena es un no-op.
 */
export function applyChange<T>(
  rows: readonly T[],
  event: ChangeEvent<T>,
  keyOf: KeyOf<T>,
  compare: Compare<T>,
  isPending: (key: string) => boolean,
): readonly T[] {
  if (event.type === 'DELETE') {
    const key = keyOf(event.old)
    return key === null ? rows : removeRow(rows, key, keyOf)
  }
  const key = keyOf(event.row)
  if (key !== null && isPending(key)) return rows
  return upsertRow(rows, event.row, keyOf, compare)
}
