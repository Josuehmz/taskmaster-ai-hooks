# Prompt 5 · Tamaño de bundle (eje de la Auditoría IA)

**Objetivo del paso:** con la lógica cerrada (v4: 36 de 36), atacar el eje «Tamaño de bundle» con
datos y no a ojo. La composición la midió `herramientas/medir-bundle.sh`
([v4/bundle.txt](v4/bundle.txt)): un único chunk de 474 kB en los dos modos, del que supabase-js son
210 kB que el modo demo nunca usa, y el modo demo (8,5 kB) viaja también en modo Supabase.

- Respuesta: [v5/respuesta.md](v5/respuesta.md) · código: [v5/src/](v5/src/) ·
  verificación: [v5/verificacion.txt](v5/verificacion.txt) · composición: [v5/bundle.txt](v5/bundle.txt) ·
  diff: [v5/cambios-desde-v4.diff](v5/cambios-desde-v4.diff)

> **Hallazgo de la verificación de v5 (de la herramienta, no del código).** La primera corrida de
> v5 falló en la prueba nueva del proveedor: esperaba «modo: demo» y salió «modo: supabase». Había un
> `.env.local` (creado para ver v2 en el navegador contra el Supabase local), y Vitest y Vite lo
> leen. Desde entonces `herramientas/verificar-version.sh` y `medir-bundle.sh` dejan
> `VITE_SUPABASE_*` vacías a propósito, porque las variables del proceso mandan sobre los archivos
> `.env`, y el `.env.local` solo existe mientras se usa el navegador. Ese archivo también estaba
> presente en las verificaciones de v3 y v4, así que su build «sin variables» en realidad se hizo
> con las variables locales. v4 se volvió a verificar sin él: 36 de 36 y el mismo tamaño
> ([v4/verificacion-sin-env-local.txt](v4/verificacion-sin-env-local.txt),
> [v4/bundle-sin-env-local.txt](v4/bundle-sin-env-local.txt)). La corrida fallida de v5 no se
> guardó aparte: `verificacion.txt` es la corrida corregida, y este párrafo cuenta el fallo.

## Prompt literal

```text
Auditoría de tamaño de bundle de TaskMaster AI (tu paso 4). Composición medida con Vite 8 /
Rolldown separando chunks por paquete (gzip entre paréntesis):

  Sin variables (modo demo):            react 218,77 kB (67,52) · supabase-js 210,07 kB (53,84)
                                        app 31,26 kB (9,12) · modo demo 8,49 kB (3,02) · otros 6,01 kB
  Con variables de prueba (Supabase):   los mismos números (474,48 kB en total).

Es decir: el modo demo descarga supabase-js entero sin usarlo, y el modo Supabase descarga el
repositorio demo con sus datos simulados. Ojo: en labs anteriores el build SIN variables salía más
chico porque el minificador eliminaba createClient como código muerto; aquí no pasa (los dos
modos pesan igual), así que no basta con "medir con variables".

Haz que cada modo descargue solo lo suyo con import() dinámico en la composición de servicios
(src/services/index.ts), sin tocar la interfaz de los hooks ni la regla de capas (la UI sigue sin
importar src/services ni src/lib). El RepositoriesProvider tendrá que esperar a que los
repositorios estén listos: muestra un estado de carga accesible mientras tanto, y que las pruebas
que pasan `value` sigan siendo síncronas. Explica qué se gana en cada modo y qué NO se gana (por
ejemplo, si en modo Supabase el total descargado sigue igual). Archivos completos.
```
