# Prompt 2 · Fetching, mutaciones optimistas, tiempo real y pruebas (instrucciones 2, 3 y 4)

**Objetivo del paso:** pasar del diseño a la lógica completa. El prompt parte de lo que midió la
verificación real de v1, no de lo que v1 decía de sí misma:

- [v1/verificacion.txt](v1/verificacion.txt): `tsc -b` en 0, pero `oxlint --deny-warnings` sale con
  código 1 por dos avisos (`react(set-state-in-effect)` en `useRealtimeCollection.ts:142` y
  `jsx-a11y(prefer-tag-over-role)` en `DemoModeBadge.tsx:11`). Sin pruebas todavía.
- [v1/supabase-local.txt](v1/supabase-local.txt): el esquema de v1 corrido en Supabase local (CLI
  2.122.0 con Realtime) con tres usuarios reales: 29 de 29. Hallazgo medido: los `DELETE` llegan
  con `old = {id}` aunque la tabla tenga `replica identity full`, y le llegan también a la usuaria
  que está fuera del proyecto, incluso en el canal con filtro `project_id=eq.<id>`.
- Hueco declarado por v1: en un create optimista, si el eco Realtime llega antes que la respuesta
  HTTP, la tarea se ve dos veces.

- Respuesta cruda: [v2/respuesta.md](v2/respuesta.md) · código: [v2/src/](v2/src/) ·
  verificación: [v2/verificacion.txt](v2/verificacion.txt) · diff: [v2/cambios-desde-v1.diff](v2/cambios-desde-v1.diff)

## Prompt literal

```text
Seguimos con TaskMaster AI. Tu diseño del paso anterior (tipos, migración SQL, servicios Supabase y
demo, núcleo useRealtimeCollection y firmas de useTasks/useComments/useProjectMembers) está en el
proyecto. Ahora implementa la lógica completa. Mismo stack y mismas reglas de TypeScript estricto.

Resultados REALES de verificar tu paso anterior:
- tsc -b: 0 errores.
- oxlint --deny-warnings: código 1 por dos avisos:
    src/hooks/useRealtimeCollection.ts:142:7 react(set-state-in-effect): Calling setState
      synchronously within an effect can trigger cascading renders
    src/components/DemoModeBadge.tsx:11:7 jsx-a11y(prefer-tag-over-role): Prefer `output` over
      `role` attribute `status`
- Tu migración, aplicada con la CLI de Supabase en local (con Realtime) y probada con tres usuarios
  reales (owner, miembro y una usuaria fuera del proyecto): 29 de 29 pruebas de RLS, privilegios por
  columna, triggers y Realtime pasan. Medido: los DELETE llegan con old = {"id": ...} (solo la
  clave primaria, aunque la tabla tiene replica identity full) y llegan TAMBIÉN a la usuaria que no
  es miembro, incluso en su canal con filter 'project_id=eq.<id>'. INSERT y UPDATE sí se filtran y
  respetan RLS. Mantén la regla "un DELETE quita la clave si está" y no confíes en old.project_id.
- Hueco que tú mismo dejaste: en createTask optimista, si el eco INSERT llega antes que la
  respuesta HTTP, la tarea aparece dos veces. Ciérralo. Decide y justifica una de dos: retener los
  INSERT propios mientras haya creates en vuelo, o generar el id en el cliente con
  crypto.randomUUID() (lo que obliga a conceder insert (id) en la migración y validar el formato).

Entrega:

1. useTasks(projectId): lectura filtrada por proyecto; createTask, updateTask y deleteTask con
   actualización optimista y reversión exacta al valor previo si el servidor falla (y el error de
   la mutación visible para el componente); loading, error y tasks independientes; Realtime
   postgres_changes filtrado por project_id=eq.<id> que reconcilia INSERT/UPDATE/DELETE de otros
   usuarios sin duplicar los ecos de las mutaciones propias; removeChannel en la limpieza; ninguna
   respuesta tardía (de carga o de mutación) toca el estado después de cambiar de proyecto o de
   desmontar.
2. useComments(taskId) con el mismo patrón (crear optimista con reversión, borrar), y
   useProjectMembers(projectId) + useProfiles(ids) (nombres visibles con caché por id), todos sobre
   el mismo núcleo: la lógica común se reutiliza, no se copia.
3. useSession(): sesión de Supabase Auth (getSession + onAuthStateChange con limpieza del
   listener), signIn con email y contraseña y signOut. En modo demo devuelve un usuario simulado.
4. Corrige los dos avisos de oxlint sin desactivar reglas. Agrega a .oxlintrc.json una regla
   no-restricted-imports que haga fallar el lint si src/components/** o src/App.tsx importan
   @supabase/supabase-js, src/lib o src/services: la UI solo habla con hooks (si App.tsx hoy llama
   createRepositories(), mueve esa composición a un proveedor dentro de src/hooks/).
5. Ejemplo de implementación en componente: un TaskBoard que use useTasks (formulario para crear con
   validación, cambio de estado, borrar, estados de carga, error con "Reintentar" y lista vacía),
   un panel de comentarios de la tarea seleccionada y la lista de miembros. En modo
   Supabase, una pantalla de inicio de sesión si no hay sesión. Accesible (labels, aria-live para
   los cambios que llegan en tiempo real, foco visible) y usable en móvil (360 px).
6. Modo demo rotulado en pantalla, con controles solo del modo demo para poder demostrar los estados:
   ?demo=lento (carga lenta), ?demo=error (la carga falla) y un botón "Simular cambio de otro
   usuario" que inserta, actualiza o borra una tarea por el mismo camino que un evento Realtime
   remoto.
7. Pruebas con Vitest 5 + @testing-library/react 16 (renderHook, happy-dom) en src/**/*.test.ts(x):
   - reconcile (funciones puras);
   - useTasks: carga inicial, error de carga, create/update/delete optimistas y su reversión cuando
     el servidor falla, INSERT/UPDATE/DELETE remotos, DELETE con solo la clave, eco propio sin
     duplicar (incluido el eco que llega ANTES que la respuesta HTTP), respuesta tardía descartada
     al cambiar de proyecto, y ningún setState después de desmontar;
   - la suscripción del servicio de Supabase con un cliente falso: channel(...).on('postgres_changes',
     { filter: 'project_id=eq.<id>' }).subscribe() y removeChannel llamado al desmontar y al cambiar
     de proyecto (uno por canal abierto, sin fugas);
   - useComments: crear optimista y reversión.
   No uses temporizadores reales largos: latencia 0 o vi.useFakeTimers.

Archivos completos, no fragmentos. Si cambias la migración, entrégala completa con el mismo nombre.
Al final, en la respuesta, una tabla requisito → archivo y lo que NO pudiste resolver.
```
