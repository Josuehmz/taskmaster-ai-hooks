#!/usr/bin/env bash
# Verifica una versión de la bitácora: copia bitacora/vN/src sobre src/ (y, si los trae, sus
# migraciones y su .oxlintrc.json) y corre tsc, lint, pruebas y dos builds.
#   bash herramientas/verificar-version.sh v1
# La salida completa queda en bitacora/vN/verificacion.txt (es la evidencia que cita la bitácora).
set -u
cd "$(dirname "$0")/.."
VERSION="${1:?uso: verificar-version.sh vN}"
DIR="bitacora/$VERSION"
SALIDA="$DIR/verificacion.txt"
BASE="$(git rev-list --max-parents=0 HEAD)"
[ -d "$DIR/src" ] || { echo "No existe $DIR/src"; exit 1; }

rm -rf src && cp -r "$DIR/src" src
# Archivos de arranque que la versión no trae: se toman del proyecto base (commit inicial).
for base in main.tsx index.css vite-env.d.ts; do
  [ -f "src/$base" ] || git show "$BASE:src/$base" > "src/$base"
done
# Configuración: la de la versión si la trae; si no, la del commit inicial.
for conf in .oxlintrc.json tsconfig.app.json vite.config.ts; do
  if [ -f "$DIR/$conf" ]; then cp "$DIR/$conf" "$conf"; else git show "$BASE:$conf" > "$conf"; fi
done
# Migraciones SQL: las de la versión reemplazan a las anteriores.
if [ -d "$DIR/supabase/migrations" ]; then
  mkdir -p supabase && rm -rf supabase/migrations && cp -r "$DIR/supabase/migrations" supabase/migrations
fi

paso() {
  local titulo="$1"; shift
  echo "### $titulo"
  echo "\$ $*"
  "$@" 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g'
  echo "(código de salida: ${PIPESTATUS[0]})"
  echo
}

{
  echo "Verificación de $VERSION · $(date '+%Y-%m-%d %H:%M:%S %z') · node $(node -v) · pnpm $(pnpm -v)"
  echo
  paso "TypeScript" pnpm exec tsc -b --noEmit
  paso "Lint (oxlint)" pnpm exec oxlint --deny-warnings
  if find src -name '*.test.*' | grep -q .; then
    paso "Pruebas (Vitest)" pnpm exec vitest run
  else
    echo "### Pruebas (Vitest)"; echo "Esta versión no trae pruebas."; echo
  fi
  paso "Build sin variables de entorno" pnpm exec vite build
  VITE_SUPABASE_URL=https://ejemplo-no-real.supabase.co VITE_SUPABASE_ANON_KEY=clave-de-prueba-no-real \
    paso "Build con variables de prueba (valores falsos)" pnpm exec vite build
} > "$SALIDA"
cat "$SALIDA"
