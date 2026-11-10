# Respuesta al prompt 2 · lógica completa de los hooks

> Origen: el límite de subagentes de la sesión se agotó con el prompt 1, así que esta respuesta
> se escribió en la sesión principal (mismo modelo) a partir del prompt 2 literal. Se guardó
> **antes** de correr `tsc`, lint, pruebas o build: lo que falle está en
> [verificacion.txt](verificacion.txt) y se corrige en el prompt 3, no aquí.

## Decisiones

1. **El eco que gana la carrera (hueco de v1): id generado en el cliente.** `createTask` genera el
   id con `crypto.randomUUID()` y lo manda en el insert. La fila optimista ya tiene la clave
   definitiva, así que el eco Realtime y la respuesta HTTP caen sobre la misma fila sin importar el
   orden. Se descartó "retener los INSERT propios" porque obliga a adivinar qué INSERT es propio
   (por `created_by` y título) y falla con dos pestañas del mismo usuario. Costo: la migración
   concede `insert (id, …)` en `tasks` y `comments`; el tipo `uuid` valida el formato y la PK
   rechaza un id repetido (23505). No hay escalada: el id no da acceso a nada.
2. **Mutaciones con reversión en el núcleo, no en cada hook.** `useRealtimeCollection` expone
   `mutateUpsert(fila, request)` y `mutateRemove(clave, request)`. La fila previa se guarda dentro
   del mismo `setState` del cambio optimista; si `request` falla se restaura exactamente (o se quita
   la fila nueva), el error queda en `mutationError` y la promesa se rechaza. `useTasks`,
   `useComments` y `useProjectMembers` solo dicen qué fila pintar y qué llamar.
3. **Eventos de una clave con mutación propia en vuelo: diferidos.** No se aplican mientras la
   mutación viaja (el eco no pisa lo optimista) y al terminar se aplica el último con control de
   versión (`updated_at` en tareas): el eco no cambia nada; un cambio ajeno más nuevo gana. Un
   DELETE ajeno durante una edición propia también se difiere y se aplica al final (si no, la
   reversión resucitaría una fila borrada).
4. **Ecos sin render ni aviso.** `upsertRow` devuelve el mismo arreglo si la fila llega igual
   (`sameRow` compara por columnas porque el payload de Realtime trae otro orden de claves que la
   respuesta HTTP). Así `lastRemoteChange` solo cambia con cambios reales de otros usuarios, y la UI
   lo anuncia en una región `aria-live`.
5. **`set-state-in-effect`:** el estado guarda a qué scope pertenece y el vacío "cargando" de un
   scope nuevo se calcula en el render; el efecto ya no hace `setState` síncrono.
6. **Respuestas tardías:** la limpieza pone `scopeRef = null`, aborta la carga y cierra el canal;
   toda escritura de estado comprueba el scope. Un A→B→A rápido descarta la respuesta del primer A.
7. **Composición sin `services` en la UI:** `RepositoriesProvider` (en `src/hooks/`) crea los
   repositorios si no recibe `value`; `App.tsx` ya no importa `src/services`. La regla
   `no-restricted-imports` cubre `src/components/**` y `src/App.tsx` (supabase-js, lib, services) y
   `src/hooks/**` (supabase-js, lib).
8. **useSession:** `getSession` + `onAuthStateChange`, limpieza del listener y bandera `active`.
9. **Modo demo:** `?demo=lento`, `?demo=error`, `?demo=falla-guardar` y "Simular cambio de otro
   usuario", que escribe directo en la tabla en memoria: el cambio solo llega por el canal.

## Requisito → archivo

| Requisito | Archivo |
|---|---|
| useTasks (lectura, CRUD optimista, Realtime, limpieza) | `src/hooks/useTasks.ts` sobre `src/hooks/useRealtimeCollection.ts` |
| Reconciliación pura | `src/hooks/reconcile.ts` |
| useComments, useProjectMembers, useProfiles | `src/hooks/useComments.ts`, `useProjectMembers.ts`, `useProfiles.ts` |
| useSession | `src/hooks/useSession.ts`, `src/services/supabase/authRepository.ts` |
| Regla de lint de capas | `.oxlintrc.json` |
| Ejemplo de componente | `src/components/TaskBoard.tsx` (+ `TaskForm`, `TaskItem`, `CommentsPanel`, `MembersList`) |
| Inicio de sesión | `src/components/LoginScreen.tsx`, `Workspace.tsx` |
| Modo demo y controles | `src/services/demo/index.ts`, `src/services/index.ts`, `src/components/DemoControlsPanel.tsx` |
| `insert (id)` | `supabase/migrations/20261110000000_esquema_taskmaster.sql` |
| Pruebas | `src/hooks/*.test.ts(x)`, `src/services/supabase/*.test.ts(x)`, `src/components/TaskBoard.test.tsx` |

## Lo que no resolví

- `useProfiles` no se entera en tiempo real de un cambio de nombre (profiles no está en la
  publicación).
- No probé estos hooks contra el Supabase local en el navegador; solo el esquema (en el paso 1).
