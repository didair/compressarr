"use client";

import { FormEvent, useEffect, useState } from "react";
import { Copy, Save, ServerCog } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { requestJson } from "@/lib/client";

interface Settings {
  minimumFileAgeHours: number;
  minimumFileAgeUnit: MinimumFileAgeUnit;
  scanIntervalMinutes: number;
  scanIntervalUnit: ScanIntervalUnit;
  eligibleCodecs: string[];
  qualityProfile: "high" | "balanced" | "compact";
  maximumResolution: "keep" | "8k" | "4k" | "1080p" | "720p";
  minimumSavingsPercent: number;
  scheduleEnabled: boolean;
  scheduleStart: string;
  scheduleEnd: string;
  timezone: string;
  automaticRetryCount: number;
  queuePaused: boolean;
  nodeCoordinatorUrl: string;
}

interface NodeData {
  coordinatorUrl: string;
  command: string;
}

type MinimumFileAgeUnit = "minutes" | "hours" | "days" | "weeks" | "months";
type ScanIntervalUnit = "minutes" | "hours" | "days";

const minimumFileAgeFactors: Record<MinimumFileAgeUnit, number> = {
  minutes: 1 / 60,
  hours: 1,
  days: 24,
  weeks: 24 * 7,
  months: 24 * 30,
};

const scanIntervalFactors: Record<ScanIntervalUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 60 * 24,
};

