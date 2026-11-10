// Raíz de composición. Es el único punto, fuera de src/services/, que decide qué repositorios
// usa la app: los reales si hay VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY, los demo si no.
// No importa src/lib: esa decisión la toma createRepositories().
import { RepositoriesProvider } from './hooks/RepositoriesContext'
import { Workspace } from './components/Workspace'
import { createRepositories } from './services'

// Una sola instancia, creada fuera del render: los hooks la usan como dependencia estable.
const repositories = createRepositories()

export default function App() {
  return (
    <RepositoriesProvider value={repositories}>
      <Workspace />
    </RepositoriesProvider>
  )
}
