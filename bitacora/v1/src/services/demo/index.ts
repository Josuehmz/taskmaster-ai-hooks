// Repositorios del "modo demo": misma interfaz que los de Supabase, datos en memoria.
// Se usan cuando faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY, y en las pruebas.
// Cada llamada a createDemoRepositories() crea un almacén nuevo (aislamiento entre pruebas).
import type { Comment, Profile, Project, ProjectMember, Task } from '../../types'
import { RepositoryError } from '../errors'
import type {
  CommentRepository,
  ProfileRepository,
  ProjectMemberRepository,
  ProjectRepository,
  Repositories,
  TaskRepository,
} from '../types'
import { TASK_UPDATE_COLUMNS, pickDefined } from '../validation'
import { createDemoTable, delay } from './demoTable'

/** Usuario "logueado" del modo demo: hace de auth.uid(). */
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001'
const DEMO_TEAMMATE_ID = '00000000-0000-4000-8000-000000000002'
const DEMO_PROJECT_ID = '00000000-0000-4000-8000-000000000101'

export type DemoOptions = {
  /** Latencia simulada en ms (0 en pruebas). */
  readonly latencyMs?: number
}

const byCreatedAt = (a: { created_at: string }, b: { created_at: string }) =>
  a.created_at.localeCompare(b.created_at)

function memberKey(projectId: string, userId: string): string {
  return `${projectId}:${userId}`
}

