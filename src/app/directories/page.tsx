"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUp, Check, Folder, FolderPlus, RefreshCw, ScanSearch } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requestJson } from "@/lib/client";

interface Directory {
  id: number;
  path: string;
  enabled: boolean;
  discoveredCount: number;
  lastScanCompletedAt: string | null;
  lastScanError: string | null;
}

interface BrowseEntry {
  name: string;
  path: string;
  enabled: boolean;
  coveredBy: string | null;
}

interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export default function DirectoriesPage() {
  const [directories, setDirectories] = useState<Directory[]>([]);
  const [browser, setBrowser] = useState<BrowseResult | null>(null);
  const [error, setError] = useState("");

  const loadDirectories = useCallback(async () => {
    setDirectories(await requestJson<Directory[]>("/api/directories"));
  }, []);
  const browse = useCallback(async (path?: string) => {
    const suffix = path ? `?path=${encodeURIComponent(path)}` : "";
    setBrowser(await requestJson<BrowseResult>(`/api/directories/browse${suffix}`));
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
      Promise.all([loadDirectories(), browse()]).catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Failed to load."),
      );
    }, 0);
    return () => clearTimeout(initial);
  }, [browse, loadDirectories]);

  async function enable(path: string) {
    try {
      await requestJson("/api/directories", {
        method: "POST",
        body: JSON.stringify({ path }),
      });
      await Promise.all([loadDirectories(), browse(browser?.path)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    }
  }

  async function update(id: number, enabled: boolean) {
    await requestJson(`/api/directories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    await Promise.all([loadDirectories(), browse(browser?.path)]);
  }

  return (
    <>
      <PageHeader
        title="Media directories"
        description="Choose folders below /media. Enabled folders are scanned recursively."
      />
      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Browse media</span>
              <Badge variant="outline">{browser?.path ?? "/media"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border rounded-lg border border-border">
              {browser?.parent && (
                <button onClick={() => browse(browser.parent!)} className="flex w-full items-center gap-3 p-3 text-left text-sm hover:bg-accent">
                  <ArrowUp className="size-4 text-muted-foreground" /> Parent directory
                </button>
              )}
              {browser?.entries.map((entry) => (
                <div key={entry.path} className="flex items-center gap-3 p-3">
                  <button onClick={() => browse(entry.path)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Folder className="size-4 shrink-0 text-primary" />
                    <span className="truncate text-sm">{entry.name}</span>
                  </button>
                  {entry.enabled ? (
                    <Badge variant="success"><Check className="mr-1 size-3" /> Enabled</Badge>
                  ) : entry.coveredBy ? (
                    <Badge variant="secondary">Covered</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => enable(entry.path)}>
                      <FolderPlus className="size-3" /> Enable
                    </Button>
                  )}
                </div>
              ))}
              {browser && browser.entries.length === 0 && (
                <p className="p-8 text-center text-sm text-muted-foreground">No subdirectories found.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Managed directories</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {directories.map((directory) => (
              <div key={directory.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{directory.path}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {directory.discoveredCount} media files · {directory.lastScanCompletedAt ? `scanned ${new Date(directory.lastScanCompletedAt).toLocaleString()}` : "scan pending"}
                    </p>
                    {directory.lastScanError && <p className="mt-1 text-xs text-red-400">{directory.lastScanError}</p>}
                  </div>
                  <Badge variant={directory.enabled ? "success" : "secondary"}>
                    {directory.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" disabled={!directory.enabled} onClick={() => requestJson(`/api/directories/${directory.id}/scan`, { method: "POST" })}>
                    <ScanSearch className="size-3" /> Scan
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => update(directory.id, !directory.enabled)}>
                    {directory.enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
            ))}
            {!directories.length && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <RefreshCw className="mx-auto mb-3 size-5" /> No directories enabled.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
