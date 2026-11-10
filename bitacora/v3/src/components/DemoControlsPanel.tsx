// Controles que solo existen en modo demo: simular a otro usuario y forzar los estados de
// carga lenta, error de carga y error al guardar. En modo Supabase no se renderiza nada.
import { useState } from 'react'
import { useDemoControls } from '../hooks/RepositoriesContext'

export type DemoControlsPanelProps = {
  readonly projectId: string
}

const LINKS = [
  { href: '?demo=lento', label: 'Carga lenta' },
  { href: '?demo=error', label: 'Error de carga' },
  { href: '?demo=falla-guardar', label: 'Error al guardar' },
  { href: '?', label: 'Normal' },
] as const

export function DemoControlsPanel({ projectId }: DemoControlsPanelProps) {
  const demo = useDemoControls()
  const [last, setLast] = useState<string | null>(null)
  if (demo === null) return null

  return (
    <aside
      aria-label="Controles del modo demo"
      className="flex flex-col gap-2 rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-950"
    >
      <p className="font-semibold">Solo en modo demo</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void demo.simulateRemoteChange(projectId).then(setLast)
          }}
          className="rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
        >
          Simular cambio de otro usuario
        </button>
        {LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded px-1 underline underline-offset-2 hover:text-amber-700 focus-visible:outline-2 focus-visible:outline-amber-800"
          >
            {link.label}
          </a>
        ))}
      </div>
      {last !== null && <p className="text-xs">Simulado: {last}</p>}
    </aside>
  )
}
