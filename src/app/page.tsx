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
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requestJson } from "@/lib/client";
import { formatBytes } from "@/lib/utils";

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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await requestJson<DashboardData>("/api/dashboard"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load.");
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const polling = setInterval(() => void load(), 3_000);
    return () => {
      clearTimeout(initial);
      clearInterval(polling);
    };
  }, [load]);

  async function action(url: string) {
    await requestJson(url, { method: "POST" });
    await load();
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
            <Button variant="outline" onClick={() => action("/api/scans")}>
              <ScanSearch className="size-4" /> Scan now
            </Button>
            <Button
              variant={data?.queuePaused ? "default" : "secondary"}
              onClick={() =>
                action(data?.queuePaused ? "/api/queue/resume" : "/api/queue/pause")
              }
            >
              {data?.queuePaused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {data?.queuePaused ? "Resume" : "Pause"}
            </Button>
          </>
        }
      />

      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}

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
                  <span>{data.current.speed ?? "Starting"} · {data.current.etaSeconds ?? "—"}s remaining</span>
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
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed" ? "success" : status === "failed" ? "destructive" : "warning";
  return <Badge variant={variant}>{status}</Badge>;
}
