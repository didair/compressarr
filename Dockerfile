FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache python3 make g++ \
    && corepack enable \
    && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_PATH=:memory: pnpm build \
    && pnpm build:runtime

FROM node:24-alpine AS runtime
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
    PORT=3000 \
    HOME=/config

RUN apk add --no-cache ffmpeg su-exec tzdata \
    && mkdir -p /config /media /app

WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/runtime ./runtime
COPY package.json ./package.json
COPY docker/entrypoint.sh /usr/local/bin/compressarr-entrypoint
RUN chmod +x /usr/local/bin/compressarr-entrypoint

EXPOSE 3000
VOLUME ["/config", "/media"]
ENTRYPOINT ["compressarr-entrypoint"]
CMD ["sh", "-c", "node runtime/migrate.cjs && node server.js"]
