#!/usr/bin/env bash
# Corre un comando de la CLI de Supabase y guarda su salida como evidencia en docs/evidencia/cli/.
#   bash herramientas/cli.sh 01-version --version
#   bash herramientas/cli.sh 03-start start -x studio,...
# Cada archivo lleva fecha, versión, comando y código de salida, sin códigos ANSI y con las claves
# y la URL de la base con contraseña cambiadas por <redactado> (aunque sean las locales por defecto).
set -u
cd "$(dirname "$0")/.."
CLI="${SUPABASE_CLI:-D:/Herramientas/supabase/supabase.exe}"
NOMBRE="${1:?uso: cli.sh <nn-nombre> <argumentos de supabase>}"; shift
mkdir -p docs/evidencia/cli
SALIDA="docs/evidencia/cli/$NOMBRE.txt"
{
  echo "Fecha: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "CLI: supabase $("$CLI" --version 2>/dev/null)"
  echo "Comando: supabase $* --agent no"
  echo "----"
  "$CLI" "$@" --agent no 2>&1 | sed -E \
    -e 's/\x1b\[[0-9;]*[A-Za-z]//g' \
    -e 's/sb_(publishable|secret)_[A-Za-z0-9_-]+/<redactado>/g' \
    -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/<redactado>/g' \
    -e 's#(postgres(ql)?://[^:]+:)[^@]+@#\1<redactado>@#g' \
    -e 's/((Secret|JWT secret|S3 Access Key|S3 Secret Key|Publishable|Service role key|anon key)[^:]*: *).*/\1<redactado>/I'
  echo "----"
  echo "(código de salida: ${PIPESTATUS[0]})"
} > "$SALIDA"
cat "$SALIDA"
