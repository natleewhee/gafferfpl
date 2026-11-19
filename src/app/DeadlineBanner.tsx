"use client";

import { useEffect, useState } from "react";
import { countdown, sgDayTime } from "@/lib/time";

/* A one-line reminder under the team bar, on every tab, while a deadline is
 * ahead: how long is left and when it is in Singapore time. One line, never
 * wrapped. It turns amber inside a day and red inside three hours. "Now" is read after mount because this page is
 * built statically. Saved transfers the forecast is built with show as a tick here;
 * ones still on their way have their own line under it (TransferStatus). */

function sgDeadline(iso: string): string {
  return `${sgDayTime(iso)} SGT`;
}

export default function DeadlineBanner({
  deadline,
  gameweek,
  transfersIn = 0,
}: {
  deadline: string | null | undefined;
  gameweek: number;
  /** Saved transfers the forecast is already built with (all of them): a quiet tick. */
  transfersIn?: number;
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNowMs(Date.now()), 0);
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!deadline || nowMs == null) return null;
  const msLeft = Date.parse(deadline) - nowMs;
  if (!Number.isFinite(msLeft) || msLeft <= 0) return null;

  const hours = msLeft / 3_600_000;
  const tone =
    hours < 3
      ? { key: "soon", color: "var(--danger)" }
      : hours < 24
        ? { key: "today", color: "var(--warn)" }
        : { key: "next", color: "var(--accent)" };

  return (
    <div
      role="status"
      data-testid="deadline-banner"
      data-tone={tone.key}
      className="mx-1 mt-1 flex items-center gap-x-2 overflow-hidden whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs"
      style={{
        borderColor: `color-mix(in srgb, ${tone.color} 40%, transparent)`,
        background: `color-mix(in srgb, ${tone.color} 8%, transparent)`,
      }}
    >
      <span className="shrink-0 font-semibold" style={{ color: tone.color }}>
        GW{gameweek} deadline
        {tone.key !== "next" && (
          <span className="ml-1 text-xs font-bold uppercase tracking-wide">{tone.key === "soon" ? "soon" : "today"}</span>
        )}
      </span>
      <span className="shrink-0 font-mono font-semibold tabular-nums text-ink">{countdown(deadline, nowMs)}</span>
      <span className="min-w-0 truncate text-ink-faint">{sgDeadline(deadline)}</span>
      {transfersIn > 0 && (
        <span className="chip ml-auto shrink-0" data-testid="transfers-in-forecast" style={{ color: "var(--accent)" }}>
          <span aria-hidden>{transfersIn} in forecast {"\u2713"}</span>
          <span className="sr-only">
            {transfersIn} saved transfer{transfersIn > 1 ? "s" : ""}, in the forecast
          </span>
        </span>
      )}
    </div>
  );
}
