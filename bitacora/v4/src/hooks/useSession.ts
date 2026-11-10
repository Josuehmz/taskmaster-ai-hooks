// useSession(): sesión del usuario (Supabase Auth o usuario simulado del modo demo).
//
// getSession() da la sesión guardada al montar; onAuthStateChange() mantiene el estado al día
// (inicio y cierre de sesión, refresco del token). La limpieza del efecto quita el listener y
// descarta la respuesta de getSession si llega después de desmontar.
import { useCallback, useEffect, useState } from 'react'
import type { SessionUser } from '../types'
import { useRepositories } from './RepositoriesContext'

export type SessionStatus = 'loading' | 'signed-in' | 'signed-out'

export type UseSessionResult = {
  readonly status: SessionStatus
  readonly user: SessionUser | null
  readonly error: Error | null
  readonly signIn: (email: string, password: string) => Promise<void>
  readonly signOut: () => Promise<void>
}

type SessionState = { readonly status: SessionStatus; readonly user: SessionUser | null; readonly error: Error | null }

function fromUser(user: SessionUser | null): SessionState {
  return { status: user ? 'signed-in' : 'signed-out', user, error: null }
}

export function useSession(): UseSessionResult {
  const { auth } = useRepositories()
  const [state, setState] = useState<SessionState>({ status: 'loading', user: null, error: null })

  useEffect(() => {
    let active = true
    auth.getSession().then(
      (user) => {
        if (active) setState(fromUser(user))
      },
      (error: unknown) => {
        if (active) {
          setState({ status: 'signed-out', user: null, error: error instanceof Error ? error : new Error(String(error)) })
        }
      },
    )
    const unsubscribe = auth.onAuthStateChange((user) => {
      if (active) setState(fromUser(user))
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [auth])

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const user = await auth.signIn(email, password)
        setState(fromUser(user))
      } catch (error) {
        setState({ status: 'signed-out', user: null, error: error instanceof Error ? error : new Error(String(error)) })
        throw error
      }
    },
    [auth],
  )

  const signOut = useCallback(async () => {
    await auth.signOut()
    setState(fromUser(null))
  }, [auth])

  return { ...state, signIn, signOut }
}
