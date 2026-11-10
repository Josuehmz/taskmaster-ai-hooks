# Prompt 4 · La reconexión que llega con una carga en vuelo

**Objetivo del paso:** v3 dejó lint en 0 y 34 de 35 pruebas. La que falla es justo la que
escribió v3 para la reconexión, y destapa un caso que la descripción de v3 daba por cubierto.

- [v3/verificacion.txt](v3/verificacion.txt): `tsc -b` 0 · lint 0 · **34 de 35** · build 474,75 kB
  (134,37 kB gzip) con variables de prueba.
- Respuesta: [v4/respuesta.md](v4/respuesta.md) · código: [v4/src/](v4/src/) ·
  verificación: [v4/verificacion.txt](v4/verificacion.txt) · diff: [v4/cambios-desde-v3.diff](v4/cambios-desde-v3.diff)

## Prompt literal

```text
Verificación real de tu paso 3: tsc 0, oxlint 0, Vitest 34 de 35. Falla tu propia prueba:

FAIL src/hooks/useTasks.test.tsx > useTasks · tiempo real > al reconectar (SUBSCRIBED de nuevo)
recarga y recupera el cambio perdido
AssertionError: expected [ { …(9) } ] to deeply equal [ { …(9) } ]
-     "title": "cambiada mientras el canal estaba caído",
+     "title": "antes",

La secuencia de la prueba es SUBSCRIBED → CHANNEL_ERROR → (cambio sin evento) → SUBSCRIBED, sin
esperar entre el primer SUBSCRIBED y el segundo. Explica por qué la lista se queda con "antes" y
corrige el núcleo (no la prueba). Piensa también en el primer SUBSCRIBED de un montaje normal con
Supabase, que suele llegar DESPUÉS de que la consulta inicial ya salió: ¿qué eventos pueden
perderse entre la consulta y el momento en que el canal queda escuchando? Entrega el núcleo
completo, una prueba para ese segundo caso, y actualiza los comentarios de "QUÉ GARANTIZA".
```
