-- TaskMaster AI · esquema inicial (PostgreSQL 17 de Supabase)
--
-- Tablas: profiles, projects, project_members, tasks, comments.
-- Reglas que garantiza la base (no el cliente):
--   * profiles se llena con un trigger sobre auth.users.
--   * Quien crea un proyecto queda como 'owner' (trigger).
--   * created_by y author_id salen de auth.uid() (default) y la política lo comprueba (with check).
--   * updated_at lo pone un trigger.
--   * RLS en todas las tablas: solo se ve y se toca lo de proyectos de los que se es miembro.
--   * Privilegios mínimos: se revoca lo que Supabase concede por defecto y se concede por columna.
--   * Realtime para tasks, comments y project_members, con replica identity full.
-- Idempotente donde se puede: create ... if not exists, create or replace function,
-- drop ... if exists antes de cada trigger y política, alta condicional en la publicación.

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Tablas
-- ════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  created_at   timestamptz not null default now()
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  -- Lo pone la base. Nullable: si se borra la cuenta del creador el proyecto sobrevive.
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  status      text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  assignee_id uuid,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- El responsable tiene que ser miembro DEL MISMO proyecto. Si deja el proyecto, la tarea
  -- queda sin responsable (set null solo sobre assignee_id; PostgreSQL 15+).
  constraint tasks_assignee_is_member
    foreign key (project_id, assignee_id)
    references public.project_members (project_id, user_id)
    on delete set null (assignee_id)
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Índices (las consultas de los hooks filtran por project_id y task_id y ordenan por fecha)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- project_members: la PK (project_id, user_id) cubre "miembros de un proyecto" e
-- is_project_member. Falta el acceso por usuario ("mis proyectos", borrado de cuenta).
create index if not exists project_members_user_id_idx on public.project_members (user_id);

create index if not exists tasks_project_id_created_at_idx on public.tasks (project_id, created_at);
-- Para la FK compuesta (borrar una membresía busca sus tareas asignadas).
create index if not exists tasks_project_id_assignee_id_idx
  on public.tasks (project_id, assignee_id) where assignee_id is not null;
create index if not exists tasks_created_by_idx on public.tasks (created_by);

create index if not exists comments_task_id_created_at_idx on public.comments (task_id, created_at);
create index if not exists comments_author_id_idx on public.comments (author_id);

create index if not exists projects_created_by_idx on public.projects (created_by);

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Funciones de apoyo para RLS (security definer: leen project_members sin pasar por su
--    propia política, que es lo que evita la recursión infinita de políticas)
-- ════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members m
    where m.project_id = p_project_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members m
    where m.project_id = p_project_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- Acceso a una tarea = ser miembro de su proyecto. Evita repetir el join en cada política de
-- comments y no depende de la política de tasks.
create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks t
    join public.project_members m on m.project_id = t.project_id
    where t.id = p_task_id
      and m.user_id = (select auth.uid())
  );
$$;

-- Perfiles visibles: el propio y los de quienes comparten al menos un proyecto conmigo.
create or replace function public.shares_project_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

