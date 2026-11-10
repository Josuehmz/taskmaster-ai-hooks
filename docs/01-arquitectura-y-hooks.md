# 1. Arquitectura y estructura de hooks

La interfaz no conoce a Supabase. Habla con hooks, los hooks hablan con interfaces de repositorio,
y solo `src/services/supabase/` importa `supabase-js`. Responde a la instrucción 1 del enunciado
(diseño de abstracción).

## 1.1 Entidades

| Entidad | Tabla | Hook | Repositorio (interfaz → implementaciones) | Tiempo real |
|---|---|---|---|---|
| Tareas | `tasks` | `useTasks(projectId)` | `TaskRepository` → Supabase, demo | Sí, filtro `project_id=eq.<id>` |
| Comentarios | `comments` | `useComments(taskId)` | `CommentRepository` → Supabase, demo | Sí, filtro `task_id=eq.<id>` |
| Usuarios (miembros) | `project_members` | `useProjectMembers(projectId)` | `ProjectMemberRepository` → Supabase, demo | Sí, filtro `project_id=eq.<id>` |
| Usuarios (perfiles) | `profiles` | `useProfiles(ids)` (caché por id) | `ProfileRepository` → Supabase, demo | No (casi no cambia) |
| Proyectos | `projects` | `useProjects()` | `ProjectRepository` → Supabase, demo | No (recarga) |
| Sesión | `auth.users` | `useSession()` | `AuthRepository` → Supabase Auth, demo | `onAuthStateChange` |

Los tipos están en `src/types/`. `CreateTaskInput` no deja fijar `created_by`, `created_at` ni
`updated_at`. El `id` sí puede ir, porque lo genera el hook (ver 1.4).

## 1.2 Capas

```
src/components/  TaskBoard, TaskForm, TaskItem, CommentsPanel, MembersList, Workspace, LoginScreen
      │  solo importan hooks y tipos  (oxlint: no-restricted-imports lo hace cumplir)
      ▼
src/hooks/       useTasks · useComments · useProjectMembers · useProfiles · useProjects · useSession
      │            └── todos componen useRealtimeCollection (núcleo) + reconcile.ts (funciones puras)
      │  dependen de las interfaces de src/services/types.ts, nunca de supabase-js
      ▼
src/services/    index.ts: createRepositories() con import() dinámico por modo
      ├── supabase/   repositorios reales + realtime.ts (canal y removeChannel)
      └── demo/       repositorios en memoria con la misma interfaz («modo demo» rotulado)
      ▼
src/lib/supabaseClient.ts   createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
```

La regla de capas se probó en negativo: un componente que importa `@supabase/supabase-js`,
`../lib/supabaseClient` y `../services` hace fallar el lint con tres errores
([verificación final](evidencia/verificacion-final.txt), sección «Regla de capas en negativo»).

## 1.3 El núcleo reutilizable

[`src/hooks/useRealtimeCollection.ts`](../src/hooks/useRealtimeCollection.ts) implementa una sola vez
lo que comparten todas las entidades:

- Estado independiente `{ data, loading, error }`, más `mutationError`, `lastRemoteChange` y
  `realtime` (`off | connecting | live | offline`). Un fallo del canal no se presenta como error de
  carga.
- La suscripción Realtime se abre en un `useEffect`. La limpieza hace `removeChannel`, aborta la
  consulta en vuelo, quita los listeners de `visibilitychange` y `online`, y deja `scopeRef = null`.
- La reconciliación de INSERT, UPDATE y DELETE está en `reconcile.ts` (funciones puras, probadas aparte).
- `mutateUpsert` y `mutateRemove` aplican el cambio optimista y lo revierten si el servidor falla.

Cada hook de entidad solo aporta su clave (`keyOf`), su orden (`compare`), opcionalmente su versión
(`versionOf`) y sus mutaciones. `useTasks` tiene 136 líneas, de las que casi la mitad son
comentarios.

## 1.4 Decisiones

| Decisión | Por qué | Evidencia |
|---|---|---|
| El id de la tarea lo genera el cliente (`crypto.randomUUID()`) | El eco del INSERT y la respuesta HTTP caen en la misma fila sin importar cuál llega primero | prueba «no duplica el eco… aunque llegue ANTES»; Supabase local: «id repetido se rechaza» |
| Eventos diferidos mientras hay una mutación propia en vuelo | Evita que el eco pise lo optimista y que la reversión resucite una fila que otro usuario borró | prueba «un cambio ajeno… durante una edición propia fallida no se pierde» |
| DELETE = «quitar si está» | Medido: con RLS el DELETE trae solo `{ id }` y le llega a quien no es miembro | [supabase-local.txt](evidencia/supabase-local.txt) pruebas 27 a 29 |
| Recarga en cada `SUBSCRIBED` | El canal solo escucha desde su `SUBSCRIBED`; lo que pasa antes, o durante una caída, no llega | pruebas de reconexión (v4) |
| Repositorios por contexto | Mismo hook en Supabase, en demo y en pruebas, sin mocks de módulos | 38 pruebas sin red |
| `import()` dinámico por modo | El modo demo no descarga supabase-js (210 kB) | [3.3](03-auditoria-ia.md#33-tamaño-de-bundle) |

Fuentes: `src/hooks/`, `src/services/`, [bitácora de prompts](../bitacora/README.md).
