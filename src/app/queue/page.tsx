"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requestJson } from "@/lib/client";
import { formatBytes } from "@/lib/utils";

const statuses = ["all", "queued", "running", "completed", "failed", "skipped", "cancelled"] as const;

interface Job {
  id: number;
  status: string;
  sourcePath: string;
  sourceSizeBytes: number;
  outputSizeBytes: number | null;
  savedBytes: number | null;
  progressPercent: number | null;
  speed: string | null;
  attemptCount: number;
  errorMessage: string | null;
  createdAt: string;
}

export default function QueuePage() {
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [data, setData] = useState<{ items: Job[]; total: number }>({ items: [], total: 0 });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const query = status === "all" ? "" : `?status=${status}`;
    try {
      setData(await requestJson(`/api/jobs${query}`));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load.");
    }
  }, [status]);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const polling = setInterval(() => void load(), 3_000);
    return () => {
      clearTimeout(initial);
      clearInterval(polling);
    };
  }, [load]);

  async function action(url: string, method = "POST") {
    await requestJson(url, { method });
    await load();
  }

  return (
    <>
      <PageHeader title="Work queue" description="Inspect conversion progress, history, and failures." />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {statuses.map((item) => (
          <Button key={item} size="sm" variant={status === item ? "default" : "outline"} onClick={() => setStatus(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </Button>
        ))}
      </div>
      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {data.items.map((job) => (
              <div key={job.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={badgeVariant(job.status)}>{job.status}</Badge>
                      <span className="text-xs text-muted-foreground">Attempt {job.attemptCount}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{job.sourcePath}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(job.sourceSizeBytes)}
                      {job.savedBytes ? ` · ${formatBytes(job.savedBytes)} saved` : ""}
                    </p>
                    {job.errorMessage && <p className="mt-2 text-xs text-red-400">{job.errorMessage}</p>}
                    {job.status === "running" && (
                      <div className="mt-3 max-w-xl space-y-1.5">
                        <Progress value={job.progressPercent} />
                        <p className="text-xs text-muted-foreground">{(job.progressPercent ?? 0).toFixed(1)}% · {job.speed ?? "starting"}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {["queued", "running"].includes(job.status) && (
                      <Button size="sm" variant="outline" onClick={() => action(`/api/jobs/${job.id}/cancel`)}>
                        <Ban className="size-3" /> Cancel
                      </Button>
                    )}
                    {job.status === "failed" && (
                      <Button size="sm" variant="outline" onClick={() => action(`/api/jobs/${job.id}/retry`)}>
                        <RotateCcw className="size-3" /> Retry
                      </Button>
                    )}
                    {["completed", "failed", "skipped", "cancelled"].includes(job.status) && (
                      <Button size="icon" variant="ghost" aria-label="Delete history" onClick={() => action(`/api/jobs/${job.id}`, "DELETE")}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!data.items.length && <p className="p-14 text-center text-sm text-muted-foreground">No jobs in this view.</p>}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function badgeVariant(status: string): "default" | "secondary" | "success" | "warning" | "destructive" {
  if (status === "completed") return "success";
  if (status === "failed") return "destructive";
  if (status === "queued" || status === "skipped") return "warning";
  if (status === "cancelled") return "secondary";
  return "default";
}
