# 2. Esquema SQL, RLS y Realtime

Esquema en una sola migración:
[`supabase/migrations/20261110000000_esquema_taskmaster.sql`](../supabase/migrations/20261110000000_esquema_taskmaster.sql).
La aplicó la CLI de Supabase **local** (2.122.0, Docker, con el servicio Realtime) y se probó con
tres usuarios reales de Auth: Ana (owner), Beto (miembro) y Carla (fuera del proyecto). No se usó
ningún proyecto en la nube.

## 2.1 Tablas

`profiles` (un trigger sobre `auth.users` la llena) · `projects` (un trigger mete al creador como
`owner` en `project_members`) · `project_members` (PK `project_id, user_id`) · `tasks` · `comments`.
Las claves foráneas usan `on delete cascade` donde corresponde, y hay índices por `project_id` y
`task_id`. `created_by` y `author_id` tienen `default auth.uid()`, y la política exige que coincidan.

## 2.2 RLS por pertenencia al proyecto

- Las cinco tablas tienen `enable row level security`. Las políticas usan funciones `security
  definer` con `search_path = ''` (`is_project_member`, `is_project_owner`, `can_access_task`,
  `shares_project_with`) para no caer en recursión sobre `project_members`.
- **Privilegios:** Supabase concede todo a `anon` y `authenticated` en cada tabla nueva, y las
  políticas no quitan esos privilegios. Por eso se revoca todo y se concede por columna. Leído de la
  base ([rls-politicas.txt](evidencia/rls-politicas.txt)): `anon` tiene **0** privilegios en
  `public`, y `authenticated` solo puede insertar en `tasks (assignee_id, description, id,
  project_id, status, title)` y actualizar `tasks (assignee_id, description, status, title)`.
  `project_id` y `created_by` no se pueden actualizar.
- Un trigger impide que un proyecto se quede sin owner, salvo en un borrado en cascada.

## 2.3 Realtime

- `tasks`, `comments` y `project_members` están en la publicación `supabase_realtime`, con
  `replica identity full`.
- **Medido en local:** los INSERT y UPDATE solo le llegan a quien es miembro. Los **DELETE llegan
  con `old = { id }`** aunque la tabla tenga `replica identity full`, y le llegan también a Carla,
  incluso en su canal con filtro `project_id=eq.<id>`. No filtran datos, porque solo traen la clave,
  pero sí revelan que existió ese id. El cliente los trata como «quitar si está».

## 2.4 Resultado: 32 de 32

[`docs/evidencia/supabase-local.txt`](evidencia/supabase-local.txt), generado con
`bash herramientas/probar-supabase-local.sh`:

| Bloque | Pruebas |
|---|---|
| Auth y triggers: perfil, owner automático, `created_by` puesto por la base | 1–5 |
| Carla no entra ni ve el proyecto (lista vacía, no error) | 6–7 |
| Suscripción con filtro; INSERT y UPDATE en tiempo real para Beto | 8–13 |
| `id` generado en el cliente: aceptado; repetido, rechazado; no le sirve a Carla | 14–16 |
| Carla no ve, no crea, no actualiza ni borra tareas | 17–20 |
| Privilegios por columna: `created_by` y `project_id` no se reescriben; `anon` no lee | 21–23 |
| Comentarios: `author_id` lo pone la base; Carla no los ve | 24–25 |
| DELETE en tiempo real (solo `id`), nada de INSERT ni UPDATE para Carla | 26–29 |
| Último owner, borrado en cascada, `removeChannel` deja el cliente sin canales | 30–32 |

Intentos guardados: con el esquema de v1, 29 de 29
([bitacora/v1/supabase-local.txt](../bitacora/v1/supabase-local.txt)). Justo después de
`supabase db reset`, el primer intento dio `CHANNEL_ERROR` y el segundo perdió el primer INSERT
([intento 1](../bitacora/v2/supabase-local-intento-1-realtime-reiniciando.txt),
[intento 2](../bitacora/v2/supabase-local-intento-2-primer-evento-perdido.txt)). Ese segundo
intento motivó la recarga en cada `SUBSCRIBED`.

Log de la CLI, con las claves redactadas: [`docs/evidencia/cli/`](evidencia/cli/) (`--version`,
`init`, `start`, `status`, `migration list`, `db reset`, `stop`).
