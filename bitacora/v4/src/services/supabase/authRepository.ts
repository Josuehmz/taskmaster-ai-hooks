// Sesión de Supabase Auth. Es el único archivo que toca client.auth.
//
// - getSession() lee la sesión guardada por supabase-js (localStorage, clave sb-<ref>-auth-token).
// - onAuthStateChange() devuelve la función que quita el listener: useSession la llama en la
//   limpieza de su efecto para no dejar callbacks vivos tras desmontar.
// - Con la sesión iniciada, supabase-js manda el JWT en cada consulta (RLS ve auth.uid()) y
//   también al canal de Realtime, así que los eventos postgres_changes pasan por las mismas
//   políticas de select.
import type { User } from '@supabase/supabase-js'
import type { TaskMasterClient } from '../../lib/supabaseClient'
import type { SessionUser } from '../../types'
import { RepositoryError, toRepositoryError } from '../errors'
import type { AuthRepository } from '../types'

function toSessionUser(user: User): SessionUser {
  return { id: user.id, email: user.email ?? null }
}

export function createSupabaseAuthRepository(client: TaskMasterClient): AuthRepository {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession()
      if (error) throw toRepositoryError(error)
      return data.session ? toSessionUser(data.session.user) : null
    },

    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(session ? toSessionUser(session.user) : null)
      })
      return () => {
        data.subscription.unsubscribe()
      }
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new RepositoryError('forbidden', 'Correo o contraseña incorrectos', { cause: error })
      return toSessionUser(data.user)
    },

    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw toRepositoryError(error)
    },
  }
}
