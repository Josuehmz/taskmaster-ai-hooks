# Respuesta al prompt 3 · auditoría con la evidencia de v2

> Escrita en la sesión principal (ver nota de v2) y guardada antes de verificar. El resultado real
> está en [verificacion.txt](verificacion.txt).

## Causa de cada hallazgo

- **oxlint revisaba `bitacora/v2/src`.** No era el `ignorePatterns`: la copia de la configuración
  guardada en `bitacora/v2/.oxlintrc.json` es, para oxlint, una **configuración anidada** que se
  aplica a esa carpeta, y desde ahí `"bitacora/**"` ya no coincide. La copia de cada versión se
  guarda ahora como `bitacora/vN/oxlintrc.json` (sin punto) y el script de verificación la copia a la
  raíz. Con eso, `oxlint` sobre el repositorio da 0 archivos de `bitacora/`.
- **`prefer-tag-over-role`:** los mensajes de estado pasan de `<p role="status">` a `<output>`, que
  tiene ese rol implícito.
- **`no-restricted-imports` en la prueba del componente:** el montaje con repositorios demo se movió
  a `src/test/renderWithDemo.tsx`. La regla sigue intacta para `src/components/**` y `App.tsx`.
- **"Found multiple elements":** sin `globals: true`, Testing Library no registra su `cleanup`. Se
  agrega `src/test/setup.ts` (`afterEach(cleanup)`) en `test.setupFiles`.
- **"expected undefined to be 'sin red'":** la prueba era la que estaba mal; el rechazo se programa
  justo antes de la carga que debe fallar.
- **`CHANNEL_ERROR` mostrado como error de carga:** el núcleo separa `realtime`
  (`off | connecting | live | offline`) de `error`. Un fallo del canal ya no oculta ni invalida los
  datos; el tablero muestra un distintivo "En vivo" / "desconectado: reintentando".
- **Evento perdido tras reiniciar la base:** Realtime no reenvía lo perdido. El núcleo recarga en
  cada `SUBSCRIBED` posterior a la carga (reconexión) y, como red de seguridad, al volver a la
  pestaña (`visibilitychange`) o a la red (`online`). Los listeners se quitan en la limpieza.
- **Proyectos sin recargar tras iniciar sesión:** `useProjects` y todo lo que depende del usuario
  viven en `<ProjectsArea key={user.id}>`, que solo se monta con sesión.

## Hallazgo → cambio → prueba

| Hallazgo (v2) | Cambio (v3) | Prueba que lo cubre |
|---|---|---|
| Lint revisa `bitacora/` | `oxlintrc.json` sin punto en cada versión | `verificacion.txt` (lint sin rutas de `bitacora/`) |
| 6 × `prefer-tag-over-role` | `<output>` | lint en 0 |
| `no-restricted-imports` en `TaskBoard.test.tsx` | `src/test/renderWithDemo.tsx` | lint en 0 |
| DOM sin limpiar entre pruebas | `src/test/setup.ts` + `setupFiles` | `TaskBoard.test.tsx` (3) |
| Rechazo consumido por otra carga | prueba corregida | `useTasks.test.tsx` › error de carga |
| `CHANNEL_ERROR` como error de carga | `realtime` separado de `error` | `useTasks.test.tsx` › CHANNEL_ERROR |
| Evento perdido | recarga en reconexión y al volver a la pestaña | `useTasks.test.tsx` › reconectar / volver a la pestaña |
| Cambio ajeno durante edición propia fallida | (ya en v2, sin prueba) | `useTasks.test.tsx` › cambio ajeno no se pierde |
| Proyectos sin recargar tras login | `ProjectsArea key={user.id}` | `Workspace.test.tsx` (2) |

## Lo que sigue sin resolverse

- Dos ediciones simultáneas de la misma tarea: gana la última que acepta la base. No hay fusión
  por campo ni aviso de conflicto.
- `useProfiles` no se entera en tiempo real de un cambio de nombre.
