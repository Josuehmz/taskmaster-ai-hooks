// Entidad Task: una tarea dentro de un proyecto.
// Los nombres de propiedad son snake_case a propósito: coinciden 1:1 con las columnas de
// public.tasks y con el payload de Realtime, así no hay capa de mapeo que mantener.

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.some((status) => status === value)
}

// Se usa `type` y no `interface`: un alias de objeto es asignable a `{ [key: string]: unknown }`
// (lo exige el genérico de los eventos Realtime de supabase-js); una interfaz no lo es.
export type Task = {
  readonly id: string
  readonly project_id: string
  readonly title: string
  readonly description: string | null
  readonly status: TaskStatus
  readonly assignee_id: string | null
  /** Lo pone la base con auth.uid(). Queda en null si se borra la cuenta del creador. */
  readonly created_by: string | null
  readonly created_at: string
  readonly updated_at: string
}

/**
 * Entrada para crear una tarea. No incluye id, created_by, created_at ni updated_at:
 * los fija la base (defaults, trigger y política RLS). El servicio, además, copia solo
 * estas claves al payload, porque TypeScript no rechaza propiedades extra de una variable.
 */
export type CreateTaskInput = {
  project_id: string
  title: string
  description?: string | null
  status?: TaskStatus
  assignee_id?: string | null
}

/** Lo que el hook pide al crear: el project_id lo pone el hook a partir de su argumento. */
export type NewTaskFields = Omit<CreateTaskInput, 'project_id'>

/**
 * Cambios permitidos sobre una tarea. Tampoco deja mover la tarea a otro proyecto
 * (project_id no es actualizable: no tiene grant de update en la base).
 */
export type UpdateTaskInput = {
  title?: string
  description?: string | null
  status?: TaskStatus
  assignee_id?: string | null
}
