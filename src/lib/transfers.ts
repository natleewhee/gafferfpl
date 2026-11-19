/** savedAt: when it was saved (ISO). Missing on transfers saved before it was recorded. */
export type PendingTransfer = { out: number; in: number; note?: string; savedAt?: string };

export function sameTransfer(a: PendingTransfer, b: PendingTransfer): boolean {
  return a.out === b.out && a.in === b.in;
}

/** Drops repeats of an identical out/in pair, keeping the first. A second copy
 * can never apply -- its "out" player is already gone. */
export function dedupeTransfers(transfers: PendingTransfer[]): PendingTransfer[] {
  return transfers.filter((t, i) => transfers.findIndex((u) => sameTransfer(t, u)) === i);
}

/** Once a gameweek's deadline has passed the forecast builds from the squad FPL locked in
 * (`cutoff` is that deadline). A transfer saved before it was a plan for that week: it is in
 * the live squad if it was made, and void if it was not. Only ones saved since still apply.
 * Transfers with no savedAt (saved before it was recorded) count as before. */
export function stillApplies(t: PendingTransfer, cutoff: string | null | undefined): boolean {
  if (!cutoff) return true;
  const saved = t.savedAt ? parseUtc(t.savedAt) : NaN;
  return Number.isFinite(saved) && saved >= parseUtc(cutoff);
}
/** An ISO time, read as UTC when it carries no zone (as the forecast build reads it), not local. */
function parseUtc(iso: string): number {
  return Date.parse(/(Z|[+-]\d\d:?\d\d)$/i.test(iso) || !iso.includes("T") ? iso : `${iso}Z`);
}
export const liveTransfers = (transfers: PendingTransfer[], cutoff: string | null | undefined) =>
  transfers.filter((t) => stillApplies(t, cutoff));
