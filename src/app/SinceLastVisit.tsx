"use client";

import { useEffect, useState } from "react";
import { readJson, writeJson } from "@/lib/storage";
import { VISIT_KEY, changesSince, snapshotOf, type VisitSnapshot } from "@/lib/sinceLastVisit";
import type { Forecast } from "@/lib/snapshots";

/* One line under the deadline banner, only when this team's forecast has changed since this browser
 * last showed it (see src/lib/sinceLastVisit.ts). It stays for this visit; the next visit compares
 * with what is on screen now. */
export default function SinceLastVisit({ teamId, forecast }: { teamId: string; forecast: Forecast }) {
  const [changes, setChanges] = useState<string[]>([]);
  const builtAt = forecast.generatedAt;

  useEffect(() => {
    const key = VISIT_KEY(teamId);
    const now = snapshotOf(forecast);
    const prev = readJson<VisitSnapshot | null>(key, null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after mount
    setChanges(changesSince(prev, now));
    writeJson(key, now);
    // only when the team or the build changes, not on every re-render of the same forecast
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, builtAt]);

  if (changes.length === 0) return null;
  return (
    <p className="text-xs leading-snug text-ink-soft" data-testid="since-last-visit">
      <span className="font-semibold text-ink">Since your last visit: </span>
      {changes.join(" · ")}
    </p>
  );
}
