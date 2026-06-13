#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$(id -u)" = "0" ]; then
  case "$PUID:$PGID" in
    *[!0-9:]* | :* | *:) echo "PUID and PGID must be numeric." >&2; exit 1 ;;
  esac

  mkdir -p /config
  chown -R "$PUID:$PGID" /config
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
