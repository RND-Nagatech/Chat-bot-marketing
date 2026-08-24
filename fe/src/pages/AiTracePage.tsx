import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, RefreshCw, SearchCode } from "lucide-react";
import { getAiTraceRun, getAiTraceRuns } from "@/services/api";
import type { AiTraceRun } from "@/types";
import { toast } from "sonner";

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusClass(status: AiTraceRun["status"]) {
  if (status === "completed") return "bg-primary/10 text-primary";
  if (status === "failed") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

export default function AiTracePage() {
  const [runs, setRuns] = useState<AiTraceRun[]>([]);
  const [selected, setSelected] = useState<AiTraceRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadRuns = async () => {
    setLoading(true);
    try {
      const data = await getAiTraceRuns(50);
      setRuns(data);
      if (!selected && data[0]) {
        await loadRun(data[0].run_id);
      }
    } catch {
      toast.error("Gagal memuat AI trace");
    } finally {
      setLoading(false);
    }
  };

  const loadRun = async (runId: string) => {
    setDetailLoading(true);
    try {
      const data = await getAiTraceRun(runId);
      setSelected(data);
    } catch {
      toast.error("Gagal memuat detail trace");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadRuns();
  }, []);

  const selectedEvents = useMemo(() => selected?.events || [], [selected]);

  return (
    <div className="space-y-6">
      <div className="surface-panel flex flex-col gap-4 rounded-lg p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">AI Trace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect proses Qdrant, prompt DeepSeek, jawaban final, dan alasan follow-up admin.
          </p>
        </div>
        <button
          onClick={loadRuns}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold text-foreground">Run Terbaru</h2>
          </div>
          <div className="max-h-[680px] divide-y overflow-auto">
            {loading ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">Memuat trace...</div>
            ) : runs.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">Belum ada trace AI</div>
            ) : (
              runs.map((run) => (
                <button
                  key={run.run_id}
                  onClick={() => loadRun(run.run_id)}
                  className={`block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    selected?.run_id === run.run_id ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{run.phone || "Unknown"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{run.user_message}</div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    {formatTime(run.started_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold text-foreground">Detail Run</h2>
          </div>
          {!selected ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Pilih trace untuk melihat detail.</div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Source</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{selected.source || "-"}</div>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Confidence</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{(selected.confidence || 0).toFixed(3)}</div>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Follow-Up</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                    {selected.follow_up?.needed ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    )}
                    {selected.follow_up?.needed ? "Pending" : "Tidak"}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-background p-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Customer</div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{selected.user_message}</p>
              </div>

              {selected.answer && (
                <div className="rounded-lg border bg-background p-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Jawaban AI</div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{selected.answer}</p>
                </div>
              )}

              {selected.follow_up?.needed && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <div className="mb-1 text-xs font-medium text-destructive">Alasan Follow-Up</div>
                  <p className="text-sm text-foreground">{selected.follow_up.reason || "-"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selected.follow_up.summary || "-"}</p>
                </div>
              )}

              <div className="rounded-lg border bg-background">
                <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold text-foreground">
                  <SearchCode className="h-4 w-4 text-primary" />
                  Events
                </div>
                {detailLoading ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">Memuat event...</div>
                ) : (
                  <div className="divide-y">
                    {selectedEvents.map((event) => (
                      <details key={`${event.sequence}-${event.type}`} className="group px-3 py-3">
                        <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-foreground">
                          <span>{event.sequence}. {event.type}</span>
                          <span className="text-xs text-muted-foreground">{formatTime(event.timestamp)}</span>
                        </summary>
                        <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
                          {JSON.stringify(event.data, null, 2)}
                        </pre>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
