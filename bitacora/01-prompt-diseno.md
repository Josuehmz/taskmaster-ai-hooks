# Prompt 1 · Diseño de la abstracción (instrucción 1 del enunciado)

**Objetivo del paso:** antes de escribir lógica, fijar las entidades (Tareas, Usuarios,
Comentarios), el esquema SQL con RLS y la estructura de hooks que encapsula `supabase-js`.
El prompt mete desde el principio las trampas conocidas de labs anteriores: RLS no quita los
privilegios por defecto de Supabase, el rol o el dueño no se toma del cliente, y los `DELETE` de
Realtime necesitan `replica identity full`.

- Respuesta cruda: [v1/respuesta.md](v1/respuesta.md)
- Código tal como salió: [v1/src/](v1/src/) y [v1/supabase/](v1/supabase/)
- Verificación real (tsc, lint, build): [v1/verificacion.txt](v1/verificacion.txt)

> Nota de proceso: la primera respuesta a este prompt quedó cortada (otra sesión de trabajo escribió
> en la misma carpeta al mismo tiempo y luego retiró sus archivos). Se pidió al asistente completar
> su propia respuesta con el mismo prompt; `v1/` es esa respuesta completa, sin retoques.

## Prompt literal

```text
Actúa como arquitecto de software de una app React. Proyecto: "TaskMaster AI", gestión de proyectos
colaborativos. La base de datos vive en Supabase y la interfaz en React; hoy la lógica de Supabase
está mezclada con los componentes. En este paso SOLO diseñas la abstracción; la lógica completa de
los hooks llega en el siguiente paso.

Stack fijo (ya instalado, no agregues dependencias): Vite 8, React 19, TypeScript 7 en modo estricto
(strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax,
erasableSyntaxOnly: nada de enum ni namespace), Tailwind 4, @supabase/supabase-js 2.119, Vitest 5 con
happy-dom y @testing-library/react 16, oxlint. Gestor: pnpm.

Entrega:

1. Entidades y tipos (src/types/): Project, ProjectMember (rol 'owner' | 'member'), Profile
   (usuario: id = auth.users.id, nombre visible), Task (id, project_id, title, description,
   status 'todo' | 'in_progress' | 'done', assignee_id, created_by, created_at, updated_at) y
   Comment (id, task_id, author_id, body, created_at). Tipos de entrada para crear y actualizar
   tareas que NO dejen fijar desde el cliente id, created_by, created_at ni updated_at.

2. Esquema SQL en supabase/migrations/20261110000000_esquema_taskmaster.sql (PostgreSQL 17 de Supabase):
   - Tablas profiles, projects, project_members, tasks, comments con claves foráneas y on delete
     cascade donde corresponda, índices para las consultas por project_id y task_id.
   - profiles se llena con un trigger sobre auth.users (security definer, search_path vacío).
   - Al crear un proyecto, un trigger agrega al creador como 'owner' en project_members.
   - created_by y author_id los pone la base con auth.uid() (default + check en la política), no
     el cliente.
   - RLS en todas las tablas: un usuario solo ve y modifica proyectos, miembros, tareas y
     comentarios de proyectos de los que es miembro. Usa una función security definer
     is_project_member(project_id) para no caer en recursión de políticas sobre project_members.
   - Supabase concede por defecto todo a anon y authenticated en cada tabla nueva y las políticas
     no quitan esos privilegios: revoca todo a anon y authenticated y concede solo lo necesario, por
     columna en insert y update.
   - Realtime: agrega tasks y comments a la publicación supabase_realtime y pon replica identity
     full en ambas, porque sin eso los eventos DELETE solo traen la clave primaria y no se pueden
     filtrar por project_id.
   - Idempotente donde se pueda (drop policy if exists, create or replace function).

3. Estructura de hooks (src/hooks/ y src/services/), con firmas y comentarios, sin la lógica final:
   - Una capa de servicios (repositorio) por entidad que es lo ÚNICO que importa el cliente de
     supabase (src/lib/supabaseClient.ts). El cliente se crea solo si existen VITE_SUPABASE_URL y
     VITE_SUPABASE_ANON_KEY; si faltan, la app usa un repositorio demo en memoria con la misma
     interfaz ("modo demo", que la UI debe rotular).
   - Un núcleo reutilizable (por ejemplo useRealtimeCollection) con el estado común
     { data, loading, error }, la suscripción Realtime y la reconciliación de eventos, para que
     useTasks(projectId), useComments(taskId) y useProjectMembers(projectId) lo compongan en vez de
     copiar la lógica.
   - useTasks(projectId) expondrá: tasks, loading, error, createTask, updateTask, deleteTask,
     refetch. Explica en comentarios cómo se hará la actualización optimista con reversión, cómo
     se evitará duplicar el eco Realtime de las mutaciones propias, cómo se limpia el canal
     (removeChannel) y cómo se descartan respuestas tardías al cambiar de proyecto o desmontar.
   - Los componentes de src/components/ nunca importan supabase ni src/lib.

4. Un App.tsx mínimo que compile, y en respuesta.md: el diagrama de capas en texto, la tabla
   entidad → tabla → hook → servicio, y las decisiones con su porqué.

Archivos completos, no fragmentos. El código debe compilar con tsc -b y pasar oxlint.
```
