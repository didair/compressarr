#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
COMPRESSARR_VERSION="${COMPRESSARR_VERSION:-$(node -p "require('/app/package.json').version")}"

export COMPRESSARR_VERSION

case " $* " in
  *" server.js "*) echo "Compressarr web v${COMPRESSARR_VERSION} starting." ;;
esac

if [ "$(id -u)" = "0" ]; then
  case "$PUID:$PGID" in
    *[!0-9:]* | :* | *:) echo "PUID and PGID must be numeric." >&2; exit 1 ;;
  esac

  mkdir -p /config
  chown -R "$PUID:$PGID" /config
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
