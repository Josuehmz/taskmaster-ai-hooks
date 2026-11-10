# TaskMaster AI · abstracción de datos sobre Supabase (paso 1: diseño)

> Esta respuesta se completó en un segundo turno: la primera quedó cortada a mitad de los hooks
> por un choque con otra sesión. Los archivos del primer intento se conservaron y se ajustaron
> para que todo sea coherente (se agregó `replaceLocal` al núcleo).

En este paso se fija la arquitectura: tipos, esquema SQL con RLS, contratos de servicios, el
núcleo reutilizable de hooks y las firmas de `useTasks`, `useComments` y `useProjectMembers`.
Las mutaciones ya funcionan de forma pesimista (esperan al servidor); el optimismo con
reversión queda descrito en los comentarios de `src/hooks/useTasks.ts` y llega en el siguiente
paso sin cambiar ninguna firma pública.

No se ejecutaron `tsc -b`, oxlint ni pruebas en esta sesión (regla del laboratorio): el código
se escribió para compilar en modo estricto, pero no está verificado.

## Archivos

| Ruta | Qué es |
|---|---|
| `src/types/{task,project,profile,comment,index}.ts` | Entidades y tipos de entrada |
| `src/lib/supabaseClient.ts` | Cliente único; `null` si faltan las variables |
| `src/services/types.ts` | Contratos de repositorio (`ScopedCollectionSource`, `TaskRepository`…) |
| `src/services/errors.ts` | `RepositoryError` con códigos estables; traduce PostgrestError |
| `src/services/validation.ts` | Listas blancas de columnas, `assertUuid`, `pickDefined` |
| `src/services/supabase/*` | Repositorios reales y suscripción Realtime con `removeChannel` |
| `src/services/demo/*` | Repositorios en memoria con eventos que imitan Realtime |
| `src/services/index.ts` | `createRepositories()`: Supabase o demo |
| `src/hooks/reconcile.ts` | Reconciliación pura (upsert/remove/applyChange), probable sin React |
| `src/hooks/useRealtimeCollection.ts` | Núcleo: `{ data, loading, error }`, canal, búfer, descarte |
| `src/hooks/RepositoriesContext.tsx` | Inyección de repositorios y `useDataMode()` |
| `src/hooks/use{Tasks,Comments,ProjectMembers,Projects}.ts` | Hooks de entidad |
| `src/components/{DemoModeBadge,TaskList,Workspace}.tsx` | UI mínima |
| `src/App.tsx` | Raíz de composición |
| `supabase/migrations/20261110000000_esquema_taskmaster.sql` | Esquema, RLS, grants, Realtime |

## Diagrama de capas

```
┌──────────────────────────────────────────────────────────────────────────┐
│ src/App.tsx  (raíz de composición: createRepositories() una vez)         │
│        │ <RepositoriesProvider value={repositories}>                     │
├────────▼─────────────────────────────────────────────────────────────────┤
│ src/components/   DemoModeBadge · Workspace · TaskList                   │
│   solo importan hooks y tipos; NUNCA supabase ni src/lib                 │
├────────┬─────────────────────────────────────────────────────────────────┤
│        ▼                                                                 │
│ src/hooks/   useTasks · useComments · useProjectMembers · useProjects    │
│        │       (mutaciones de la entidad, sin lógica de carga propia)    │
│        ▼                                                                 │
│      useRealtimeCollection  ──usa──▶  reconcile.ts (funciones puras)     │
│        │   { data, loading, error }, búfer de eventos, AbortController,  │
│        │   scope actual, mutaciones en vuelo, refetch al reconectar      │
│        ▼                                                                 │
│      RepositoriesContext (interfaces de src/services/types.ts)           │
├────────┬─────────────────────────────────────────────────────────────────┤
│        ▼                                                                 │
│ src/services/   contratos · errores · validación                         │
│        ├── supabase/  repositorios reales + realtime.ts ──┐              │
│        └── demo/      repositorios en memoria (misma interfaz)           │
├───────────────────────────────────────────────────────────┼──────────────┤
│ src/lib/supabaseClient.ts  (createClient solo con URL y anon key)  ◀─────┘│
├──────────────────────────────────────────────────────────────────────────┤
│ Supabase: PostgREST + Realtime ── PostgreSQL 17 (RLS, triggers, grants)  │
└──────────────────────────────────────────────────────────────────────────┘
Dependencias solo hacia abajo. Solo src/services/ importa src/lib/.
```

## Entidad → tabla → hook → servicio

