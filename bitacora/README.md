# Bitácora de prompts

Cinco prompts, cada uno con su respuesta cruda, el código tal como salió, la verificación real y el
diff contra la versión anterior. El código de `src/` es v5 más el
[ajuste tras las capturas](ajuste-final-tras-capturas.diff).

| # | Prompt | Respuesta y código | Verificación real | Resultado |
|---|---|---|---|---|
| 1 | [Diseño de la abstracción](01-prompt-diseno.md) | [v1/respuesta.md](v1/respuesta.md), [v1/src](v1/src), [v1/supabase](v1/supabase) | [v1/verificacion.txt](v1/verificacion.txt), [v1/supabase-local.txt](v1/supabase-local.txt) | tsc 0 · lint 2 avisos · RLS y Realtime 29/29 |
| 2 | [Lógica y tiempo real](02-prompt-logica-tiempo-real.md) | [v2/respuesta.md](v2/respuesta.md), [v2/src](v2/src), [diff](v2/cambios-desde-v1.diff) | [v2/verificacion.txt](v2/verificacion.txt), [v2/supabase-local.txt](v2/supabase-local.txt), [v2/navegador-supabase-local.txt](v2/navegador-supabase-local.txt) | lint 1 error · 26/29 · RLS 32/32 |
| 3 | [Auditoría](03-prompt-auditoria.md) | [v3/respuesta.md](v3/respuesta.md), [v3/src](v3/src), [diff](v3/cambios-desde-v2.diff) | [v3/verificacion.txt](v3/verificacion.txt) | lint 0 · 34/35 |
| 4 | [Reconexión](04-prompt-reconexion.md) | [v4/respuesta.md](v4/respuesta.md), [v4/src](v4/src), [diff](v4/cambios-desde-v3.diff) | [v4/verificacion.txt](v4/verificacion.txt), [v4/bundle.txt](v4/bundle.txt) | 36/36 · un chunk de 474 kB |
| 5 | [Tamaño de bundle](05-prompt-bundle.md) | [v5/respuesta.md](v5/respuesta.md), [v5/src](v5/src), [diff](v5/cambios-desde-v4.diff) | [v5/verificacion.txt](v5/verificacion.txt), [v5/bundle.txt](v5/bundle.txt) | 37/37 · chunk inicial 247 kB |

Cómo se produjo:

- **v1** la escribió un asistente en una conversación aparte, con el prompt literal como única
  instrucción y permiso para escribir solo en `v1/`. La primera respuesta quedó cortada porque otra
  sesión escribió en la misma carpeta. Se le pidió completar la suya con el mismo prompt (nota en el
  prompt 1).
- **v2 a v5** se escribieron en la sesión principal, porque se agotó el límite de subagentes. Cada
  respuesta se guardó en `vN/` **antes** de correr `herramientas/verificar-version.sh vN`, que copia
  `vN/src` sobre `src/` y escribe tsc, lint, pruebas y dos builds en `vN/verificacion.txt`. Lo que
  falló no se arregló en la misma versión: pasó al prompt siguiente.
- La configuración de oxlint de cada versión se guarda como `vN/oxlintrc.json`, sin punto. Con
  punto es una configuración anidada que oxlint aplica a esa carpeta (lo destapó v2).
- Las herramientas de medición (`herramientas/`) cambiaron dos veces por fallos propios, y cada
  cambio está anotado donde ocurrió: la configuración anidada de oxlint (prompt 3) y el `.env.local`
  que contaminaba las verificaciones (prompt 5).
