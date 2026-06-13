"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CircleCheck,
  CircleDashed,
  ChevronDown,
  ChevronRight,
  Clock3,
  EyeOff,
  FileWarning,
  FileVideo2,
  Folder,
  FolderOpen,
  LoaderCircle,
  ListVideo,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { requestJson } from "@/lib/client";
import { formatBytes } from "@/lib/utils";

interface DirectoryNode {
  name: string;
  path: string;
  directoryId: number | null;
  enabled: boolean;
  explicitEnabled: boolean | null;
  coveredBy: string | null;
  sizeBytes: number;
  mediaFileCount: number;
  hasSubdirectories: boolean;
}

interface BrowseResult {
  path: string;
  parent: string | null;
  node: DirectoryNode;
  entries: DirectoryNode[];
}

interface MediaFile {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string;
  codec: string | null;
  status: string;
  detail: string | null;
  progressPercent: number | null;
}

interface DirectoryFilesResult {
  path: string;
  watched: boolean;
  files: MediaFile[];
}

export default function DirectoriesPage() {
  const [root, setRoot] = useState<DirectoryNode | null>(null);
  const [children, setChildren] = useState<Record<string, DirectoryNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] =
    useState<DirectoryFilesResult | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);

  const fetchDirectory = useCallback(async (directoryPath?: string) => {
    const query = directoryPath
      ? `?path=${encodeURIComponent(directoryPath)}`
      : "";
    return requestJson<BrowseResult>(`/api/directories/browse${query}`);
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
      fetchDirectory()
        .then((result) => {
          setRoot(result.node);
          setChildren({ [result.path]: result.entries });
          setSelectedPath(result.path);
          void loadFiles(result.path);
          setExpanded(
            result.node.hasSubdirectories
              ? new Set([result.path])
              : new Set(),
          );
        })
        .catch((caught) =>
          toast.error(caught instanceof Error ? caught.message : "Failed to load."),
        );
    }, 0);
    return () => clearTimeout(initial);
  }, [fetchDirectory]);

  async function loadFiles(directoryPath: string) {
    setSelectedPath(directoryPath);
    setFilesLoading(true);
    try {
      const result = await requestJson<DirectoryFilesResult>(
        `/api/directories/files?path=${encodeURIComponent(directoryPath)}`,
      );
      setSelectedFiles(result);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Failed to inspect media.",
      );
    } finally {
      setFilesLoading(false);
    }
  }

  async function toggleExpanded(node: DirectoryNode) {
    if (!node.hasSubdirectories) return;

    if (expanded.has(node.path)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(node.path);
        return next;
      });
      return;
    }

    setExpanded((current) => new Set(current).add(node.path));
    if (children[node.path]) return;

    setLoading((current) => new Set(current).add(node.path));
    try {
      const result = await fetchDirectory(node.path);
      setChildren((current) => ({ ...current, [node.path]: result.entries }));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to load.");
    } finally {
      setLoading((current) => {
        const next = new Set(current);
        next.delete(node.path);
        return next;
      });
    }
  }

  async function setEnabled(node: DirectoryNode, enabled: boolean) {
    setUpdating((current) => new Set(current).add(node.path));
    try {
      if (node.directoryId == null) {
        await requestJson("/api/directories", {
          method: "POST",
          body: JSON.stringify({ path: node.path, enabled }),
        });
      } else {
        await requestJson(`/api/directories/${node.directoryId}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled }),
        });
      }
      await refreshLoadedDirectories();
      if (selectedPath) await loadFiles(selectedPath);
      toast.success(enabled ? "Directory enabled." : "Directory disabled.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setUpdating((current) => {
        const next = new Set(current);
        next.delete(node.path);
        return next;
      });
    }
  }

  async function refreshLoadedDirectories() {
    if (!root) return;
    const loadedPaths = Object.keys(children);
    const results = await Promise.all(
      loadedPaths.map((directoryPath) => fetchDirectory(directoryPath)),
    );
    const nextChildren = { ...children };
    for (const result of results) nextChildren[result.path] = result.entries;
    setChildren(nextChildren);

    const refreshedRoot = results.find((result) => result.path === root.path);
    if (refreshedRoot) setRoot(refreshedRoot.node);
  }

  return (
    <>
      <PageHeader
        title="Media directories"
        description="Manage watched folders and inspect how every media file is handled."
        eyebrow="Library"
      />
      <Card className="min-h-[68vh] overflow-hidden lg:h-[calc(100dvh-13rem)] lg:min-h-[36rem]">
        <CardContent className="grid min-h-[68vh] p-0 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(320px,0.85fr)_minmax(480px,1.35fr)]">
          <div className="flex min-h-0 min-w-0 flex-col border-b border-border/80 lg:border-r lg:border-b-0">
            <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-3 sm:px-7 sm:pt-7">
              <div>
                <p className="text-sm font-semibold">Folders</p>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 sm:px-5 sm:pb-5">
              {root ? (
                <DirectoryRow
                  node={root}
                  depth={0}
                  expanded={expanded}
                  childMap={children}
                  loading={loading}
                  updating={updating}
                  selectedPath={selectedPath}
                  onToggleExpanded={toggleExpanded}
                  onSetEnabled={setEnabled}
                  onSelect={loadFiles}
                />
              ) : (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  Loading media directories
                </div>
              )}
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-col bg-background/20">
            <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-border/80 px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {selectedPath?.split("/").pop() ?? "Media files"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedPath ?? "Select a directory"}
                </p>
              </div>
              {selectedFiles && (
                <Badge variant={selectedFiles.watched ? "success" : "secondary"}>
                  {selectedFiles.watched ? "Watched" : "Not watched"}
                </Badge>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <MediaFileList result={selectedFiles} loading={filesLoading} />
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function DirectoryRow({
  node,
  depth,
  expanded,
  childMap,
  loading,
  updating,
  selectedPath,
  onToggleExpanded,
  onSetEnabled,
  onSelect,
}: {
  node: DirectoryNode;
  depth: number;
  expanded: Set<string>;
  childMap: Record<string, DirectoryNode[]>;
  loading: Set<string>;
  updating: Set<string>;
  selectedPath: string | null;
  onToggleExpanded: (node: DirectoryNode) => Promise<void>;
  onSetEnabled: (node: DirectoryNode, enabled: boolean) => Promise<void>;
  onSelect: (path: string) => Promise<void>;
}) {
  const isExpanded = expanded.has(node.path);
  const isLoading = loading.has(node.path);
  const childNodes = childMap[node.path];
  const isUpdating = updating.has(node.path);

  return (
    <div>
      <div
        className={`group flex min-h-14 items-center gap-2 rounded-xl px-2 transition-colors ${
          selectedPath === node.path
            ? "bg-primary/10 ring-1 ring-primary/20"
            : "hover:bg-accent/70"
        }`}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        {node.hasSubdirectories ? (
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
            onClick={() => void onToggleExpanded(node)}
          >
            {isLoading ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="size-5" />
            ) : (
              <ChevronRight className="size-5" />
            )}
          </button>
        ) : (
          <span className="size-8 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => void onSelect(node.path)}
        >
          {isExpanded ? (
            <FolderOpen className="size-5 shrink-0 text-primary" />
          ) : (
            <Folder className="size-5 shrink-0 text-primary" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-base font-medium">{node.name}</span>
            {node.mediaFileCount > 0 && (
              <span className="block text-xs text-muted-foreground">
                {node.mediaFileCount} media{" "}
                {node.mediaFileCount === 1 ? "file" : "files"}
              </span>
            )}
          </span>
          {node.explicitEnabled == null && node.enabled && (
            <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
              Inherited
            </Badge>
          )}
        </button>
        <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground sm:w-28">
          {formatBytes(node.sizeBytes)}
        </span>
        <Switch
          checked={node.enabled}
          disabled={isUpdating}
          aria-label={`${node.enabled ? "Disable" : "Enable"} ${node.name}`}
          title={
            node.explicitEnabled == null && node.enabled && node.coveredBy
              ? `Enabled through ${node.coveredBy}. Turn off to exclude this directory.`
              : node.explicitEnabled === false
                ? "This directory is explicitly excluded."
              : undefined
          }
          onCheckedChange={(checked) => void onSetEnabled(node, checked)}
        />
      </div>
      {isExpanded && (
        <div>
          {childNodes?.map((child) => (
            <DirectoryRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              childMap={childMap}
              loading={loading}
              updating={updating}
              selectedPath={selectedPath}
              onToggleExpanded={onToggleExpanded}
              onSetEnabled={onSetEnabled}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaFileList({
  result,
  loading,
}: {
  result: DirectoryFilesResult | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Inspecting media files
      </div>
    );
  }

  if (!result?.files.length) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
          <ListVideo className="size-5" />
        </div>
        <p className="text-sm font-medium">No media files in this folder</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Files inside subdirectories are shown when you select those folders.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/70">
      {result.files.map((file) => {
        const presentation = fileStatus(file.status);
        const StatusIcon = presentation.icon;
        return (
          <div
            key={file.path}
            className="grid gap-3 px-5 py-4 hover:bg-accent/30 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="flex min-w-0 gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <FileVideo2 className="size-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={file.name}>
                  {file.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBytes(file.sizeBytes)}
                  {file.codec ? ` · ${file.codec.toUpperCase()}` : ""}
                  {" · "}
                  {new Date(file.modifiedAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <Badge
              variant={presentation.variant}
              className="h-fit shrink-0 gap-1.5 justify-self-start sm:justify-self-end"
            >
              <StatusIcon className="size-3" />
              {presentation.label}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function fileStatus(status: string): {
  label: string;
  variant: "default" | "secondary" | "success" | "warning" | "destructive";
  icon: typeof CircleCheck;
} {
  if (status === "efficient" || status === "completed") {
    return {
      label: status === "efficient" ? "Already efficient" : "Completed",
      variant: "success",
      icon: CircleCheck,
    };
  }
  if (status === "queued" || status === "running") {
    return {
      label: status === "running" ? "Converting" : "Queued",
      variant: "default",
      icon: Clock3,
    };
  }
  if (status === "not_watched") {
    return { label: "Not watched", variant: "secondary", icon: EyeOff };
  }
  if (status === "waiting" || status === "not_queued") {
    return {
      label: status === "waiting" ? "Waiting" : "Not queued",
      variant: "warning",
      icon: CircleDashed,
    };
  }
  if (status === "failed" || status === "unreadable") {
    return { label: "Needs attention", variant: "destructive", icon: FileWarning };
  }
  return {
    label: status[0]?.toUpperCase() + status.slice(1),
    variant: "secondary",
    icon: CircleDashed,
  };
}
