# Compressarr

Compressarr is a self-hosted media optimizer that reclaims storage by safely converting eligible videos to H.265. It preserves multiple audio tracks and subtitles, tracks saved space, and provides a local web interface for managing media folders and work.

> Compressarr replaces source media after a conversion has passed validation and met the configured savings threshold. Keep backups of important media.

## Deploy

Requirements:

- Linux host with Docker and Docker Compose
- A writable media directory
- Local storage for the `/config` volume

1. Download `docker-compose.yml`.
2. Replace `/path/to/media` with the path to your media library.
3. Replace `docker.io/yourusername/compressarr:latest` with the published Docker Hub image, or run from this repository to build locally.
4. Start the application:

```bash
docker compose up -d
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The `/media` mount must be read/write. The `/config` mount stores the database and must use local storage rather than NFS.

## Upgrade

```bash
docker compose pull
docker compose up -d
```

## Backup

Stop both containers and back up the complete host directory mounted at `/config`.

## Contributing

Development information is in [docs/development.md](docs/development.md). Contributions are welcome through GitHub issues and pull requests.

Licensed under the [MIT License](LICENSE).
