// Formulario para crear una tarea. Valida en el cliente (título obligatorio, máx. 200
// caracteres, igual que el check de la base) y delega la creación optimista en onCreate.
import { useId, useState, type FormEvent } from 'react'
import type { NewTaskFields } from '../types'

export type TaskFormProps = {
  readonly onCreate: (fields: NewTaskFields) => Promise<unknown>
}

const MAX_TITLE = 200

export function TaskForm({ onCreate }: TaskFormProps) {
  const inputId = useId()
  const errorId = useId()
  const [title, setTitle] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = title.trim()
    if (trimmed.length === 0) {
      setValidation('Escribe un título para la tarea.')
      return
    }
    if (trimmed.length > MAX_TITLE) {
      setValidation(`El título admite hasta ${MAX_TITLE} caracteres.`)
      return
    }
    setValidation(null)
    setTitle('') // optimista: el formulario se limpia ya; si falla, el tablero muestra el error
    onCreate({ title: trimmed }).catch(() => {
      setTitle(trimmed) // devolver el texto para reintentar sin reescribirlo
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        Nueva tarea
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={validation !== null}
          aria-describedby={validation === null ? undefined : errorId}
          placeholder="Ej.: Revisar las políticas RLS"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
        />
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-800"
        >
          Crear
        </button>
      </div>
      {validation !== null && (
        <p id={errorId} className="text-sm text-red-700">
          {validation}
        </p>
      )}
    </form>
  )
}
