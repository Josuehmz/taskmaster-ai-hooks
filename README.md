# TaskMaster AI · capa de datos con custom hooks (Supabase + React)

Proyecto Integrador, módulo 4 «Persistencia y Lógica». Documento único:
[DOCUMENTO-TECNICO.md](DOCUMENTO-TECNICO.md) / [DOCUMENTO-TECNICO.pdf](DOCUMENTO-TECNICO.pdf).
Hecho el 2026-11-10. Stack: Vite 8, React 19, TypeScript 7 estricto, Tailwind 4,
`@supabase/supabase-js` 2.119, Vitest 5 + Testing Library 16, oxlint, pnpm.

## Qué es real y qué es simulado

| Parte | Estado |
|---|---|
| Hooks, componentes, 38 pruebas, `tsc`, lint y build | **Ejecutado** ([verificacion-final.txt](docs/evidencia/verificacion-final.txt)) |
| Esquema, RLS y Realtime | **Ejecutado en Supabase local** (CLI 2.122.0 + Docker), tres usuarios reales: 32 de 32 ([supabase-local.txt](docs/evidencia/supabase-local.txt)) |
| App contra Supabase en el navegador | **Ejecutado contra el Supabase local** (build de producción; capturas 05 y 06) |
| Proyecto de Supabase en la nube | **No ejecutado**: no hay credenciales. Solo [.env.example](.env.example) |
| Modo demo | **Simulado**: datos en memoria, rotulado «MODO DEMO · datos simulados». Se activa cuando faltan las variables |

## Entregable → archivo

| Entregable del enunciado | Archivo |
|---|---|
| 1) Custom hook principal con fetching, mutación y suscripción | [src/hooks/useTasks.ts](src/hooks/useTasks.ts), sobre el núcleo [src/hooks/useRealtimeCollection.ts](src/hooks/useRealtimeCollection.ts) |
| Hooks del resto de entidades (mismo patrón, lógica reutilizada) | [useComments.ts](src/hooks/useComments.ts), [useProjectMembers.ts](src/hooks/useProjectMembers.ts), [useProfiles.ts](src/hooks/useProfiles.ts), [useSession.ts](src/hooks/useSession.ts), [useProjects.ts](src/hooks/useProjects.ts) |
| 2) Ejemplo de implementación en componente | [src/components/TaskBoard.tsx](src/components/TaskBoard.tsx) (y su prueba [TaskBoard.test.tsx](src/components/TaskBoard.test.tsx)) |
| 3) Memoria técnica, ~300 palabras (301; `py -3.12 herramientas/contar-palabras.py`) | [docs/memoria-tecnica.md](docs/memoria-tecnica.md) |
| Diseño de abstracción (instrucción 1) | [docs/01-arquitectura-y-hooks.md](docs/01-arquitectura-y-hooks.md) |
| Esquema SQL con RLS y Realtime | [supabase/migrations/20261110000000_esquema_taskmaster.sql](supabase/migrations/20261110000000_esquema_taskmaster.sql), [docs/02-esquema-y-rls.md](docs/02-esquema-y-rls.md) |
| Auditoría IA (4 ejes del diagrama del módulo) | [docs/03-auditoria-ia.md](docs/03-auditoria-ia.md) |
| Bitácora de prompts (5 prompts, respuestas, diffs y verificaciones reales) | [bitacora/README.md](bitacora/README.md) |
| Capturas de escritorio y móvil | [docs/capturas/](docs/capturas/) |

## Criterio de la rúbrica → dónde se demuestra