const codecs = [
  ["h264", "H.264 / AVC"],
  ["mpeg2video", "MPEG-2"],
  ["mpeg4", "MPEG-4 Part 2"],
  ["vc1", "VC-1"],
  ["wmv3", "Windows Media Video 9"],
  ["msmpeg4v3", "Microsoft MPEG-4 v3"],
  ["mpeg1video", "MPEG-1"],
  ["theora", "Theora"],
  ["vp8", "VP8"],
  ["hevc", "H.265 / HEVC"],
  ["av1", "AV1"],
  ["vp9", "VP9"],
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [nodeData, setNodeData] = useState<NodeData | null>(null);

  useEffect(() => {
    requestJson<Settings>("/api/settings")
      .then(setSettings)
      .catch((error) => toast.error(error.message));
    void loadNodes();
  }, []);

  async function loadNodes() {
    try {
      setNodeData(await requestJson<NodeData>("/api/nodes"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load nodes.",
        { id: "nodes-load-error" },
      );
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    try {
      setSettings(await requestJson("/api/settings", { method: "PUT", body: JSON.stringify(settings) }));
      await loadNodes();
      toast.success("Settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save.");
    }
  }

  if (!settings) return <p className="text-sm text-muted-foreground">Loading settings…</p>;

  const numberField = (key: keyof Settings, value: string) =>
    setSettings({ ...settings, [key]: Number(value) });

  return (
    <form onSubmit={submit} className="space-y-7">
      <PageHeader
        title="Settings"
        description="Global discovery, quality, and scheduling preferences."
        actions={<Button type="submit"><Save className="size-4" /> Save changes</Button>}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Discovery</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <Field label="Minimum file age" hint="Wait before new media can be queued.">
              <Input
                type="number"
                min="0"
                step="any"
                value={formatDurationValue(
                  settings.minimumFileAgeHours /
                    minimumFileAgeFactors[settings.minimumFileAgeUnit],
                )}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    minimumFileAgeHours:
                      Number(event.target.value) *
                      minimumFileAgeFactors[settings.minimumFileAgeUnit],
                  })
                }
              />
              <UnitSelect
                value={settings.minimumFileAgeUnit}
                options={[
                  ["minutes", "Minutes"],
                  ["hours", "Hours"],
                  ["days", "Days"],
                  ["weeks", "Weeks"],
                  ["months", "Months (30 days)"],
                ]}
                onChange={(unit) =>
                  setSettings({
                    ...settings,
                    minimumFileAgeUnit: unit as MinimumFileAgeUnit,
                  })
                }
              />
            </Field>
            <Field label="Scan interval" hint="How often enabled directories are checked.">
              <Input
                type="number"
                min={1 / scanIntervalFactors[settings.scanIntervalUnit]}
                step="any"
                value={formatDurationValue(
                  settings.scanIntervalMinutes /
                    scanIntervalFactors[settings.scanIntervalUnit],
                )}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    scanIntervalMinutes: Math.max(
                      1,
                      Math.round(
                        Number(event.target.value) *
                          scanIntervalFactors[settings.scanIntervalUnit],
                      ),
                    ),
                  })
                }
              />
              <UnitSelect
                value={settings.scanIntervalUnit}
                options={[
                  ["minutes", "Minutes"],
                  ["hours", "Hours"],
                  ["days", "Days"],
                ]}
                onChange={(unit) =>
                  setSettings({
                    ...settings,
                    scanIntervalUnit: unit as ScanIntervalUnit,
                  })
                }
              />
            </Field>
            <Field label="Automatic retries" hint="Retries after transient conversion failures.">
              <Input type="number" min="0" max="10" value={settings.automaticRetryCount} onChange={(event) => numberField("automaticRetryCount", event.target.value)} />
              <Suffix>retries</Suffix>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Encoding</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Quality profile</span>
              <select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={settings.qualityProfile} onChange={(event) => setSettings({ ...settings, qualityProfile: event.target.value as Settings["qualityProfile"] })}>
                <option value="high">High · CRF 18</option>
                <option value="balanced">Balanced · CRF 22</option>
                <option value="compact">Compact · CRF 26</option>
              </select>
              <p className="text-xs text-muted-foreground">Lower CRF preserves more detail and produces larger files.</p>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Maximum resolution</span>
              <select
                className="h-11 w-full rounded-xl border border-input bg-background/70 px-3 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
                value={settings.maximumResolution}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    maximumResolution: event.target
                      .value as Settings["maximumResolution"],
                  })
                }
              >
                <option value="keep">Keep resolution</option>
                <option value="8k">8K · 7680 × 4320</option>
                <option value="4k">4K · 3840 × 2160</option>
                <option value="1080p">1080p · 1920 × 1080</option>
                <option value="720p">720p · 1280 × 720</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Keep resolution applies no scaling. Other options only scale
                down sources that exceed the selected limit.
              </p>
            </label>
            <Field label="Minimum savings" hint="Keep the source when the output does not meet this threshold.">
              <Input type="number" min="0" max="99" value={settings.minimumSavingsPercent} onChange={(event) => numberField("minimumSavingsPercent", event.target.value)} />
              <Suffix>%</Suffix>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Eligible source codecs</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {codecs.map(([id, label]) => (
              <label key={id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-teal-400"
                  checked={settings.eligibleCodecs.includes(id)}
                  onChange={(event) => setSettings({
                    ...settings,
                    eligibleCodecs: event.target.checked
                      ? [...settings.eligibleCodecs, id]
                      : settings.eligibleCodecs.filter((codec) => codec !== id),
                  })}
                />
                {label}
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Daily conversion window</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div><p className="text-sm font-medium">Limit conversion times</p><p className="text-xs text-muted-foreground">Running jobs are allowed to finish.</p></div>
              <Switch checked={settings.scheduleEnabled} onCheckedChange={(checked) => setSettings({ ...settings, scheduleEnabled: checked })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2 text-sm"><span>Start</span><Input type="time" value={settings.scheduleStart} onChange={(event) => setSettings({ ...settings, scheduleStart: event.target.value })} /></label>
              <label className="space-y-2 text-sm"><span>End</span><Input type="time" value={settings.scheduleEnd} onChange={(event) => setSettings({ ...settings, scheduleEnd: event.target.value })} /></label>
            </div>
            <label className="block space-y-2 text-sm">
              <span>Timezone</span>
              <Input value={settings.timezone} placeholder="Etc/UTC" onChange={(event) => setSettings({ ...settings, timezone: event.target.value })} />
            </label>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerCog className="size-4 text-primary" />
              Remote transcoding nodes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field
              label="Coordinator URL"
              hint="Use an address remote hosts can reach, including http:// or https:// and the port."
            >
              <Input
                type="url"
                placeholder="http://192.168.1.20:3000"
                value={settings.nodeCoordinatorUrl}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    nodeCoordinatorUrl: event.target.value,
                  })
                }
              />
            </Field>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Enrollment command</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!nodeData?.command}
                  onClick={async () => {
                    if (!nodeData?.command) return;
                    await navigator.clipboard.writeText(nodeData.command);
                    toast.success("Enrollment command copied.");
                  }}
                >
                  <Copy className="size-3" />
                  Copy
                </Button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border bg-background/70 p-4 font-mono text-xs text-primary">
                <div># install cli or run with npx compressarr-node</div>
                <div className="mt-2">npm install -g compressarr-node</div>
                <div className="mt-2 whitespace-nowrap">
                  {nodeData?.command ?? "Generating enrollment command..."}
                </div>
              </div>
              {nodeData?.coordinatorUrl.includes("127.0.0.1") ||
              nodeData?.coordinatorUrl.includes("localhost") ? (
                <p className="text-xs text-amber-400">
                  Localhost cannot be reached from another computer. Set a LAN
                  address or externally accessible URL above and save settings.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium">{label}</span><span className="mt-2 flex items-center gap-2">{children}</span><span className="mt-1 block text-xs text-muted-foreground">{hint}</span></label>;
}

function Suffix({ children }: { children: React.ReactNode }) {
  return <span className="min-w-16 text-xs text-muted-foreground">{children}</span>;
}

function UnitSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="h-10 min-w-32 rounded-lg border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

function formatDurationValue(value: number): number {
  return Number(value.toFixed(4));
}