-- Las funciones de public quedan expuestas como RPC: nadie anónimo las ejecuta.
revoke all on function public.is_project_member(uuid)   from public, anon;
revoke all on function public.is_project_owner(uuid)    from public, anon;
revoke all on function public.can_access_task(uuid)     from public, anon;
revoke all on function public.shares_project_with(uuid) from public, anon;
grant execute on function public.is_project_member(uuid)   to authenticated;
grant execute on function public.is_project_owner(uuid)    to authenticated;
grant execute on function public.can_access_task(uuid)     to authenticated;
grant execute on function public.shares_project_with(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Triggers
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- 4.1 Perfil por cada usuario nuevo de auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Usuario'
      ),
      80
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuarios que ya existían antes del trigger (si no, sus FK a profiles fallarían).
insert into public.profiles (id, display_name)
select
  u.id,
  left(coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Usuario'), 80)
from auth.users u
on conflict (id) do nothing;

-- 4.2 El creador de un proyecto queda como owner.
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (project_id, user_id) do update set role = 'owner';
  end if;
  return new;
end;
$$;

revoke all on function public.handle_new_project() from public, anon, authenticated;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- 4.3 Un proyecto no puede quedarse sin owner. Se permite cuando el borrado viene en cascada
--     (se borró el proyecto o la cuenta): en ese caso la fila padre ya no es visible.
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' then
    return old;
  end if;
  if not exists (select 1 from public.projects p where p.id = old.project_id)
     or not exists (select 1 from public.profiles pr where pr.id = old.user_id) then
    return old;
  end if;
  if not exists (
    select 1
    from public.project_members m
    where m.project_id = old.project_id
      and m.role = 'owner'
      and m.user_id <> old.user_id
  ) then
    raise exception 'Un proyecto no puede quedarse sin owner'
      using errcode = '23514';
  end if;
  return old;
end;
$$;

revoke all on function public.protect_last_owner() from public, anon, authenticated;

drop trigger if exists project_members_protect_last_owner on public.project_members;
create trigger project_members_protect_last_owner
  before delete on public.project_members
  for each row execute function public.protect_last_owner();

-- 4.4 updated_at de tasks lo pone la base.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Privilegios: Supabase concede todo a anon y authenticated en cada tabla nueva, y RLS no
--    quita privilegios, solo filtra filas. Se revoca todo y se concede lo justo, por columna.
-- ════════════════════════════════════════════════════════════════════════════════════════════

revoke all on table
  public.profiles, public.projects, public.project_members, public.tasks, public.comments
  from anon, authenticated;

-- profiles: leer y cambiar el nombre visible propio. Las filas las crea el trigger.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- projects: id, created_by y created_at no se escriben desde el cliente.
grant select, delete on public.projects to authenticated;
grant insert (name, description) on public.projects to authenticated;
grant update (name, description) on public.projects to authenticated;

-- project_members: sin update (el cambio de rol no está en esta versión).
grant select, delete on public.project_members to authenticated;
grant insert (project_id, user_id, role) on public.project_members to authenticated;

-- tasks: project_id solo al crear (no se mueve una tarea de proyecto).
grant select, delete on public.tasks to authenticated;
grant insert (project_id, title, description, status, assignee_id) on public.tasks to authenticated;
grant update (title, description, status, assignee_id) on public.tasks to authenticated;

-- comments: no se editan.
grant select, delete on public.comments to authenticated;
grant insert (task_id, body) on public.comments to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Row Level Security
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks           enable row level security;
alter table public.comments        enable row level security;

-- 6.1 profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_project_with(id));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 6.2 projects
-- `created_by = auth.uid()` en select no es un descuido: INSERT ... RETURNING (lo que hace
-- .insert().select()) evalúa la política de select ANTES de que el trigger after insert cree
-- la membresía; sin esa rama, crear un proyecto fallaría con "violates row-level security".
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (created_by = (select auth.uid()) or public.is_project_member(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_project_owner(id))
  with check (public.is_project_owner(id));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_project_owner(id));

-- 6.3 project_members (las políticas usan funciones security definer: sin recursión)
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists project_members_insert on public.project_members;
create policy project_members_insert on public.project_members
  for insert to authenticated
  with check (public.is_project_owner(project_id));

drop policy if exists project_members_delete on public.project_members;
create policy project_members_delete on public.project_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_project_owner(project_id));

-- 6.4 tasks
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_project_member(project_id)
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.is_project_member(project_id));

-- 6.5 comments
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (public.can_access_task(task_id));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_access_task(task_id)
  );

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    and public.can_access_task(task_id)
  );

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 7. Realtime
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- replica identity full: sin ella el WAL de un DELETE (y el "old" de un UPDATE) solo lleva la
-- clave primaria. Ojo: según la documentación de Supabase, con RLS activo Realtime igual
-- entrega en DELETE solo la clave primaria, y los DELETE no se filtran por columna. Por eso
-- el cliente aplica los DELETE como "quitar si está" y no depende de recibir project_id.
alter table public.tasks           replica identity full;
alter table public.comments        replica identity full;
alter table public.project_members replica identity full;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No existe la publicación supabase_realtime; se omite el alta de Realtime';
    return;
  end if;
  foreach t in array array['tasks', 'comments', 'project_members'] loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
