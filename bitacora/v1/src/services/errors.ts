// Error único de la capa de servicios: los hooks y la UI no ven PostgrestError ni códigos SQL.

export type RepositoryErrorCode =
  | 'aborted'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'unknown'

export class RepositoryError extends Error {
  override name = 'RepositoryError'
  readonly code: RepositoryErrorCode

  constructor(code: RepositoryErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.code = code
  }
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(key in value)) return undefined
  const field: unknown = Reflect.get(value, key)
  return typeof field === 'string' ? field : undefined
}

// Códigos de PostgreSQL / PostgREST que interesan a la UI.
const FORBIDDEN_CODES = new Set(['42501'])
const NOT_FOUND_CODES = new Set(['PGRST116'])
const VALIDATION_CODES = new Set(['23502', '23503', '23505', '23514', '22P02', '22001'])

/** Convierte cualquier error (PostgrestError, DOMException, Error) en RepositoryError. */
export function toRepositoryError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new RepositoryError('aborted', 'Solicitud cancelada', { cause: error })
  }
  const code = readString(error, 'code')
  const message = readString(error, 'message') ?? 'Error desconocido en el servicio de datos'
  if (code !== undefined && FORBIDDEN_CODES.has(code)) {
    return new RepositoryError('forbidden', 'No tienes permiso para esta operación', { cause: error })
  }
  if (code !== undefined && NOT_FOUND_CODES.has(code)) {
    return new RepositoryError('not_found', 'El registro no existe o no es visible', { cause: error })
  }
  if (code !== undefined && VALIDATION_CODES.has(code)) {
    return new RepositoryError('validation', message, { cause: error })
  }
  return new RepositoryError('unknown', message, { cause: error })
}
