"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  LoaderCircle,
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

export default function DirectoriesPage() {
  const [root, setRoot] = useState<DirectoryNode | null>(null);
  const [children, setChildren] = useState<Record<string, DirectoryNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState<Set<string>>(new Set());

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
          body: JSON.stringify({ path: node.path }),
        });
      } else {
        await requestJson(`/api/directories/${node.directoryId}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled }),
        });
      }
      await refreshLoadedDirectories();
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
        description="Choose which directories Compressarr should scan recursively."
      />
      <Card className="min-h-[65vh] overflow-hidden">
        <CardContent className="min-h-[calc(65vh-4rem)] p-3 sm:p-5">
          {root ? (
            <DirectoryRow
              node={root}
              depth={0}
              expanded={expanded}
              childMap={children}
              loading={loading}
              updating={updating}
              onToggleExpanded={toggleExpanded}
              onSetEnabled={setEnabled}
            />
          ) : (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading media directories
            </div>
          )}
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
  onToggleExpanded,
  onSetEnabled,
}: {
  node: DirectoryNode;
  depth: number;
  expanded: Set<string>;
  childMap: Record<string, DirectoryNode[]>;
  loading: Set<string>;
  updating: Set<string>;
  onToggleExpanded: (node: DirectoryNode) => Promise<void>;
  onSetEnabled: (node: DirectoryNode, enabled: boolean) => Promise<void>;
}) {
  const isExpanded = expanded.has(node.path);
  const isLoading = loading.has(node.path);
  const childNodes = childMap[node.path];
  const isUpdating = updating.has(node.path);

  return (
    <div>
      <div
        className="group flex min-h-14 items-center gap-3 rounded-md px-3 hover:bg-accent/70"
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
          disabled={!node.hasSubdirectories}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
          onClick={() => void onToggleExpanded(node)}
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
          {node.coveredBy && !node.enabled && (
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
            node.coveredBy && !node.enabled
              ? `Already scanned through ${node.coveredBy}`
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
              onToggleExpanded={onToggleExpanded}
              onSetEnabled={onSetEnabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
