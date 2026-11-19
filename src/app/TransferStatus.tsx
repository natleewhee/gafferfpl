"use client";

import { useCallback, useEffect, useState } from "react";
import { sgDayTime } from "@/lib/time";
import { REBUILD_CHECK_EVENT, rebuildNow, rebuildStatus } from "@/lib/transfersClient";
import { STATE_COPY, overallState, transferState, type RebuildRun, type SavedTransfer, type TransferState } from "@/lib/transferStatus";

/* Saved transfers that are not in the forecast yet, and where each has got to: rebuilding,
 * rebuilt (reload to see it), failed, or waiting. A line under the deadline banner on every tab
 * while there is one; tap it for the list and the one thing to do about it (retry, reload,
 * rebuild now). Once all are in, the banner's chip and the pitch's IN badges say so. Owner only. */

const TONE: Record<"accent" | "warn" | "danger", string> = {
  accent: "var(--accent)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

export default function TransferStatus({
  transfers,
  nameOf,
  squadIds,
  forecastBuiltAt,
}: {
  transfers: SavedTransfer[];
  nameOf: (id: number) => string;
  squadIds: ReadonlySet<number>;
  forecastBuiltAt: string;
}) {
  const [run, setRun] = useState<RebuildRun | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const needsRun = transfers.some((t) => !(squadIds.has(t.in) && !squadIds.has(t.out)));

  const check = useCallback(async () => setRun(await rebuildStatus()), []);

  // Whenever a transfer is saved or a rebuild is started, look again (listening even with no
  // transfers yet: the first save announces itself before this line has anything to show).
  useEffect(() => {
    let soon: ReturnType<typeof setTimeout> | undefined;
    const onCheck = () => {
      clearTimeout(soon);
      soon = setTimeout(check, 3000); // GitHub takes a moment to list a run it has just been asked for
    };
    window.addEventListener(REBUILD_CHECK_EVENT, onCheck);
    return () => {
      clearTimeout(soon);
      window.removeEventListener(REBUILD_CHECK_EVENT, onCheck);
    };
  }, [check]);
  // ask as soon as a transfer is not in the forecast, and again a few seconds on (a run just
  // dispatched is not listed at once), then every 15 s while one runs
  useEffect(() => {
    if (!needsRun) return;
    const first = setTimeout(check, 0);
    const again = setTimeout(check, 4000);
    return () => {
      clearTimeout(first);
      clearTimeout(again);
    };
  }, [needsRun, check]);
  const running = run?.status === "running" || run?.status === "queued";
  useEffect(() => {
    if (!needsRun || !running) return;
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [needsRun, running, check]);

  // all in the forecast: nothing to do, so no line (the deadline banner's chip and the pitch's IN
  // badges say so); the line takes its space only while there is something to wait for or act on
  if (!transfers.length || !needsRun) return null;
  const states: TransferState[] = transfers.map((t) => transferState(t, squadIds, forecastBuiltAt, run));
  const overall = overallState(states)!;
  const copy = STATE_COPY[overall];
  const color = TONE[copy.tone];
  const n = transfers.length;

  const rebuild = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await rebuildNow();
      if (r.rebuild === "scheduled") {
        // nothing started (no token, or GitHub refused): say so rather than show "rebuilding"
        setNote(r.hint ?? "Couldn't start a rebuild; the daily run (11:00 SGT) will pick it up.");
      } else {
        setNote(null);
        setRun({ status: "queued", startedAt: new Date().toISOString(), finishedAt: null });
      }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-1 mt-1" data-testid="transfer-status" data-state={overall}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-3 text-left text-xs"
        style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
      >
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${overall === "rebuilding" ? "animate-pulse" : ""}`} style={{ background: color }} />
        <span className="shrink-0 font-semibold text-ink">
          {n} saved transfer{n > 1 ? "s" : ""}
        </span>
        <span className="min-w-0 truncate font-semibold" style={{ color }}>
          {copy.short}
        </span>
        <span aria-hidden className="ml-auto shrink-0 text-ink-faint">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-2 rounded-lg border border-line px-3 py-2 text-xs">
          <ul className="space-y-1">
            {transfers.map((t, i) => {
              const c = STATE_COPY[states[i]];
              return (
                <li key={`${t.out}-${t.in}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-ink">
                    {nameOf(t.out)} {"→"} {nameOf(t.in)}
                  </span>
                  <span style={{ color: TONE[c.tone] }}>{c.long}</span>
                </li>
              );
            })}
          </ul>
          {run?.status === "running" && run.startedAt && <p className="text-ink-faint">Rebuild started {sgDayTime(run.startedAt)} SGT.</p>}
          {overall === "rebuilt" && (
            <button type="button" className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-line px-4 text-xs font-semibold text-ink-soft transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50" onClick={() => window.location.reload()}>
              Reload to see the new forecast
            </button>
          )}
          {(overall === "failed" || (overall === "waiting" && !running)) && (
            <button type="button" className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-line px-4 text-xs font-semibold text-ink-soft transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={rebuild}>
              {busy ? "Starting…" : overall === "failed" ? "Retry the rebuild" : "Rebuild now"}
            </button>
          )}
          {note && <p className="text-ink-faint">{note}</p>}
        </div>
      )}
    </div>
  );
}
