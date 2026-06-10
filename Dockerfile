FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_PATH=:memory: pnpm build

FROM node:24-bookworm-slim AS runtime
ARG VERSION
ARG REVISION
LABEL org.opencontainers.image.title="Compressarr" \
      org.opencontainers.image.description="Self-hosted H.265 media optimizer" \
      org.opencontainers.image.source="https://github.com/didair/compressarr" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_PATH=/config/compressarr.sqlite \
    MEDIA_ROOT=/media \
    MIGRATIONS_PATH=/app/drizzle \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update \
    && apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 install -y --no-install-recommends ffmpeg gosu \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 911 compressarr \
    && useradd --uid 911 --gid 911 --create-home compressarr \
    && mkdir -p /config /media /app

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/tsconfig.json ./
COPY docker/entrypoint.sh /usr/local/bin/compressarr-entrypoint
RUN chmod +x /usr/local/bin/compressarr-entrypoint

EXPOSE 3000
VOLUME ["/config", "/media"]
ENTRYPOINT ["compressarr-entrypoint"]
CMD ["sh", "-c", "./node_modules/.bin/tsx src/db/migrate.ts && node server.js"]
