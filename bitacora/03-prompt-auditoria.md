# Prompt 3 · Auditoría y corrección con la evidencia real de v2

**Objetivo del paso:** cerrar todo lo que la verificación de v2 encontró. El prompt cita las salidas
reales, no lo que v2 decía de sí misma:

- [v2/verificacion.txt](v2/verificacion.txt): `tsc -b` en 0; **lint con 1 error y 6 avisos** (y
  además oxlint revisó `bitacora/v2/src`, que debía ignorar); **26 de 29 pruebas** (3 fallan);
  build de 473,78 kB (134,03 kB gzip).
- [v2/supabase-local.txt](v2/supabase-local.txt): 32 de 32 con la migración de v2 (incluye el `id`
  generado en el cliente). Los dos intentos anteriores, justo después de `supabase db reset`, se
  guardaron: [intento 1](v2/supabase-local-intento-1-realtime-reiniciando.txt) (canales en
  `CHANNEL_ERROR: transport failure`) e [intento 2](v2/supabase-local-intento-2-primer-evento-perdido.txt)
  (se perdió el primer INSERT).
- [v2/navegador-supabase-local.txt](v2/navegador-supabase-local.txt): en el navegador, contra el
  Supabase local, el INSERT y el UPDATE de otro usuario llegan y se anuncian; el create propio sale
  una sola vez y no se anuncia.
- Revisión del flujo de inicio de sesión (leyendo el código): `Workspace` llama a `useProjects()`
  antes de que haya sesión; tras iniciar sesión la lista no se recarga.

- Respuesta: [v3/respuesta.md](v3/respuesta.md) · código: [v3/src/](v3/src/) ·
  verificación: [v3/verificacion.txt](v3/verificacion.txt) · diff: [v3/cambios-desde-v2.diff](v3/cambios-desde-v2.diff)

## Prompt literal

```text
Auditoría de TaskMaster AI sobre tu paso 2. Corrige todo lo de abajo con archivos completos y sin
desactivar reglas ni borrar pruebas. Resultados REALES:

1. oxlint --deny-warnings (código 1):
   - error eslint(no-restricted-imports) en src/components/TaskBoard.test.tsx:5: '../services'
     import is restricted. La prueba del componente arma los repositorios demo importando
     src/services, y tu propia regla lo prohíbe. Resuélvelo sin aflojar la regla para el código de
     la UI (por ejemplo, un helper de pruebas fuera de src/components).
   - 6 avisos jsx-a11y(prefer-tag-over-role): "Prefer `output` over `role` attribute `status`" en
     CommentsPanel.tsx:32, TaskBoard.tsx:86, Workspace.tsx:41 y :68, MembersList.tsx:18.
   - oxlint también revisó bitacora/v2/src/** aunque ignorePatterns tiene "bitacora/**": con
     overrides en el archivo, el patrón no se respetó. Haz que el lint solo mire el proyecto.
2. Vitest: 26 de 29. Fallan:
   - TaskBoard.test.tsx "valida el título vacío y crea una tarea" y "anuncia el cambio de otro
     usuario…": TestingLibraryElementError: Found multiple elements with the role "button" and
     name "Crear" / with the text "Encapsular Supabase en hooks". El DOM de una prueba sigue en la
     siguiente: sin globals de Vitest, Testing Library no limpia sola.
   - useTasks.test.tsx "expone el error de carga y se recupera con refetch": expected undefined to
     be 'sin red'. El mockRejectedValueOnce lo consumió la carga del proyecto B y no la de A.
3. Supabase local (CLI con Realtime), justo después de `supabase db reset`: el primer intento dio
   CHANNEL_ERROR: transport failure en los tres canales y el segundo perdió el primer INSERT (los
   siguientes llegaron). Hoy useRealtimeCollection mete CHANNEL_ERROR en `error`, y el TaskBoard lo
   muestra como "No se pudieron cargar las tareas", que es falso: los datos sí cargaron. Separa el
   estado del canal (conectando / en vivo / desconectado) del error de carga, muéstralo en la UI y
   asegúrate de que, cuando el canal vuelve a SUBSCRIBED, se recargue la lista para no quedarse con
   el evento perdido. Agrega pruebas de eso.
4. Inicio de sesión: Workspace llama a useProjects() antes de saber si hay sesión. En modo Supabase,
   anon no tiene privilegio de select (lo revoca la migración), así que la primera carga falla y,
   después de signIn desde la pantalla de login, nada vuelve a cargar los proyectos. Corrígelo para
   que todo lo que depende del usuario se monte (o recargue) cuando cambia la sesión, y pruébalo con
   un AuthRepository falso que empieza sin sesión.
5. Refinamiento: el hook principal useTasks debe seguir leyéndose solo, porque va completo en el
   documento técnico; y la memoria técnica explicará la consistencia en tiempo real, así que los
   comentarios del núcleo deben decir con precisión qué garantiza y qué no.

Al final, una tabla hallazgo → cambio → prueba que lo cubre.
```
