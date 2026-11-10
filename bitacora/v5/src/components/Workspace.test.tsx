// Flujo de inicio de sesión: nada que dependa del usuario se carga sin sesión, y todo se carga
// al iniciarla (hallazgo de la revisión de v2).
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '../types'
import { DEMO_USER_ID, demoRepositories, renderWithDemo, type AuthRepository } from '../test/renderWithDemo'
import { Workspace } from './Workspace'

function signedOutAuth() {
  const user: SessionUser = { id: DEMO_USER_ID, email: 'ana@taskmaster.test' }
  const auth = {
    getSession: vi.fn<AuthRepository['getSession']>(async () => null),
    onAuthStateChange: vi.fn<AuthRepository['onAuthStateChange']>(() => () => {}),
    signIn: vi.fn<AuthRepository['signIn']>(async () => user),
    signOut: vi.fn<AuthRepository['signOut']>(async () => {}),
  } satisfies AuthRepository
  return auth
}

describe('Workspace · sesión', () => {
  it('sin sesión muestra el login y no consulta proyectos; al entrar, los carga', async () => {
    const auth = signedOutAuth()
    const base = demoRepositories()
    const list = vi.spyOn(base.projects, 'list')
    renderWithDemo(<Workspace />, { ...base, auth })

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeTruthy()
    expect(list).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@taskmaster.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Encapsular Supabase en hooks')).toBeTruthy()
    expect(list).toHaveBeenCalledTimes(1)
    expect(auth.signIn).toHaveBeenCalledWith('ana@taskmaster.test', 'x')
  })

  it('al cerrar sesión vuelve al login', async () => {
    const auth = signedOutAuth()
    auth.getSession.mockResolvedValueOnce({ id: DEMO_USER_ID, email: 'ana@taskmaster.test' })
    renderWithDemo(<Workspace />, { auth })
    fireEvent.click(await screen.findByRole('button', { name: 'Salir' }))
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeTruthy()
  })
})
