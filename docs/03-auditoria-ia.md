# 3. Auditoría IA: los cuatro ejes del módulo

El diagrama «AUDITORÍA IA» del módulo 4 tiene cuatro ejes: Análisis de código, Optimización de
prompts, Tamaño de bundle y Verificación RLS. Cada uno tiene aquí su evidencia en un archivo de
texto del repositorio.

## 3.1 Análisis de código

| Herramienta | Resultado final | Archivo |
|---|---|---|
| `tsc -b --noEmit` (TS 7 estricto: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`) | 0 errores | [verificacion-final.txt](evidencia/verificacion-final.txt) |
| `oxlint --deny-warnings` (plugins react, typescript, oxc, jsx-a11y; `react/exhaustive-deps: error`) | 0 errores, 0 avisos | ídem |
| Regla de capas `no-restricted-imports`, probada en negativo | 3 errores esperados en un componente que importa Supabase, lib y services | ídem, «Regla de capas en negativo» |
| Vitest 5 + Testing Library 16 | 38 de 38 | [pruebas-detalle.txt](evidencia/pruebas-detalle.txt) |

Qué encontró el análisis en cada versión (fallos reales, no reconstruidos):

| Versión | tsc | lint | pruebas | Hallazgo que pasó al siguiente prompt |
|---|---|---|---|---|
| v1 | 0 | 2 avisos (código 1) | — | `set-state-in-effect` en el núcleo; `prefer-tag-over-role` |
| v2 | 0 | 1 error, 6 avisos | 26/29 | Una prueba de UI rompe la regla de capas; Testing Library no limpia el DOM; una prueba mal armada; el lint revisaba `bitacora/` (configuración anidada) |
| v3 | 0 | 0 | 34/35 | Una reconexión con una carga en vuelo pierde el cambio |
| v4 | 0 | 0 | 36/36 | (bundle: un solo chunk de 474 kB) |
| v5 | 0 | 0 | 37/37 | — |
| final | 0 | 0 | 38/38 | Ajuste tras las capturas: estados del modo demo, aviso en móvil, «Usuario» mientras carga |

## 3.2 Optimización de prompts

Cinco prompts. Cada uno cita la salida **real** de la verificación anterior (errores literales de
tsc, oxlint, Vitest y Supabase local), no lo que la versión anterior decía de sí misma. Detalle y
diffs en la [bitácora](../bitacora/README.md).

| Prompt | Qué se optimizó respecto del anterior |
|---|---|
| 1 · diseño | Stack con versiones exactas y reglas de TS estricto. Restricciones que en labs anteriores se olvidaron: revocar privilegios, `created_by` puesto por la base, `replica identity full`. Separa diseño de lógica. |
| 2 · lógica | Pega los avisos de lint de v1 y el resultado de Supabase local (29/29 y el hallazgo de los DELETE). Exige decidir entre dos soluciones al eco y justificar. Pide las pruebas caso por caso. |
| 3 · auditoría | Pega los 3 fallos de Vitest y el error de lint con su ruta. Agrega dos hallazgos que ninguna herramienta vio: `CHANNEL_ERROR` mostrado como error de carga y proyectos sin recargar tras el login. Pide la tabla hallazgo → cambio → prueba. |
| 4 · reconexión | Un solo fallo. Pide explicar la causa antes de corregir y extender el caso al primer montaje. |
| 5 · bundle | Da la composición medida y advierte que la trampa conocida (medir sin variables) aquí no aplica. Pide decir también qué no se gana. |

Lo que no funcionó, también registrado: la primera respuesta al prompt 1 quedó cortada porque otra
sesión escribió en la misma carpeta. Desde el prompt 2 las respuestas se escribieron en la sesión
principal, porque se agotó el límite de subagentes, y se guardaron siempre **antes** de verificar.

## 3.3 Tamaño de bundle

Medido con `vite build` (Rolldown) y con `herramientas/medir-bundle.sh` (un chunk por paquete, solo
para medir). Archivos: [bundle.txt](evidencia/bundle.txt), [v4/bundle.txt](../bitacora/v4/bundle.txt).

| | Antes (v4) | Después (v5 y final) |
|---|---|---|
| Chunk inicial | 474,73 kB (134,36 kB gzip), un solo archivo | `index` 247,41 kB (76,42 kB gzip) |
| Lo que descarga el **modo demo** | 474,73 kB | ≈ 256 kB: `index` + `demo` 7,25 + `validation` 1,34. **supabase-js no se descarga** (comprobado en el navegador) |
| Lo que descarga el **modo Supabase** | 474,73 kB | ≈ 470 kB: `index` + `supabaseClient` 216,16 + `supabase` 4,91 + `validation` 1,34. El demo no se descarga |
| Composición (por paquete) | react 218,77 · supabase-js 210,07 · app 31,26 · demo 8,49 | igual, repartido en chunks |

Qué **no** se ganó: en modo Supabase el total casi no cambia y se agrega una petición encadenada.
El piso es React, con ≈ 219 kB. La trampa de labs anteriores, que el build sin variables saliera
más chico porque el minificador quitaba `createClient`, aquí no aparece: los dos builds pesan lo
mismo. Hallazgo de la herramienta: un `.env.local` olvidado contaminaba el build «sin variables» y
las pruebas. Desde entonces los scripts vacían `VITE_SUPABASE_*` a propósito.

## 3.4 Verificación RLS

- **Ejecutado, no supuesto:** la migración la aplicó la CLI de Supabase local y la probaron tres
  usuarios reales. Resultado: **32 de 32** ([supabase-local.txt](evidencia/supabase-local.txt),
  detalle en [2.4](02-esquema-y-rls.md#24-resultado-32-de-32)).
- **Leído de la base:** políticas, RLS activa, privilegios por columna, publicación Realtime y
  `replica identity` ([rls-politicas.txt](evidencia/rls-politicas.txt)). `anon` tiene 0 privilegios.
- **Desde la app:** en el navegador, con el build de producción contra el Supabase local, la sesión
  de Ana recibió en tiempo real el INSERT, el UPDATE y el DELETE de Beto sin recargar
  ([navegador.txt](evidencia/navegador.txt), capturas 05 y 06).
- **Lo que la RLS no cubre y el código asume:** los DELETE no pasan por RLS. Llegan con solo el
  `id` a cualquier suscriptor de la tabla, así que el hook nunca confía en su contenido.
