#!/usr/bin/env bash
# Envoltorio: exporta SUPABASE_URL y SUPABASE_ANON_KEY del Supabase local (sin imprimirlos) y corre
# el script de Node indicado. También puede escribir .env.local para `pnpm dev` contra el local.
#   bash herramientas/con-supabase-local.sh node herramientas/preparar-navegador-local.mjs <archivo>
#   bash herramientas/con-supabase-local.sh --env-local      (escribe .env.local, ignorado por git)
set -u
cd "$(dirname "$0")/.."
CLI="${SUPABASE_CLI:-D:/Herramientas/supabase/supabase.exe}"
ENV_LOCAL="$("$CLI" status -o env --agent no 2>/dev/null | tr -d '\r')"
SUPABASE_URL="$(printf '%s\n' "$ENV_LOCAL" | sed -n 's/^API_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')"
SUPABASE_ANON_KEY="$(printf '%s\n' "$ENV_LOCAL" | sed -n 's/^ANON_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')"
[ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_ANON_KEY" ] || { echo "Supabase local no está corriendo"; exit 2; }
if [ "${1:-}" = "--env-local" ]; then
  printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n' "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > .env.local
  echo ".env.local escrito (Supabase local; no se sube: .gitignore)"
  exit 0
fi
export SUPABASE_URL SUPABASE_ANON_KEY
"$@"
