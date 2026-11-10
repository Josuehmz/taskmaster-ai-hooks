// Comentarios de la tarea seleccionada (useComments). Crear es optimista; si falla, el
// comentario desaparece y se muestra el error.
import { useId, useState, type FormEvent } from 'react'
import { useComments } from '../hooks/useComments'
import { useProfiles } from '../hooks/useProfiles'
import type { Task } from '../types'

export type CommentsPanelProps = {
  readonly task: Task
  readonly currentUserId: string
}

export function CommentsPanel({ task, currentUserId }: CommentsPanelProps) {
  const { comments, loading, error, mutationError, addComment, deleteComment } = useComments(task.id)
  const { profilesById } = useProfiles(comments.map((comment) => comment.author_id))
  const [body, setBody] = useState('')
  const inputId = useId()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = body.trim()
    if (trimmed.length === 0) return
    setBody('')
    addComment(trimmed, currentUserId).catch(() => setBody(trimmed))
  }

  return (
    <section aria-labelledby={`${inputId}-titulo`} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <h2 id={`${inputId}-titulo`} className="text-sm font-semibold text-slate-900">
        Comentarios de «{task.title}»
      </h2>
      {loading && <p role="status" className="text-sm text-slate-500">Cargando comentarios…</p>}
      {error !== null && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
      {mutationError !== null && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo guardar el comentario: {mutationError.message}
        </p>
      )}
      {!loading && comments.length === 0 && <p className="text-sm text-slate-500">Sin comentarios.</p>}
      <ul className="flex flex-col gap-2">
        {comments.map((comment) => (
          <li key={comment.id} className="rounded bg-slate-50 p-2 text-sm">
            <p className="text-xs font-medium text-slate-600">
              {profilesById.get(comment.author_id)?.display_name ?? 'Usuario'}
            </p>
            <p className="break-words text-slate-800">{comment.body}</p>
            {comment.author_id === currentUserId && (
              <button
                type="button"
                onClick={() => {
                  deleteComment(comment.id).catch(() => {})
                }}
                className="mt-1 text-xs text-red-700 underline focus-visible:outline-2 focus-visible:outline-red-600"
              >
                Borrar comentario
              </button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Nuevo comentario
        </label>
        <input
          id={inputId}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Escribe un comentario"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Enviar
        </button>
      </form>
    </section>
  )
}
