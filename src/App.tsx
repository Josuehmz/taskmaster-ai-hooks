// Raíz de la app. No decide de dónde vienen los datos ni importa src/services o src/lib: el
// RepositoriesProvider (src/hooks/) crea los repositorios reales si existen VITE_SUPABASE_URL y
// VITE_SUPABASE_ANON_KEY, o los del modo demo si no.
import { Workspace } from './components/Workspace'
import { RepositoriesProvider } from './hooks/RepositoriesContext'

export default function App() {
  return (
    <RepositoriesProvider>
      <Workspace />
    </RepositoriesProvider>
  )
}
