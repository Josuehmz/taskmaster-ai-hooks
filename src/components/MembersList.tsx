// Miembros del proyecto (useProjectMembers + useProfiles para el nombre visible).
import { useProfiles } from '../hooks/useProfiles'
import { useProjectMembers } from '../hooks/useProjectMembers'

export type MembersListProps = {
  readonly projectId: string
}

export function MembersList({ projectId }: MembersListProps) {
  const { members, loading, error } = useProjectMembers(projectId)
  const { profilesById, loading: profilesLoading } = useProfiles(members.map((member) => member.user_id))

  return (
    <section aria-labelledby="miembros-titulo" className="rounded-lg border border-slate-200 bg-white p-3">
      <h2 id="miembros-titulo" className="mb-2 text-sm font-semibold text-slate-900">
        Miembros
      </h2>
      {loading && <output className="block text-sm text-slate-500">Cargando miembros…</output>}
      {error !== null && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {members.map((member) => (
          <li key={member.user_id} className="flex justify-between gap-2">
            <span>{profilesById.get(member.user_id)?.display_name ?? (profilesLoading ? 'Cargando nombre…' : 'Usuario')}</span>
            <span className="text-xs text-slate-500">{member.role === 'owner' ? 'Owner' : 'Miembro'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
