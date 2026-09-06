#!/bin/zsh

# This is a convenience helper for non-notarized development builds shared
# privately. It deliberately removes only macOS' download quarantine flag.
APP_PATH="/Applications/Reframe.app"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Reframe non e' stato trovato in Applicazioni."
  echo "Trascina prima Reframe.app nella cartella Applicazioni, poi esegui di nuovo questo file."
  echo
  read "?Premi Invio per chiudere..."
  exit 1
fi

echo "Rimuovo la quarantena da Reframe..."
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true

echo "Apro Reframe..."
open "$APP_PATH"