| Entidad | Tabla | Hook | Servicio (interfaz → implementaciones) | Realtime |
|---|---|---|---|---|
| `Profile` | `profiles` | (siguiente paso: `useProfiles`) | `ProfileRepository` → `createSupabaseProfileRepository`, demo | No |
| `Project` | `projects` | `useProjects()` | `ProjectRepository` → `createSupabaseProjectRepository`, demo | No (refetch) |
| `ProjectMember` | `project_members` | `useProjectMembers(projectId)` | `ProjectMemberRepository` → `createSupabaseMemberRepository`, demo | Sí, por `project_id` |
| `Task` | `tasks` | `useTasks(projectId)` | `TaskRepository` → `createSupabaseTaskRepository`, demo | Sí, por `project_id` |
| `Comment` | `comments` | `useComments(taskId)` | `CommentRepository` → `createSupabaseCommentRepository`, demo | Sí, por `task_id` |

Contrato de `useTasks(projectId: string | null)`:
`{ tasks, loading, error, createTask(fields), updateTask(id, patch), deleteTask(id), refetch }`.
`error` es el de carga o de tiempo real; los errores de una mutación se entregan como rechazo
de su promesa, para que el componente que la disparó decida cómo mostrarlo.

## Decisiones y porqué

### Tipos

- **Propiedades en snake_case.** Coinciden 1:1 con las columnas y con el payload de Realtime:
  no hay capa de mapeo que se desincronice.
- **`type` en vez de `interface`.** Un alias de objeto es asignable a
  `{ [key: string]: unknown }`, que exige el genérico de `RealtimePostgresChangesPayload`.
- **Uniones literales desde constantes** (`TASK_STATUSES`, `PROJECT_ROLES`) en vez de `enum`:
  `erasableSyntaxOnly` lo prohíbe y así se pueden recorrer en la UI.
- **`CreateTaskInput` y `UpdateTaskInput` sin `id`, `created_by`, `created_at` ni
  `updated_at`.** Además, el servicio copia solo las columnas permitidas
  (`TASK_INSERT_COLUMNS`), porque TypeScript no rechaza propiedades de más cuando el objeto
  viene en una variable. La tercera barrera es la base: sin grant sobre esas columnas.
  `UpdateTaskInput` tampoco lleva `project_id`: una tarea no cambia de proyecto.
- **`created_by` nullable.** Si se borra la cuenta del creador, la tarea y el proyecto se quedan
  (`on delete set null`).

### Esquema y seguridad

- **`is_project_member`, `is_project_owner`, `can_access_task` y `shares_project_with` son
  `security definer` con `search_path = ''`.** Una política de `project_members` que consultara
  `project_members` volvería a disparar su propia política (recursión infinita); la función lee
  la tabla con los permisos de su dueño. El `search_path` vacío impide que alguien secuestre
  nombres sin calificar. Se revoca `execute` a `anon` porque toda función de `public` es RPC.
- **`(select auth.uid())` en vez de `auth.uid()`** en las políticas: PostgreSQL lo evalúa una
  vez por consulta y no una vez por fila.
- **La política de select de `projects` incluye `created_by = auth.uid()`.** `.insert().select()`
  es un `INSERT ... RETURNING`, y la política de select se comprueba antes de que el trigger
  `after insert` cree la membresía de owner. Sin esa rama, crear un proyecto fallaría.
- **`created_by` y `author_id` tienen `default auth.uid()`, y la política exige
  `= auth.uid()`.** El default lo pone sin que el cliente lo mande; el `with check` es la
  defensa por si algún día se concede la columna por error.
- **Se revocan todos los privilegios a `anon` y `authenticated` y se conceden por columna.** RLS
  filtra filas, pero no quita privilegios: sin el `revoke`, un miembro podría hacer
  `update tasks set created_by = ...` y la política lo dejaría pasar porque sigue siendo miembro.
  `anon` no recibe nada: la app exige sesión.
- **FK compuesta `(project_id, assignee_id) → project_members` con `on delete set null
  (assignee_id)`.** Garantiza que el responsable sea miembro del mismo proyecto (una FK simple a
  `profiles` dejaría asignar a cualquiera) y, si sale del proyecto, la tarea queda sin
  responsable en vez de borrarse. La sintaxis de columnas en `set null` existe desde
  PostgreSQL 15.
- **Trigger `protect_last_owner`.** Evita proyectos huérfanos. Deja pasar los borrados en cascada
  (proyecto o cuenta borrados) mirando si la fila padre sigue visible. Esto conviene cubrirlo con
  una prueba SQL en el siguiente paso, porque depende de la visibilidad dentro de la cascada.
- **Comentarios sin `update`**: no hay grant ni política; borrar solo lo puede el autor.
- **Idempotencia**: `if not exists` en tablas e índices, `create or replace function`,
  `drop trigger/policy if exists` antes de crear, y alta condicional en la publicación. Lo que no
  se puede rehacer sin pérdida (cambiar columnas de tablas existentes) queda para migraciones
  nuevas.

### Realtime

