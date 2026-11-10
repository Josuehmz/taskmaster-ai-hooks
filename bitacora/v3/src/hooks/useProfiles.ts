// useProfiles(ids): nombres visibles de usuarios (entidad Usuarios), con caché por id.
//
// Reutiliza el mismo núcleo: el "scope" es la lista de ids ordenada y unida, y la fuente es un
// adaptador del ProfileRepository que consulta solo los ids que no están en caché. Sin
// Realtime: el nombre visible casi no cambia y profiles no está en la publicación.
import { useMemo, useState } from 'react'
import type { ScopedCollectionSource } from '../services/types'
import type { Profile } from '../types'
import { useRepositories } from './RepositoriesContext'
import { useRealtimeCollection, type Compare, type KeyOf } from './useRealtimeCollection'

export type UseProfilesResult = {
  readonly profilesById: ReadonlyMap<string, Profile>
  readonly loading: boolean
  readonly error: Error | null
}

const profileKey: KeyOf<Profile> = (row) => row.id ?? null
const byName: Compare<Profile> = (a, b) => a.display_name.localeCompare(b.display_name)

export function useProfiles(ids: readonly string[]): UseProfilesResult {
  const { profiles: repository } = useRepositories()
  // La caché vive lo que vive el componente; se comparte entre cambios de `ids`.
  const [cache] = useState(() => new Map<string, Profile>())

  const source = useMemo<ScopedCollectionSource<Profile>>(
    () => ({
      async list(scope, signal) {
        const wanted = scope.split(',')
        const missing = wanted.filter((id) => !cache.has(id))
        if (missing.length > 0) {
          for (const profile of await repository.getByIds(missing, signal)) cache.set(profile.id, profile)
        }
        return wanted.flatMap((id) => {
          const profile = cache.get(id)
          return profile === undefined ? [] : [profile]
        })
      },
    }),
    [repository, cache],
  )

  const scope = useMemo(() => {
    const unique = [...new Set(ids)].toSorted()
    return unique.length === 0 ? null : unique.join(',')
  }, [ids])

  const { data, loading, error } = useRealtimeCollection({
    scopeId: scope,
    source,
    keyOf: profileKey,
    compare: byName,
  })

  const profilesById = useMemo(() => new Map(data.map((profile) => [profile.id, profile])), [data])
  return { profilesById, loading, error }
}