| Criterio | Evidencia |
|---|---|
| **Abstracción y modularidad**: hooks separados de la UI, reutilizables, con `loading`, `error` y `data` independientes | Capas y tabla de entidades en [docs/01 § 1.1–1.3](docs/01-arquitectura-y-hooks.md#11-entidades). La UI no puede importar Supabase: regla `no-restricted-imports` en [.oxlintrc.json](.oxlintrc.json), probada en negativo en [verificacion-final.txt](docs/evidencia/verificacion-final.txt) («Regla de capas en negativo»: 3 errores). Un núcleo compuesto por 5 hooks |
| **Ejecución técnica**: cliente correcto, `useEffect` para la suscripción, mutaciones optimistas o refresco coherente | Cliente: [src/lib/supabaseClient.ts](src/lib/supabaseClient.ts). Suscripción: [realtime.ts](src/services/supabase/realtime.ts) y el `useEffect` del núcleo. Optimismo y reversión: pruebas «createTask/updateTask/deleteTask… revierte» en [pruebas-detalle.txt](docs/evidencia/pruebas-detalle.txt), y en el navegador en la captura [04](docs/capturas/04-escritorio-reversion.png). Tiempo real con dos usuarios reales: capturas [05](docs/capturas/05-escritorio-tiempo-real-supabase-local.png) y [06](docs/capturas/06-movil-tiempo-real-supabase-local.png) |
| **Manejo del ciclo de vida**: limpiar suscripciones y canales | `removeChannel` en la limpieza: [realtime.ts](src/services/supabase/realtime.ts). Pruebas: «un canal por proyecto; removeChannel al cambiar de proyecto y al desmontar», «en StrictMode no quedan canales huérfanos», «al desmontar aborta la carga, cierra el canal y no hay setState después» ([pruebas-detalle.txt](docs/evidencia/pruebas-detalle.txt)). Supabase local, prueba 32: el cliente queda sin canales |
| Seguridad: las consultas respetan la RLS | [docs/02 § 2.2–2.4](docs/02-esquema-y-rls.md#22-rls-por-pertenencia-al-proyecto): 32 de 32 con una usuaria fuera del proyecto que no ve filas ni eventos de INSERT/UPDATE; privilegios leídos de la base en [rls-politicas.txt](docs/evidencia/rls-politicas.txt) |
| Auditoría IA: análisis de código, prompts, bundle, RLS | [docs/03 § 3.1–3.4](docs/03-auditoria-ia.md#31-análisis-de-código) |

## Cómo ejecutar

```bash
pnpm install --frozen-lockfile
pnpm dev                 # sin .env: modo demo. Probar ?demo=lento, ?demo=error, ?demo=falla-guardar
pnpm typecheck && pnpm lint && pnpm test && pnpm build
bash herramientas/verificacion-final.sh      # todo lo anterior + regla de capas en negativo → docs/evidencia/
```

Con Supabase: copiar `.env.example` como `.env` con la URL y la anon key de un proyecto, y aplicar
la migración. Para repetir la prueba local se necesitan Docker y la CLI de Supabase:
`supabase start -x studio,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta`
(Realtime **no** se excluye) y después `bash herramientas/probar-supabase-local.sh`.

## Árbol

```
src/
  hooks/        useTasks ← hook principal · useRealtimeCollection ← núcleo común · reconcile ← funciones puras
                useComments · useProjectMembers · useProfiles · useProjects · useSession · RepositoriesContext
  services/     index ← createRepositories() con import() dinámico · types ← interfaces
    supabase/   repositorios reales · realtime ← canal + removeChannel · fakeSupabase ← doble de pruebas
    demo/       repositorios en memoria («modo demo»)
  lib/          supabaseClient ← único createClient
  components/   TaskBoard ← ejemplo del enunciado · TaskForm · TaskItem · CommentsPanel · MembersList · Workspace · LoginScreen
  test/         setup (cleanup) · helpers (repositorio falso) · renderWithDemo
supabase/migrations/   esquema, RLS, privilegios por columna, publicación Realtime
docs/          01 arquitectura · 02 esquema y RLS · 03 auditoría IA · memoria técnica · evidencia/ · capturas/
bitacora/      prompts 01–05, v1–v5 (respuesta, código, verificación, diff), ajuste tras capturas
herramientas/  verificar-version · verificacion-final · probar-supabase-local · medir-bundle · generar_documento · cli
```
