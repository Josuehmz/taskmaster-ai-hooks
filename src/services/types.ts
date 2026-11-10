// Contratos de la capa de servicios (repositorios).
//
// Los hooks dependen de ESTAS interfaces, no de supabase-js. Hay dos implementaciones con la
// misma forma: src/services/supabase/ (real) y src/services/demo/ (en memoria, "modo demo").
import type {
  AddMemberInput,
  Comment,
  CreateCommentInput,
  CreateProjectInput,
  CreateTaskInput,
  Profile,
  Project,
  ProjectMember,
  Task,
  UpdateTaskInput,
} from '../types'

/** Estados del canal Realtime (mismos valores que REALTIME_SUBSCRIBE_STATES de supabase-js). */
export type SubscriptionStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'

/**
 * Evento de cambio ya normalizado, independiente de supabase-js.
 * En DELETE solo se garantiza la clave primaria en `old`: con RLS activo, Supabase Realtime
 * entrega únicamente la PK del registro borrado aunque la tabla tenga replica identity full.
 */
export type ChangeEvent<T> =
  | { readonly type: 'INSERT' | 'UPDATE'; readonly row: T }
  | { readonly type: 'DELETE'; readonly old: Partial<T> }

export type ChangeListener<T> = (event: ChangeEvent<T>) => void
export type StatusListener = (status: SubscriptionStatus, error?: Error) => void
export type Unsubscribe = () => void

/**
 * Colección acotada por un "scope" (projectId, taskId...). Es lo único que necesita el núcleo
 * useRealtimeCollection: listar el scope y, si la fuente lo soporta, suscribirse a sus cambios.
 */
export type ScopedCollectionSource<T> = {
  /** Lista las filas del scope. Debe respetar `signal` para cancelar respuestas tardías. */
  list(scopeId: string, signal?: AbortSignal): Promise<T[]>
  /**
   * Abre una suscripción a los cambios del scope. Devuelve la función que la cierra
   * (en Supabase: client.removeChannel). Opcional: projects no está en Realtime.
   */
  subscribe?(scopeId: string, onChange: ChangeListener<T>, onStatus?: StatusListener): Unsubscribe
}

export type TaskRepository = ScopedCollectionSource<Task> & {
  create(input: CreateTaskInput): Promise<Task>
  update(id: string, patch: UpdateTaskInput): Promise<Task>
  remove(id: string): Promise<void>
}

export type CommentRepository = ScopedCollectionSource<Comment> & {
  create(input: CreateCommentInput): Promise<Comment>
  remove(id: string): Promise<void>
}

export type ProjectMemberRepository = ScopedCollectionSource<ProjectMember> & {
  add(input: AddMemberInput): Promise<ProjectMember>
  remove(projectId: string, userId: string): Promise<void>
}

/** El scope de list() se ignora: RLS ya limita la lista a los proyectos del usuario. */
export type ProjectRepository = ScopedCollectionSource<Project> & {
  create(input: CreateProjectInput): Promise<Project>
}

export type ProfileRepository = {
  /** Perfiles visibles (el propio y los de quienes comparten proyecto conmigo). */
  getByIds(ids: readonly string[], signal?: AbortSignal): Promise<Profile[]>
}

export type DataMode = 'supabase' | 'demo'

export type Repositories = {
  readonly mode: DataMode
  readonly projects: ProjectRepository
  readonly members: ProjectMemberRepository
  readonly tasks: TaskRepository
  readonly comments: CommentRepository
  readonly profiles: ProfileRepository
}
