"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CircleCheck,
  Clock3,
  HardDriveDownload,
  Pause,
  Play,
  RefreshCw,
  ScanSearch,
  ServerCog,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requestJson } from "@/lib/client";
import { formatBytes, formatDuration } from "@/lib/utils";

interface DashboardJob {
  id: number;
  status: string;
  sourcePath: string;
  savedBytes: number | null;
  progressPercent: number | null;
  speed: string | null;
  etaSeconds: number | null;
  errorMessage: string | null;
}

interface DashboardData {
  counts: Record<string, number>;
  savedBytes: number;
  completedCount: number;
  current: DashboardJob | null;
  recent: DashboardJob[];
  queuePaused: boolean;
}

interface RemoteNode {
  id: number;
  name: string;
  hostname: string;
  version: string | null;
  status: string;
  lastSeenAt: string | null;
  currentJobId: number | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [nodes, setNodes] = useState<RemoteNode[]>([]);
  const load = useCallback(async () => {
    try {
      setData(await requestJson<DashboardData>("/api/dashboard"));
      toast.dismiss("dashboard-load-error");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to load.", {
        id: "dashboard-load-error",
      });
    }
  }, []);

  const loadNodes = useCallback(async () => {
    try {
      const result = await requestJson<{ nodes: RemoteNode[] }>("/api/nodes");
      setNodes(result.nodes);
      toast.dismiss("dashboard-nodes-error");
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Failed to load nodes.",
        { id: "dashboard-nodes-error" },
      );
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const polling = setInterval(() => void load(), 3_000);
    const initialNodes = setTimeout(() => void loadNodes(), 0);
    const nodePolling = setInterval(() => void loadNodes(), 10_000);
    return () => {
      clearTimeout(initial);
      clearInterval(polling);
      clearTimeout(initialNodes);
      clearInterval(nodePolling);
    };
  }, [load, loadNodes]);

  async function action(url: string, successMessage: string) {
    try {
      await requestJson(url, { method: "POST" });
      await load();
      toast.success(successMessage);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Action failed.");
    }
  }

  const metrics = [
    {
      label: "Storage reclaimed",
      value: formatBytes(data?.savedBytes),
      icon: HardDriveDownload,
      tone: "text-primary",
    },
    {
      label: "Conversions complete",
      value: String(data?.completedCount ?? 0),
      icon: CircleCheck,
      tone: "text-emerald-400",
    },
    {
      label: "Waiting in queue",
      value: String(data?.counts.queued ?? 0),
      icon: Clock3,
      tone: "text-amber-400",
    },
    {
      label: "Needs attention",
      value: String(data?.counts.failed ?? 0),
      icon: TriangleAlert,
      tone: "text-red-400",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A live view of your media optimization workload."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => action("/api/scans", "Scan requested.")}
            >
              <ScanSearch className="size-4" /> Scan now
            </Button>
            <Button
              variant={data?.queuePaused ? "default" : "secondary"}
              onClick={() =>
                action(
                  data?.queuePaused ? "/api/queue/resume" : "/api/queue/pause",
                  data?.queuePaused ? "Queue resumed." : "Queue paused.",
                )
              }
            >
              {data?.queuePaused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {data?.queuePaused ? "Resume" : "Pause"}
            </Button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-2xl font-bold">{metric.value}</p>
              </div>
              <metric.icon className={`size-6 ${metric.tone}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className={`size-4 text-primary ${data?.current ? "animate-spin" : ""}`} />
              Current conversion
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.current ? (
              <div className="space-y-4">
                <p className="truncate text-sm font-medium">{data.current.sourcePath}</p>
                <Progress value={data.current.progressPercent} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{(data.current.progressPercent ?? 0).toFixed(1)}%</span>
                  <span>
                    {data.current.speed ?? "Starting"} ·{" "}
                    {formatDuration(data.current.etaSeconds)} remaining
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {data?.queuePaused ? "The queue is paused." : "No conversion is currently running."}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data?.recent.length ? data.recent.map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm">{job.sourcePath.split("/").pop()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {job.status === "completed" ? `${formatBytes(job.savedBytes)} saved` : job.errorMessage}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </div>
            )) : <p className="py-8 text-center text-sm text-muted-foreground">No completed work yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border">
          <CardTitle className="flex items-center gap-2">
            <ServerCog className="size-4 text-primary" />
            Registered nodes
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void loadNodes()}
          >
            <RefreshCw className="size-3" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {nodes.map((node) => (
            <div
              key={node.id}
              className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{node.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {node.hostname}
                  {node.version ? ` · v${node.version}` : ""}
                  {node.currentJobId ? ` · Processing job ${node.currentJobId}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {node.lastSeenAt
                    ? `Last seen ${new Date(node.lastSeenAt).toLocaleString()}`
                    : "Never connected"}
                </p>
              </div>
              <NodeStatus status={node.status} />
            </div>
          ))}
          {!nodes.length && (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              No remote nodes registered.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed" ? "success" : status === "failed" ? "destructive" : "warning";
  return <Badge variant={variant}>{status}</Badge>;
}

function NodeStatus({ status }: { status: string }) {
  const variant =
    status === "working"
      ? "default"
      : status === "idle"
        ? "success"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}