- **`tasks`, `comments` y `project_members` en `supabase_realtime`, con `replica identity
  full`.** `project_members` se agregó además de lo pedido porque `useProjectMembers` compone el
  mismo núcleo en tiempo real.
- **Corrección a la premisa del enunciado.** `replica identity full` hace que el WAL lleve la fila
  vieja completa, pero según la documentación de Supabase, con RLS activo Realtime entrega en los
  DELETE solo la clave primaria, y los DELETE no se pueden filtrar por columna. Es decir: aun con
  `replica identity full`, el cliente no puede contar con `project_id` en un DELETE. Se dejó
  puesta (lo pide el enunciado y no estorba), pero el diseño no depende de ella: el núcleo aplica
  todo DELETE como «quitar la clave si está», que es inocuo si la fila es de otro proyecto. Por
  eso la clave de una membresía es la PK compuesta `project_id:user_id`.
- **Un canal por (tabla, scope) con sufijo aleatorio** y limpieza con `client.removeChannel`.
  En StrictMode React monta, desmonta y remonta; `removeChannel` es asíncrono y dos canales con
  el mismo topic chocarían. `removeChannel` (no solo `unsubscribe`) además saca el canal del
  cliente y cierra el socket cuando no quedan canales.
- **Suscripción antes de la carga, con búfer.** Los eventos que llegan mientras la consulta está
  en vuelo se guardan y se reaplican sobre la respuesta (el upsert es idempotente). Si no, un
  cambio ocurrido entre la consulta y su respuesta se perdería.
- **Refetch en cada `SUBSCRIBED` posterior a la carga**: tras una reconexión se pudieron perder
  eventos.

### Hooks

- **Núcleo `useRealtimeCollection` + hooks de entidad delgados.** La parte difícil (carrera entre
  carga y eventos, limpieza, respuestas tardías) se escribe y se prueba una vez; cada hook de
  entidad solo agrega sus mutaciones y su orden. `reconcile.ts` es puro para probarlo con Vitest
  sin montar componentes.
- **Respuestas tardías.** Las cargas se abortan (`AbortController` → `.abortSignal()` en
  PostgREST, `delay` con señal en demo) y, si llegan igual, se descartan por scope. Las
  mutaciones no se abortan, porque la escritura ya pudo aplicarse, pero su resultado solo toca el
  estado si `controls.isCurrentScope(scopeDeLaLlamada)` sigue siendo cierto.
- **Eco de mutaciones propias.** Se reconcilia todo por clave real (respuesta y eco convergen en
  una fila). Mientras una clave tiene una mutación propia en vuelo (`beginMutation`), el núcleo
  ignora sus INSERT/UPDATE para que un eco intermedio no pise el valor optimista. Hueco conocido:
  en un create optimista, si el eco llega antes que la respuesta HTTP, conviven un instante la
  fila temporal y la real; se cierra en el siguiente paso reteniendo los INSERT propios mientras
  haya creates en vuelo.
- **Optimismo con reversión (siguiente paso)**: guardar la fila previa con `getSnapshot()`,
  pintar el cambio, y al fallar restaurarla y hacer refetch. Los detalles por operación están en
  la cabecera de `useTasks.ts`.
- **`scopeId: string | null`.** `null` significa «nada seleccionado»: lista vacía, sin canal y sin
  consulta, en vez de pedir con un id vacío.
- **Repositorios por contexto, no importados.** Permite el modo demo y las pruebas con
  `createDemoRepositories({ latencyMs: 0 })` sin mocks de módulos. El objeto se crea una vez
  fuera del render porque es dependencia de los efectos.

### Modo demo

- **Misma interfaz y mismas reglas.** El demo imita la RLS (solo miembros), el trigger de owner,
  la cascada de comentarios y la forma de Realtime: eventos asíncronos, el eco de las mutaciones
  propias y DELETE con solo la PK entregado a todos los suscriptores. Así los hooks se prueban en
  demo con los mismos casos difíciles que tendrán en producción.
- **La UI lo rotula** con `DemoModeBadge` (vía `useDataMode()`), porque los datos se pierden al
  recargar y no deben confundirse con los reales.
- **Solo la anon key va en el cliente.** La seguridad la ponen RLS y los grants; la
  `service_role` nunca va en el frontend.

### Pendiente para el siguiente paso

- Optimismo con reversión en las tres entidades y cierre del hueco del eco antes de la respuesta.
- `useProfiles` con caché por id para mostrar nombres visibles.
- Tipos generados con `supabase gen types` para reemplazar las afirmaciones de `shared.ts`.
- Pruebas: `reconcile.ts` (puro), hooks sobre el demo (cambio de proyecto con respuesta tardía,
  desmontaje con canal abierto, eco duplicado) y pruebas SQL de RLS y de `protect_last_owner`.
