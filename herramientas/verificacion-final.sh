#!/usr/bin/env bash
# Verificación final del código integrado en src/ (= bitacora/v5/src). Escribe
# docs/evidencia/verificacion-final.txt. Si el Supabase local está corriendo, agrega la prueba de
# RLS y Realtime con tres usuarios.
#   bash herramientas/verificacion-final.sh
set -u
cd "$(dirname "$0")/.."
SALIDA="docs/evidencia/verificacion-final.txt"
mkdir -p docs/evidencia
# Un .env.local lo leerían Vite y Vitest: las variables vacías del proceso mandan sobre él.
export VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY=

paso() {
  echo "### \$ $*"
  "$@" 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g'
  echo "(código de salida: ${PIPESTATUS[0]})"
  echo
}

regla_de_capas() {
  # Prueba en negativo de la regla no-restricted-imports: un componente que importa supabase-js,
  # src/lib y src/services debe hacer fallar el lint. El archivo se borra al terminar.
  local f=src/components/__ViolacionDePrueba.tsx
  printf "import { createClient } from '@supabase/supabase-js'\nimport { supabase } from '../lib/supabaseClient'\nimport { createRepositories } from '../services'\nexport const x = [createClient, supabase, createRepositories]\n" > "$f"
  pnpm exec oxlint --deny-warnings "$f" 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g'
  echo "(código de salida: ${PIPESTATUS[0]}; se espera 1)"
  rm -f "$f"
}

{
  echo "Verificación final de src/ · $(date '+%Y-%m-%d %H:%M:%S %z') · node $(node -v) · pnpm $(pnpm -v) · commit $(git rev-parse --short HEAD)"
  echo
  paso pnpm install --frozen-lockfile
  echo "Nota: tsconfig.json tiene \"files\": [] y solo referencias; el chequeo real es tsc -b (script typecheck)."
  echo
  paso pnpm typecheck
  paso pnpm lint
  echo "### Regla de capas en negativo: un componente que importa Supabase debe fallar el lint"
  regla_de_capas
  echo
  paso pnpm test
  paso pnpm build
  echo "### Build con variables de prueba (valores falsos, no son credenciales): modo Supabase"
  VITE_SUPABASE_URL=https://ejemplo-no-real.supabase.co VITE_SUPABASE_ANON_KEY=clave-de-prueba-no-real paso pnpm exec vite build
  if D:/Herramientas/supabase/supabase.exe status --agent no >/dev/null 2>&1; then
    echo "### RLS y Realtime contra el Supabase local (CLI 2.122.0, tres usuarios reales)"
    paso bash herramientas/probar-supabase-local.sh
  else
    echo "### RLS y Realtime: Supabase local apagado en esta corrida (ver docs/evidencia/supabase-local.txt)"
  fi
} > "$SALIDA"
rm -rf dist
cat "$SALIDA"
