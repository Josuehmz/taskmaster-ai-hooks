// Validaciones y listas blancas compartidas por los repositorios real y demo.
import type {
  AddMemberInput,
  CreateCommentInput,
  CreateProjectInput,
  CreateTaskInput,
  UpdateTaskInput,
} from '../types'
import { RepositoryError } from './errors'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Los ids se interpolan en filtros de Realtime (`project_id=eq.<id>`): se validan antes. */
export function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new RepositoryError('validation', `${label} no es un UUID válido`)
  }
}

// Columnas que el cliente PUEDE escribir. Coinciden con los grants por columna de la migración.
// Un objeto con `id` o `created_by` de más pasa el chequeo de tipos de TypeScript si viene en
// una variable; por eso el servicio copia solo estas claves al payload.
export const TASK_INSERT_COLUMNS = [
  'id',
  'project_id',
  'title',
  'description',
  'status',
  'assignee_id',
] as const satisfies readonly (keyof CreateTaskInput)[]

export const TASK_UPDATE_COLUMNS = [
  'title',
  'description',
  'status',
  'assignee_id',
] as const satisfies readonly (keyof UpdateTaskInput)[]

export const COMMENT_INSERT_COLUMNS = [
  'id',
  'task_id',
  'body',
] as const satisfies readonly (keyof CreateCommentInput)[]

export const PROJECT_INSERT_COLUMNS = [
  'name',
  'description',
] as const satisfies readonly (keyof CreateProjectInput)[]

export const MEMBER_INSERT_COLUMNS = [
  'project_id',
  'user_id',
  'role',
] as const satisfies readonly (keyof AddMemberInput)[]

/** Copia solo las claves permitidas y definidas (undefined = "no tocar"). */
export function pickDefined<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {}
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined) out[key] = value
  }
  return out
}
