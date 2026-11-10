#!/usr/bin/env bash
# Composición del bundle sin variables y con variables de prueba (valores falsos).
#   bash herramientas/medir-bundle.sh [archivo-de-salida]
set -u
cd "$(dirname "$0")/.."
SALIDA="${1:?uso: medir-bundle.sh <archivo-de-salida>}"
{
  echo "Composición del bundle · $(date '+%Y-%m-%d %H:%M:%S %z') · commit $(git rev-parse --short HEAD)"
  echo
  echo "## Sin variables de entorno (modo demo)"
  # Vacías a propósito: un .env.local las inyectaría (ver verificar-version.sh).
  VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= node herramientas/medir-bundle.mjs 2>&1
  echo
  echo "## Con variables de prueba (valores falsos, no son credenciales): modo Supabase"
  VITE_SUPABASE_URL=https://ejemplo-no-real.supabase.co VITE_SUPABASE_ANON_KEY=clave-de-prueba-no-real \
    node herramientas/medir-bundle.mjs 2>&1
} > "$SALIDA"
rm -rf dist-medicion
cat "$SALIDA"
