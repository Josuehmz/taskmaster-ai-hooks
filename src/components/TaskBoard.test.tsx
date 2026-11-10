// Prueba del ejemplo de componente: TaskBoard sobre el modo demo (latencia 0).
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEMO_PROJECT_ID, DEMO_USER_ID, renderWithDemo } from '../test/renderWithDemo'
import { TaskBoard } from './TaskBoard'

function renderBoard() {
  return renderWithDemo(<TaskBoard projectId={DEMO_PROJECT_ID} currentUserId={DEMO_USER_ID} />)
}

describe('TaskBoard (ejemplo de implementación)', () => {
  it('muestra la carga y luego las tareas del proyecto', async () => {
    renderBoard()
    expect(screen.getByText('Cargando tareas…')).toBeTruthy()
    expect(await screen.findByText('Encapsular Supabase en hooks')).toBeTruthy()
    expect(await screen.findByText('● En vivo')).toBeTruthy()
  })

  it('valida el título vacío y crea una tarea', async () => {
    renderBoard()
    await screen.findByText('Encapsular Supabase en hooks')
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    expect(screen.getByText('Escribe un título para la tarea.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nueva tarea'), { target: { value: 'Medir el bundle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    expect(await screen.findByText('Medir el bundle')).toBeTruthy()
  })

  it('anuncia el cambio de otro usuario que llega por tiempo real', async () => {
    renderBoard()
    await screen.findByText('Encapsular Supabase en hooks')
    fireEvent.click(screen.getByRole('button', { name: 'Simular cambio de otro usuario' }))
    await waitFor(() => expect(screen.getByText(/En tiempo real: Otro usuario creó/)).toBeTruthy())
  })
})
