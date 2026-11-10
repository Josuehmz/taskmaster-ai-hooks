// Una tarea del tablero: título, responsable, cambio de estado, comentarios y borrar.
// Las acciones llaman a las mutaciones optimistas del hook; aquí no hay lógica de datos.
import { useId } from 'react'
import { TASK_STATUSES, isTaskStatus, type Task, type TaskStatus } from '../types'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Por hacer',
  in_progress: 'En curso',
  done: 'Hecha',
}

export type TaskItemProps = {
  readonly task: Task
  readonly assigneeName: string | null
  readonly selected: boolean
  readonly onStatusChange: (status: TaskStatus) => void
  readonly onDelete: () => void
  readonly onSelect: () => void
}

export function TaskItem({ task, assigneeName, selected, onStatusChange, onDelete, onSelect }: TaskItemProps) {
  const selectId = useId()
  return (
    <li
      className={`flex flex-col gap-2 rounded-md border bg-white p-3 shadow-sm ${
        selected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200'
      }`}
    >
      <p className="font-medium break-words text-slate-900">{task.title}</p>
      <p className="text-xs text-slate-500">Responsable: {assigneeName ?? 'sin asignar'}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          Estado de «{task.title}»
        </label>
        <select
          id={selectId}
          value={task.status}
          onChange={(event) => {
            if (isTaskStatus(event.target.value)) onStatusChange(event.target.value)
          }}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-indigo-600"
        >
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="rounded px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
        >
          Comentarios
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Borrar «${task.title}»`}
          className="ml-auto rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600"
        >
          Borrar
        </button>
      </div>
    </li>
  )
}
