// Espacio de trabajo: sesión, selector de proyecto y tablero del proyecto elegido.
import { useId, useState, type FormEvent } from 'react'
import { useProjects } from '../hooks/useProjects'
import { useSession } from '../hooks/useSession'
import { DemoModeBadge } from './DemoModeBadge'
import { LoginScreen } from './LoginScreen'
import { TaskBoard } from './TaskBoard'

function NewProjectForm({ onCreate }: { readonly onCreate: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState('')
  const inputId = useId()
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (name.trim().length === 0) return
    void onCreate(name.trim()).then(() => setName(''))
  }
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label htmlFor={inputId} className="sr-only">Nombre del proyecto nuevo</label>
      <input
        id={inputId}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Nombre del proyecto"
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
      />
      <button type="submit" className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
        Crear proyecto
      </button>
    </form>
  )
}

export function Workspace() {
  const session = useSession()
  const { projects, loading, error, createProject } = useProjects()
  const [chosenId, setChosenId] = useState<string | null>(null)
  const selectId = useId()

  if (session.status === 'loading') {
    return <p role="status" className="p-6 text-sm text-slate-600">Comprobando la sesión…</p>
  }
  if (session.status === 'signed-out' || session.user === null) {
    return <LoginScreen session={session} />
  }

  const project = projects.find((p) => p.id === chosenId) ?? projects[0]

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 text-slate-800 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">TaskMaster AI</h1>
          <DemoModeBadge />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="max-w-48 truncate">{session.user.email}</span>
          <button
            type="button"
            onClick={() => void session.signOut()}
            className="rounded px-2 py-1 underline focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            Salir
          </button>
        </div>
      </header>

      {loading && <p role="status" className="text-sm text-slate-600">Cargando proyectos…</p>}
      {error !== null && <p role="alert" className="text-sm text-red-700">No se pudieron cargar los proyectos: {error.message}</p>}
      {!loading && error === null && projects.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-600">No eres miembro de ningún proyecto. Crea uno:</p>
          <NewProjectForm onCreate={(name) => createProject({ name })} />
        </div>
      )}

      {project !== undefined && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="text-sm font-medium">Proyecto</label>
            <select
              id={selectId}
              value={project.id}
              onChange={(event) => setChosenId(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {/* Cambiar de proyecto cambia el projectId: useTasks cierra el canal anterior y abre otro. */}
          <TaskBoard projectId={project.id} currentUserId={session.user.id} />
        </>
      )}
    </main>
  )
}
