/* Where each saved transfer has got to, from the forecast on screen and the latest rebuild run.
 * Pure, so it is unit-tested; the page and the API share it. */

export type RebuildRun = {
  /** queued / running: a rebuild is under way. done / failed: the latest one has finished. */
  status: "queued" | "running" | "done" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
};

export type TransferState =
  | "in-forecast" // the forecast on screen was built with it
  | "rebuilding" // a rebuild is running or queued
  | "rebuilt" // a rebuild finished after this forecast was built: the new one is deploying, reload to see it
  | "failed" // the latest rebuild failed: it waits for the next run (or a retry)
  | "waiting"; // saved; the next rebuild (or the daily run) will add it

export type SavedTransfer = { out: number; in: number };

/** One saved transfer. `squadIds` are the fifteen the forecast on screen was built for. */
export function transferState(
  t: SavedTransfer,
  squadIds: ReadonlySet<number>,
  forecastBuiltAt: string,
  run: RebuildRun | null,
): TransferState {
  if (squadIds.has(t.in) && !squadIds.has(t.out)) return "in-forecast";
  if (!run) return "waiting";
  if (run.status === "queued" || run.status === "running") return "rebuilding";
  const after = run.finishedAt != null && Date.parse(run.finishedAt) > Date.parse(forecastBuiltAt);
  if (!after) return "waiting";
  return run.status === "failed" ? "failed" : "rebuilt";
}

/** The one state that speaks for all of them: the one that needs you most comes first. */
const ORDER: TransferState[] = ["failed", "rebuilt", "rebuilding", "waiting", "in-forecast"];
export function overallState(states: TransferState[]): TransferState | null {
  if (!states.length) return null;
  return ORDER.find((s) => states.includes(s)) ?? "in-forecast";
}

/** Short words for the banner and the list. */
export const STATE_COPY: Record<TransferState, { short: string; long: string; tone: "accent" | "warn" | "danger" }> = {
  "in-forecast": { short: "in forecast", long: "In the forecast", tone: "accent" },
  rebuilding: { short: "rebuilding…", long: "Rebuilding the forecast (about 2 minutes)", tone: "warn" },
  rebuilt: { short: "rebuilt · reload", long: "Rebuilt: reload to see it", tone: "warn" },
  failed: { short: "rebuild failed", long: "The rebuild failed: retry, or it waits for the daily run (11:00 SGT)", tone: "danger" },
  waiting: { short: "waiting for rebuild", long: "Saved: waiting for the next rebuild", tone: "warn" },
};

/** GitHub's run fields as the API reads them. */
export function runFromGithub(r: { status: string; conclusion: string | null; run_started_at?: string | null; updated_at?: string | null } | undefined): RebuildRun | null {
  if (!r) return null;
  const active = ["queued", "in_progress", "waiting", "pending", "requested"];
  if (active.includes(r.status)) return { status: r.status === "in_progress" ? "running" : "queued", startedAt: r.run_started_at ?? null, finishedAt: null };
  return {
    status: r.conclusion === "success" ? "done" : "failed",
    startedAt: r.run_started_at ?? null,
    finishedAt: r.updated_at ?? null,
  };
}
