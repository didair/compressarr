import fs from "node:fs/promises";
import path from "node:path";

const temporaryMarker = ".compressarr-";
const temporarySuffix = ".tmp.mkv";

export function isCompressarrTemporaryFile(fileName: string): boolean {
  return (
    fileName.startsWith(".") &&
    fileName.includes(temporaryMarker) &&
    fileName.endsWith(temporarySuffix)
  );
}

export function temporaryPathForSource(
  sourcePath: string,
  owner: string,
): string {
  return path.join(
    path.dirname(sourcePath),
    `.${path.basename(sourcePath)}${temporaryMarker}${owner}${temporarySuffix}`,
  );
}

export async function cleanupTemporaryFilesForSource(
  sourcePath: string,
): Promise<void> {
  const directory = path.dirname(sourcePath);
  const prefix = `.${path.basename(sourcePath)}${temporaryMarker}`;
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith(prefix) &&
          entry.name.endsWith(temporarySuffix),
      )
      .map((entry) =>
        fs.rm(path.join(directory, entry.name), { force: true }),
      ),
  );
}
