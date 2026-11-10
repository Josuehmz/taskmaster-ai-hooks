// Lista de tareas de un proyecto. Mínima a propósito: demuestra el contrato de useTasks
// ({ tasks, loading, error }) sin decidir todavía el diseño del tablero.
import { useTasks } from '../hooks/useTasks'
import type { TaskStatus } from '../types'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Por hacer',
  in_progress: 'En curso',
  done: 'Hecha',
}

export type TaskListProps = {
  readonly projectId: string
}

export function TaskList({ projectId }: TaskListProps) {
  const { tasks, loading, error } = useTasks(projectId)

  if (loading) return <p className="text-sm text-slate-500">Cargando tareas…</p>
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-700">
        No se pudieron cargar las tareas: {error.message}
      </p>
    )
  }
  if (tasks.length === 0) return <p className="text-sm text-slate-500">Sin tareas todavía.</p>

  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center justify-between gap-4 px-4 py-2">
          <span>{task.title}</span>
          <span className="text-xs text-slate-500">{STATUS_LABEL[task.status]}</span>
        </li>
      ))}
    </ul>
  )
}
