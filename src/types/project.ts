// Entidades Project y ProjectMember.

export const PROJECT_ROLES = ['owner', 'member'] as const

export type ProjectRole = (typeof PROJECT_ROLES)[number]

export type Project = {
  readonly id: string
  readonly name: string
  readonly description: string | null
  /** Lo pone la base con auth.uid(). Queda en null si se borra la cuenta del creador. */
  readonly created_by: string | null
  readonly created_at: string
}

/** Fila de public.project_members. Clave primaria compuesta (project_id, user_id). */
export type ProjectMember = {
  readonly project_id: string
  readonly user_id: string
  readonly role: ProjectRole
  readonly created_at: string
}

/** Crear proyecto: created_by y la membresía de owner los pone la base (default + trigger). */
export type CreateProjectInput = {
  name: string
  description?: string | null
}

/** Agregar miembro: solo un owner puede hacerlo (política RLS). */
export type AddMemberInput = {
  project_id: string
  user_id: string
  role?: ProjectRole
}
