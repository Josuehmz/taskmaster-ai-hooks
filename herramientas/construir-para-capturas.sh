#!/usr/bin/env bash
# Construye las dos variantes que se fotografían:
#   dist/        modo demo (sin variables)
#   dist-local/  modo Supabase contra el Supabase LOCAL (URL y anon key locales, tomadas de
#                `supabase status`; no se imprimen y dist-local/ está en .gitignore)
# Después: `pnpm exec vite preview --port 5181` (demo) y
#          `pnpm exec vite preview --outDir dist-local --port 5182` (Supabase local).
set -eu
cd "$(dirname "$0")/.."
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= pnpm exec vite build --logLevel warn
bash herramientas/con-supabase-local.sh bash -c 'VITE_SUPABASE_URL="$SUPABASE_URL" VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" pnpm exec vite build --outDir dist-local --logLevel warn'
ls dist/assets dist-local/assets
