# Development

## Requirements

- Node.js 24
- pnpm 11
- FFmpeg and ffprobe with libx265

Install dependencies and initialize the database:

```bash
pnpm install
pnpm db:migrate
```

Run the web application and worker in separate terminals:

```bash
pnpm dev
pnpm worker
```

The default development database is `data/compressarr.sqlite`. Set `MEDIA_ROOT` to a writable test media directory instead of using `/media`.

## Checks

```bash
pnpm check
```

Generate a migration after changing `src/db/schema.ts`:

```bash
pnpm db:generate
```

Commit generated migrations with the schema change.

## Publish Docker Images

Log in to Docker Hub, update the `version` in `package.json`, and run:

```bash
docker login
pnpm deploy
```

The command builds `linux/amd64` and `linux/arm64` images and pushes tags for
the exact package version, major/minor version, `latest`, and the current Git
commit. Preview the command without building or pushing:

```bash
pnpm deploy:dry-run
```
