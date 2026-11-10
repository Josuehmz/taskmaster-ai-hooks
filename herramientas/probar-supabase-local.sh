#!/usr/bin/env bash
# Corre herramientas/probar-supabase-local.mjs contra el Supabase local (supabase start).
# Toma la URL y la anon key de `supabase status -o env` SIN imprimirlas.
#   bash herramientas/probar-supabase-local.sh [archivo-de-salida]
set -u
cd "$(dirname "$0")/.."
CLI="${SUPABASE_CLI:-D:/Herramientas/supabase/supabase.exe}"
ENV_LOCAL="$("$CLI" status -o env --agent no 2>/dev/null | tr -d '\r')"
SUPABASE_URL="$(printf '%s\n' "$ENV_LOCAL" | sed -n 's/^API_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')"
SUPABASE_ANON_KEY="$(printf '%s\n' "$ENV_LOCAL" | sed -n 's/^ANON_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')"
[ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_ANON_KEY" ] || { echo "Supabase local no está corriendo"; exit 2; }
export SUPABASE_URL SUPABASE_ANON_KEY
SALIDA="${1:-}"
if [ -n "$SALIDA" ]; then
  {
    echo "Prueba de RLS y Realtime contra Supabase local · $(date '+%Y-%m-%d %H:%M:%S %z') · commit $(git rev-parse --short HEAD)"
    echo "API: $SUPABASE_URL (local) · migración: $(ls supabase/migrations)"
    echo
    node herramientas/probar-supabase-local.mjs 2>&1
    echo "(código de salida: ${PIPESTATUS[0]})"
  } > "$SALIDA"
  cat "$SALIDA"
else
  node herramientas/probar-supabase-local.mjs
fi
