// Reconciliación pura de colecciones: sin React, para probarla con Vitest sin montar nada.
import type { ChangeEvent } from '../services/types'

/** Clave estable de una fila. Recibe también filas parciales (los DELETE solo traen la PK). */
export type KeyOf<T> = (row: T | Partial<T>) => string | null

export type Compare<T> = (a: T, b: T) => number

/**
 * Versión de una fila para descartar eventos viejos (p. ej. Date.parse(updated_at)).
 * Opcional: si una entidad no la define, gana siempre el último evento recibido.
 */
export type VersionOf<T> = (row: T) => number

/** Igualdad superficial por columnas. El payload de Realtime trae las mismas columnas que la
 *  respuesta HTTP pero en otro orden, así que no sirve comparar con JSON.stringify. */
export function sameRow<T extends object>(a: T, b: T): boolean {
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  return keysA.every((key) => Object.is(Reflect.get(a, key), Reflect.get(b, key)))
}

/**
 * Inserta o reemplaza por clave y reordena. Idempotente: aplicar dos veces = aplicar una.
 * Si la fila ya está igual, devuelve EL MISMO arreglo: así el eco de una mutación propia no
 * provoca un render ni se anuncia como cambio remoto.
 */
export function upsertRow<T extends object>(
  rows: readonly T[],
  row: T,
  keyOf: KeyOf<T>,
  compare: Compare<T>,
): readonly T[] {
  const key = keyOf(row)
  if (key === null) return rows
  const index = rows.findIndex((current) => keyOf(current) === key)
  if (index !== -1) {
    const current = rows[index]
    if (current !== undefined && sameRow(current, row)) return rows
  }
  const next = index === -1 ? [...rows, row] : rows.with(index, row)
  return next.toSorted(compare)
}

/** Quita por clave. Si no estaba, devuelve el mismo arreglo (React no re-renderiza). */
export function removeRow<T>(rows: readonly T[], key: string, keyOf: KeyOf<T>): readonly T[] {
  const next = rows.filter((row) => keyOf(row) !== key)
  return next.length === rows.length ? rows : next
}

export type ApplyResult<T> = {
  readonly data: readonly T[]
  /** Fila afectada (la nueva en INSERT/UPDATE, la que se quitó en DELETE); null si no cambió nada. */
  readonly row: T | null
}

/**
 * Aplica un evento Realtime a la colección.
 *
 * - INSERT/UPDATE: upsert por clave. El eco de una mutación propia trae la misma clave (el id lo
 *   genera el hook) y los mismos valores que la respuesta HTTP: no duplica ni re-renderiza.
 * - Con `versionOf`, un evento más viejo que la fila actual se descarta (llegó tarde).
 * - DELETE: se quita por clave. Los DELETE no se filtran por scope en el servidor y llegan con
 *   solo la PK (medido en Supabase local), así que quitar una clave ajena es un no-op.
 */
export function applyChange<T extends object>(
  rows: readonly T[],
  event: ChangeEvent<T>,
  keyOf: KeyOf<T>,
  compare: Compare<T>,
  versionOf?: VersionOf<T>,
): ApplyResult<T> {
  if (event.type === 'DELETE') {
    const key = keyOf(event.old)
    if (key === null) return { data: rows, row: null }
    const removed = rows.find((row) => keyOf(row) === key) ?? null
    return removed === null ? { data: rows, row: null } : { data: removeRow(rows, key, keyOf), row: removed }
  }
  const key = keyOf(event.row)
  if (key === null) return { data: rows, row: null }
  if (versionOf !== undefined) {
    const current = rows.find((row) => keyOf(row) === key)
    if (current !== undefined && versionOf(event.row) < versionOf(current)) {
      return { data: rows, row: null }
    }
  }
  const data = upsertRow(rows, event.row, keyOf, compare)
  return { data, row: data === rows ? null : event.row }
}
