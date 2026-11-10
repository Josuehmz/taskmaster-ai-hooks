// Inicio de sesión con correo y contraseña (solo en modo Supabase). Sin sesión, RLS devuelve
// listas vacías: por eso la app pide iniciar sesión antes de mostrar el tablero.
import { useId, useState, type FormEvent } from 'react'
import type { UseSessionResult } from '../hooks/useSession'

export type LoginScreenProps = {
  readonly session: UseSessionResult
}

export function LoginScreen({ session }: LoginScreenProps) {
  const emailId = useId()
  const passwordId = useId()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sending, setSending] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    session
      .signIn(email, password)
      .catch(() => {})
      .finally(() => setSending(false))
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-slate-900">TaskMaster AI</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow">
        <label htmlFor={emailId} className="text-sm font-medium">Correo</label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-indigo-600"
        />
        <label htmlFor={passwordId} className="text-sm font-medium">Contraseña</label>
        <input
          id={passwordId}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-indigo-600"
        />
        {session.error !== null && <p role="alert" className="text-sm text-red-700">{session.error.message}</p>}
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-800"
        >
          {sending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
