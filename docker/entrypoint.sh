#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$(id -u)" = "0" ]; then
  current_gid="$(getent group compressarr | cut -d: -f3)"
  current_uid="$(id -u compressarr)"

  if [ "$current_gid" != "$PGID" ]; then
    groupmod -o -g "$PGID" compressarr
  fi
  if [ "$current_uid" != "$PUID" ]; then
    usermod -o -u "$PUID" compressarr
  fi

  mkdir -p /config
  chown -R compressarr:compressarr /config
  exec gosu compressarr:compressarr "$@"
fi

exec "$@"
