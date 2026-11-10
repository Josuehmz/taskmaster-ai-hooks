// Utilidades comunes de los repositorios Supabase.
import { RepositoryError } from '../errors'

/**
 * El cliente se crea sin el tipo Database generado (no se agregan dependencias ni pasos de
 * generación en este paso), así que las filas llegan sin tipar. Este es el ÚNICO punto donde se
 * afirma su forma; el siguiente paso puede cambiarlo por `supabase gen types`.
 */
export function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

export function asRow<T>(data: unknown, entity: string): T {
  if (typeof data !== 'object' || data === null) {
    throw new RepositoryError('unknown', `La base no devolvió ${entity}`)
  }
  return data as T
}

/**
 * Un DELETE bloqueado por RLS no da error: borra 0 filas. Por eso los repositorios piden
 * `.select('<pk>')` y comprueban que volvió al menos una fila.
 */
export function ensureDeleted(data: unknown, entity: string): void {
  if (!Array.isArray(data) || data.length === 0) {
    throw new RepositoryError('not_found', `${entity} no existe o no tienes permiso para borrarlo`)
  }
}