export function createDemoRepositories(options: DemoOptions = {}): Repositories {
  const latency = options.latencyMs ?? 250
  const seededAt = new Date(Date.now() - 60_000).toISOString()
  const now = () => new Date().toISOString()

  const profileRows: readonly Profile[] = [
    { id: DEMO_USER_ID, display_name: 'Usuario demo', created_at: seededAt },
    { id: DEMO_TEAMMATE_ID, display_name: 'Compañero demo', created_at: seededAt },
  ]

  const projects = createDemoTable<Project>({
    keyOf: (row) => row.id,
    scopeOf: () => 'me',
    primaryKeyOf: (row) => ({ id: row.id }),
    seed: [
      {
        id: DEMO_PROJECT_ID,
        name: 'Proyecto de ejemplo',
        description: 'Datos simulados: se pierden al recargar.',
        created_by: DEMO_USER_ID,
        created_at: seededAt,
      },
    ],
  })

  const members = createDemoTable<ProjectMember>({
    keyOf: (row) => memberKey(row.project_id, row.user_id),
    scopeOf: (row) => row.project_id,
    primaryKeyOf: (row) => ({ project_id: row.project_id, user_id: row.user_id }),
    seed: [
      { project_id: DEMO_PROJECT_ID, user_id: DEMO_USER_ID, role: 'owner', created_at: seededAt },
      { project_id: DEMO_PROJECT_ID, user_id: DEMO_TEAMMATE_ID, role: 'member', created_at: seededAt },
    ],
  })

  const tasks = createDemoTable<Task>({
    keyOf: (row) => row.id,
    scopeOf: (row) => row.project_id,
    primaryKeyOf: (row) => ({ id: row.id }),
    seed: [
      {
        id: '00000000-0000-4000-8000-000000001001',
        project_id: DEMO_PROJECT_ID,
        title: 'Definir el esquema de datos',
        description: null,
        status: 'done',
        assignee_id: DEMO_USER_ID,
        created_by: DEMO_USER_ID,
        created_at: seededAt,
        updated_at: seededAt,
      },
      {
        id: '00000000-0000-4000-8000-000000001002',
        project_id: DEMO_PROJECT_ID,
        title: 'Encapsular Supabase en hooks',
        description: 'useTasks, useComments, useProjectMembers',
        status: 'in_progress',
        assignee_id: DEMO_TEAMMATE_ID,
        created_by: DEMO_USER_ID,
        created_at: seededAt,
        updated_at: seededAt,
      },
    ],
  })

  const comments = createDemoTable<Comment>({
    keyOf: (row) => row.id,
    scopeOf: (row) => row.task_id,
    primaryKeyOf: (row) => ({ id: row.id }),
    seed: [
      {
        id: '00000000-0000-4000-8000-000000002001',
        task_id: '00000000-0000-4000-8000-000000001002',
        author_id: DEMO_TEAMMATE_ID,
        body: 'Recordar limpiar el canal con removeChannel.',
        created_at: seededAt,
      },
    ],
  })

  // Equivalente demo de la RLS: solo se opera sobre proyectos donde DEMO_USER_ID es miembro.
  function requireMember(projectId: string): void {
    if (members.get(memberKey(projectId, DEMO_USER_ID)) === undefined) {
      throw new RepositoryError('forbidden', 'No eres miembro de este proyecto')
    }
  }

  function requireOwner(projectId: string): void {
    if (members.get(memberKey(projectId, DEMO_USER_ID))?.role !== 'owner') {
      throw new RepositoryError('forbidden', 'Solo un owner puede hacer esto')
    }
  }

  function requireTitle(title: string): string {
    const trimmed = title.trim()
    if (trimmed.length === 0) throw new RepositoryError('validation', 'El título es obligatorio')
    return trimmed
  }

  function requireAssignee(projectId: string, assigneeId: string | null | undefined): void {
    if (assigneeId == null) return
    if (members.get(memberKey(projectId, assigneeId)) === undefined) {
      throw new RepositoryError('validation', 'El responsable debe ser miembro del proyecto')
    }
  }

  const projectRepository: ProjectRepository = {
    async list(_scope, signal) {
      await delay(latency, signal)
      return projects
        .list((project) => members.get(memberKey(project.id, DEMO_USER_ID)) !== undefined)
        .toSorted((a, b) => byCreatedAt(b, a))
    },
    async create(input) {
      await delay(latency)
      const name = requireTitle(input.name)
      const createdAt = now()
      const project = projects.insert({
        id: crypto.randomUUID(),
        name,
        description: input.description ?? null,
        created_by: DEMO_USER_ID,
        created_at: createdAt,
      })
      // Equivalente del trigger on_project_created.
      members.insert({ project_id: project.id, user_id: DEMO_USER_ID, role: 'owner', created_at: createdAt })
      return project
    },
  }

  const memberRepository: ProjectMemberRepository = {
    async list(projectId, signal) {
      await delay(latency, signal)
      requireMember(projectId)
      return members.list((member) => member.project_id === projectId).toSorted(byCreatedAt)
    },
    async add(input) {
      await delay(latency)
      requireOwner(input.project_id)
      if (!profileRows.some((profile) => profile.id === input.user_id)) {
        throw new RepositoryError('validation', 'El usuario no existe')
      }
      if (members.get(memberKey(input.project_id, input.user_id)) !== undefined) {
        throw new RepositoryError('validation', 'Ya es miembro del proyecto')
      }
      return members.insert({
        project_id: input.project_id,
        user_id: input.user_id,
        role: input.role ?? 'member',
        created_at: now(),
      })
    },
    async remove(projectId, userId) {
      await delay(latency)
      if (userId !== DEMO_USER_ID) requireOwner(projectId)
      const target = members.get(memberKey(projectId, userId))
      if (target === undefined) throw new RepositoryError('not_found', 'El miembro no existe')
      const owners = members.list((m) => m.project_id === projectId && m.role === 'owner')
      if (target.role === 'owner' && owners.length <= 1) {
        throw new RepositoryError('validation', 'Un proyecto no puede quedarse sin owner')
      }
      members.remove(memberKey(projectId, userId))
    },
    subscribe: (projectId, onChange, onStatus) => members.subscribe(projectId, onChange, onStatus),
  }

  const taskRepository: TaskRepository = {
    async list(projectId, signal) {
      await delay(latency, signal)
      requireMember(projectId)
      return tasks.list((task) => task.project_id === projectId).toSorted(byCreatedAt)
    },
    async create(input) {
      await delay(latency)
      requireMember(input.project_id)
      requireAssignee(input.project_id, input.assignee_id)
      const createdAt = now()
      return tasks.insert({
        id: crypto.randomUUID(),
        project_id: input.project_id,
        title: requireTitle(input.title),
        description: input.description ?? null,
        status: input.status ?? 'todo',
        assignee_id: input.assignee_id ?? null,
        created_by: DEMO_USER_ID,
        created_at: createdAt,
        updated_at: createdAt,
      })
    },
    async update(id, patch) {
      await delay(latency)
      const current = tasks.get(id)
      if (current === undefined) throw new RepositoryError('not_found', 'La tarea no existe')
      requireMember(current.project_id)
      const changes = pickDefined(patch, TASK_UPDATE_COLUMNS)
      if (Object.keys(changes).length === 0) {
        throw new RepositoryError('validation', 'No hay cambios que guardar')
      }
      requireAssignee(current.project_id, changes.assignee_id)
      const title = changes.title === undefined ? current.title : requireTitle(changes.title)
      return tasks.replace({ ...current, ...changes, title, updated_at: now() })
    },
    async remove(id) {
      await delay(latency)
      const current = tasks.get(id)
      if (current === undefined) throw new RepositoryError('not_found', 'La tarea no existe')
      requireMember(current.project_id)
      // Equivalente de on delete cascade sobre comments.
      for (const comment of comments.list((c) => c.task_id === id)) comments.remove(comment.id)
      tasks.remove(id)
    },
    subscribe: (projectId, onChange, onStatus) => tasks.subscribe(projectId, onChange, onStatus),
  }

  function requireTaskMember(taskId: string): void {
    const task = tasks.get(taskId)
    if (task === undefined) throw new RepositoryError('not_found', 'La tarea no existe')
    requireMember(task.project_id)
  }

  const commentRepository: CommentRepository = {
    async list(taskId, signal) {
      await delay(latency, signal)
      requireTaskMember(taskId)
      return comments.list((comment) => comment.task_id === taskId).toSorted(byCreatedAt)
    },
    async create(input) {
      await delay(latency)
      requireTaskMember(input.task_id)
      const body = input.body.trim()
      if (body.length === 0) throw new RepositoryError('validation', 'El comentario está vacío')
      return comments.insert({
        id: crypto.randomUUID(),
        task_id: input.task_id,
        author_id: DEMO_USER_ID,
        body,
        created_at: now(),
      })
    },
    async remove(id) {
      await delay(latency)
      const current = comments.get(id)
      if (current === undefined) throw new RepositoryError('not_found', 'El comentario no existe')
      if (current.author_id !== DEMO_USER_ID) {
        throw new RepositoryError('forbidden', 'Solo el autor puede borrar su comentario')
      }
      comments.remove(id)
    },
    subscribe: (taskId, onChange, onStatus) => comments.subscribe(taskId, onChange, onStatus),
  }

  const profileRepository: ProfileRepository = {
    async getByIds(ids, signal) {
      await delay(latency, signal)
      return profileRows.filter((profile) => ids.includes(profile.id))
    },
  }

  return {
    mode: 'demo',
    projects: projectRepository,
    members: memberRepository,
    tasks: taskRepository,
    comments: commentRepository,
    profiles: profileRepository,
  }
}
