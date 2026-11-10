// TaskBoard: EJEMPLO DE IMPLEMENTACIÓN del hook useTasks en un componente.
//
// El componente no sabe nada de Supabase: pide { tasks, loading, error, realtime, mutationError,
// lastRemoteChange } y llama a createTask/updateTask/deleteTask. La carga, el canal Realtime, el
// optimismo, la reversión y la limpieza viven en el hook.
import { useState } from 'react'
import type { RealtimeStatus } from '../hooks/useRealtimeCollection'
import { useProfiles } from '../hooks/useProfiles'
import { useProjectMembers } from '../hooks/useProjectMembers'
import { useTasks } from '../hooks/useTasks'
import { TASK_STATUSES, type Task } from '../types'
import { CommentsPanel } from './CommentsPanel'
import { DemoControlsPanel } from './DemoControlsPanel'
import { MembersList } from './MembersList'
import { TaskForm } from './TaskForm'
import { STATUS_LABEL, TaskItem } from './TaskItem'

export type TaskBoardProps = {
  readonly projectId: string
  readonly currentUserId: string
}

const REMOTE_VERB = { INSERT: 'creó', UPDATE: 'actualizó', DELETE: 'borró' } as const

function describeRemote(change: { type: keyof typeof REMOTE_VERB; row: Task }): string {
  const status = change.type === 'UPDATE' ? ` (ahora: ${STATUS_LABEL[change.row.status]})` : ''
  return `Otro usuario ${REMOTE_VERB[change.type]} «${change.row.title}»${status}`
}

const REALTIME_BADGE: Record<RealtimeStatus, { text: string; className: string }> = {
  off: { text: 'Sin tiempo real', className: 'bg-slate-100 text-slate-600' },
  connecting: { text: 'Conectando tiempo real…', className: 'bg-slate-100 text-slate-700' },
  live: { text: '● En vivo', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
  offline: {
    text: 'Tiempo real desconectado: reintentando (la lista se recarga al volver)',
    className: 'bg-amber-50 text-amber-900 ring-1 ring-amber-300',
  },
}

export function TaskBoard({ projectId, currentUserId }: TaskBoardProps) {
  const {
    tasks,
    loading,
    error,
    realtime,
    mutationError,
    lastRemoteChange,
    createTask,
    updateTask,
    deleteTask,
    refetch,
    clearMutationError,
  } = useTasks(projectId)
  const { members } = useProjectMembers(projectId)
  const { profilesById } = useProfiles(members.map((member) => member.user_id))
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null
  const nameOf = (userId: string | null) =>
    userId === null ? null : (profilesById.get(userId)?.display_name ?? 'Usuario')
  const badge = REALTIME_BADGE[realtime]

  // Las mutaciones ya revierten y guardan el error en mutationError; aquí solo se evita el
  // "unhandled rejection" de la promesa.
  const ignore = () => {}

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section aria-labelledby="tareas-titulo" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="tareas-titulo" className="text-lg font-semibold text-slate-900">
            Tareas
          </h2>
          <output className={`rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}>{badge.text}</output>
        </div>

        <TaskForm onCreate={createTask} />

        {/* Región viva: los lectores de pantalla anuncian lo que llega por tiempo real. */}
        <p aria-live="polite" className="min-h-5 text-sm text-emerald-800">
          {lastRemoteChange !== null && (
            <span className="rounded bg-emerald-50 px-2 py-1 ring-1 ring-emerald-200">
              En tiempo real: {describeRemote(lastRemoteChange)}
            </span>
          )}
        </p>

        {mutationError !== null && (
          <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
            <p className="flex-1">No se pudo guardar el cambio y se deshizo: {mutationError.message}</p>
            <button
              type="button"
              onClick={clearMutationError}
              className="rounded px-2 text-red-900 underline focus-visible:outline-2 focus-visible:outline-red-700"
            >
              Cerrar
            </button>
          </div>
        )}

        {loading && (
          <output className="flex items-center gap-2 text-sm text-slate-600">
            <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 motion-reduce:animate-none" />
            Cargando tareas…
          </output>
        )}

        {!loading && error !== null && (
          <div role="alert" className="flex flex-col gap-2 rounded-md bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
            <p>No se pudieron cargar las tareas: {error.message}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="self-start rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900"
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && error === null && tasks.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Este proyecto no tiene tareas todavía. Crea la primera arriba.
          </p>
        )}

        {!loading && tasks.length > 0 && (
          <div className="grid gap-3 md:grid-cols-3">
            {TASK_STATUSES.map((status) => {
              const column = tasks.filter((task) => task.status === status)
              return (
                <section key={status} aria-label={STATUS_LABEL[status]} className="flex flex-col gap-2 rounded-lg bg-slate-100 p-2">
                  <h3 className="px-1 text-sm font-semibold text-slate-700">
                    {STATUS_LABEL[status]} <span className="font-normal text-slate-500">({column.length})</span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {column.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        assigneeName={nameOf(task.assignee_id)}
                        selected={task.id === selectedTaskId}
                        onStatusChange={(next) => {
                          updateTask(task.id, { status: next }).catch(ignore)
                        }}
                        onDelete={() => {
                          if (task.id === selectedTaskId) setSelectedTaskId(null)
                          deleteTask(task.id).catch(ignore)
                        }}
                        onSelect={() => setSelectedTaskId(task.id === selectedTaskId ? null : task.id)}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-4">
        <DemoControlsPanel projectId={projectId} />
        <MembersList projectId={projectId} />
        {selectedTask !== null && (
          // key: al cambiar de tarea el panel se remonta y useComments cambia de canal.
          <CommentsPanel key={selectedTask.id} task={selectedTask} currentUserId={currentUserId} />
        )}
      </div>
    </div>
  )
}
