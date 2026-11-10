// Insignia del modo demo. Se muestra siempre que la app corre sin Supabase, para que nadie
// confunda los datos en memoria (que se pierden al recargar) con datos reales.
// Es texto estático: no lleva role="status" (no anuncia cambios).
import { useDataMode } from '../hooks/RepositoriesContext'

export function DemoModeBadge() {
  const mode = useDataMode()
  if (mode !== 'demo') return null
  return (
    <span
      title="Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY: los datos viven en memoria"
      className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-300"
    >
      MODO DEMO · datos simulados
    </span>
  )
}
