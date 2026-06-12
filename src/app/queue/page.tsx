"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requestJson } from "@/lib/client";
import { formatBytes, formatDuration } from "@/lib/utils";

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
  etaSeconds: number | null;
  attemptCount: number;
  errorMessage: string | null;
  createdAt: string;
}

export default function QueuePage() {
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [data, setData] = useState<{ items: Job[]; total: number }>({ items: [], total: 0 });

  const load = useCallback(async () => {
    const query = status === "all" ? "" : `?status=${status}`;
    try {
      setData(await requestJson(`/api/jobs${query}`));
      toast.dismiss("queue-load-error");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to load.", {
        id: "queue-load-error",
      });
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

  async function action(url: string, successMessage: string, method = "POST") {
    try {
      await requestJson(url, { method });
      await load();
      toast.success(successMessage);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Action failed.");
    }
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
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-80">File</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Output</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Badge variant={badgeVariant(job.status)}>{job.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xl whitespace-normal">
                    <p className="truncate font-medium" title={job.sourcePath}>
                      {job.sourcePath}
                    </p>
                    {job.errorMessage && (
                      <p className="mt-1 line-clamp-2 text-xs text-red-400">
                        {job.errorMessage}
                      </p>
                    )}
                    {job.status === "running" && (
                      <div className="mt-2 space-y-1.5">
                        <Progress value={job.progressPercent} />
                        <p className="text-xs text-muted-foreground">
                          {(job.progressPercent ?? 0).toFixed(1)}% ·{" "}
                          {job.speed ?? "starting"} ·{" "}
                          {formatDuration(job.etaSeconds)} remaining
                        </p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{formatBytes(job.sourceSizeBytes)}</TableCell>
                  <TableCell>{formatBytes(job.outputSizeBytes)}</TableCell>
                  <TableCell>{formatBytes(job.savedBytes)}</TableCell>
                  <TableCell>{job.attemptCount}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {["queued", "running"].includes(job.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            action(`/api/jobs/${job.id}/cancel`, "Job cancelled.")
                          }
                        >
                          <Ban className="size-3" /> Cancel
                        </Button>
                      )}
                      {["failed", "skipped", "cancelled"].includes(job.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            action(`/api/jobs/${job.id}/retry`, "Job added back to the queue.")
                          }
                        >
                          <RotateCcw data-icon="inline-start" />
                          {job.status === "failed" ? "Retry" : "Requeue"}
                        </Button>
                      )}
                      {["completed", "failed", "skipped", "cancelled"].includes(job.status) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete history"
                          onClick={() =>
                            action(
                              `/api/jobs/${job.id}`,
                              "History entry removed.",
                              "DELETE",
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!data.items.length && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No jobs in this view.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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
