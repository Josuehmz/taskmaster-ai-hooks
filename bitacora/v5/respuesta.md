# Respuesta al prompt 5 · cada modo descarga solo lo suyo

> Escrita en la sesión principal y guardada antes de verificar ([verificacion.txt](verificacion.txt),
> [bundle.txt](bundle.txt)).

## Cambios

- `src/services/index.ts`: `createRepositories()` pasa a ser `async` y carga con `import()` dinámico
  `../lib/supabaseClient` + `./supabase` (si hay variables) o `./demo` (si no). El módulo ya no
  re-exporta `createDemoRepositories`. Un re-export estático habría vuelto a meter el demo en el
  chunk inicial. Las pruebas lo importan de `src/services/demo`.
- `src/hooks/RepositoriesContext.tsx`: sin `value`, el proveedor crea los repositorios en un efecto
  y muestra «Preparando TaskMaster AI…» (`<output>`) mientras tanto, o un `role="alert"` si falla.
  Con `value` (pruebas) sigue siendo síncrono.
- Prueba nueva `RepositoriesContext.test.tsx`: sin variables, primero se ve el estado de carga y
  después el modo demo.
- La interfaz de los hooks no cambia y la UI sigue sin importar `src/services` ni `src/lib`.

## Qué se gana y qué no

- **Modo demo:** supabase-js (≈210 kB, ≈54 kB gzip) **deja de descargarse**. Es la ganancia real.
- **Modo Supabase:** el chunk inicial ya no lleva el repositorio demo (≈8,5 kB). supabase-js se baja
  en un chunk aparte, **pero se baja igual**: el total descargado casi no cambia y se agrega una
  petición encadenada (primero el chunk inicial, después el de Supabase). La pantalla útil no
  aparece antes: el proveedor espera a ese chunk.
- **React (≈219 kB)** no se toca: es el piso de cualquier modo.
