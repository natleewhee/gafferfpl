/* "Since your last visit": what changed in this team's forecast between the last time this browser
 * opened it and now. A friend opens the app once or twice a gameweek; this is the line that makes the
 * second visit worth it. Stored only in this browser (localStorage, one small record per team), with no
 * notifications. Pure, so it is unit-tested; the component reads and writes storage.
 *
 * What counts as a change (at most three, most useful first):
 *  1. the forecast has moved on to a new gameweek
 *  2. the model's captain pick changed (same gameweek only)
 *  3. a squad player newly flagged by FPL (injury, suspension, doubt)
 *  4. the biggest xP move among the 15, if it is at least 1 point (same gameweek only)
 * The first visit, and a visit with no new build since the last, show nothing. */

import type { Forecast } from "./snapshots";

export const VISIT_KEY = (teamId: string) => `gaffer-last-visit:${teamId}`;
export const MIN_XP_MOVE = 1;

export type VisitSnapshot = {
  builtAt: string;
  gameweek: number;
  captainId: number | null;
  /** squad player id -> [name, xP for the target week, flagged] */
  players: Record<string, [string, number, boolean]>;
};

type ForecastLike = Pick<Forecast, "generatedAt" | "targetGameweek" | "squad" | "upcoming">;

const isFlagged = (status: string | null | undefined) => !!status && status !== "a";

export function snapshotOf(f: ForecastLike): VisitSnapshot {
  const players: VisitSnapshot["players"] = {};
  for (const p of f.squad.players) {
    players[String(p.id)] = [p.webName, p.projectedPoints ?? 0, isFlagged(p.availability?.status)];
  }
  return { builtAt: f.generatedAt, gameweek: f.targetGameweek, captainId: f.upcoming[0]?.captainId ?? null, players };
}

/** What is kept per team: the forecast last shown, and the one before it (see visitChanges). */
export type VisitRecord = { prev: VisitSnapshot | null; now: VisitSnapshot };

/** The changes to show on this visit, and the record to keep. Reloading the same build (or React
 * running the effect twice in development) shows the same changes again, compared with the build
 * before it, rather than comparing the build with itself and showing nothing. */
export function visitChanges(stored: VisitRecord | VisitSnapshot | null, now: VisitSnapshot): { changes: string[]; keep: VisitRecord } {
  // an older record held a bare snapshot
  const record: VisitRecord | null = stored && "now" in stored ? stored : stored ? { prev: null, now: stored as VisitSnapshot } : null;
  if (record && record.now.builtAt === now.builtAt) {
    return { changes: changesSince(record.prev, now), keep: { prev: record.prev, now } };
  }
  const prev = record?.now ?? null;
  return { changes: changesSince(prev, now), keep: { prev, now } };
}

const f1 = (n: number) => n.toFixed(1);

/** The changes worth a line, or [] when there is nothing new (or no earlier visit to compare with). */
export function changesSince(prev: VisitSnapshot | null, now: VisitSnapshot): string[] {
  if (!prev || prev.builtAt === now.builtAt) return [];
  const out: string[] = [];
  const sameWeek = prev.gameweek === now.gameweek;
  const name = (id: number | null) => (id == null ? null : (now.players[String(id)]?.[0] ?? prev.players[String(id)]?.[0] ?? null));
  if (!sameWeek) out.push(`Now forecasting GW${now.gameweek}`);
  if (sameWeek && prev.captainId !== now.captainId && now.captainId != null) {
    const was = name(prev.captainId);
    out.push(`Captain pick now ${name(now.captainId)}${was ? ` (was ${was})` : ""}`);
  }
  const newlyFlagged = Object.entries(now.players)
    .filter(([id, [, , flagged]]) => flagged && prev.players[id] && !prev.players[id][2])
    .map(([, [n]]) => n);
  if (newlyFlagged.length) out.push(`New FPL flag: ${newlyFlagged.join(", ")}`);
  if (sameWeek) {
    let best: { name: string; from: number; to: number } | null = null;
    for (const [id, [n, xp]] of Object.entries(now.players)) {
      const before = prev.players[id]?.[1];
      if (before == null) continue;
      if (Math.abs(xp - before) >= MIN_XP_MOVE && (!best || Math.abs(xp - before) > Math.abs(best.to - best.from))) {
        best = { name: n, from: before, to: xp };
      }
    }
    if (best) out.push(`${best.name} ${f1(best.from)} → ${f1(best.to)} xP`);
  }
  return out.slice(0, 3);
}
