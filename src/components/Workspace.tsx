// Espacio de trabajo: elige el primer proyecto visible y muestra sus tareas.
// Vive dentro de <RepositoriesProvider>, por eso puede usar los hooks de datos.
import { useProjects } from '../hooks/useProjects'
import { DemoModeBadge } from './DemoModeBadge'
import { TaskList } from './TaskList'

export function Workspace() {
  const { projects, loading, error } = useProjects()
  const project = projects[0]

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6 text-slate-800">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">TaskMaster AI</h1>
        <DemoModeBadge />
      </header>

      {loading && <p className="text-sm text-slate-500">Cargando proyectos…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          No se pudieron cargar los proyectos: {error.message}
        </p>
      )}
      {!loading && !error && project === undefined && (
        <p className="text-sm text-slate-500">No eres miembro de ningún proyecto.</p>
      )}
      {project !== undefined && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{project.name}</h2>
          {/* key: al cambiar de proyecto se remonta la lista y el núcleo cambia de scope. */}
          <TaskList key={project.id} projectId={project.id} />
        </section>
      )}
    </main>
  )
}
