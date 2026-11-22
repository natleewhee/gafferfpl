/* "Why this pick": up to three plain reasons behind a captain candidate or a suggested transfer, so a
 * friend who doesn't know how the model works can see what it is leaning on. Every reason is read from a
 * field the forecast payload already carries (fixtures and FDR, the xP breakdown, recent points, FPL form,
 * availability, price); none is model-written text, and a reason whose field is missing is left out
 * rather than guessed. Pure, so it is unit-tested. */

import type { OpponentLeg, PoolPlayer } from "./snapshots";

const f1 = (n: number) => n.toFixed(1);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** "@HUL (FDR 2)", "home to MCI (FDR 4)"; FDR left out when FPL gave none. */
export function legText(leg: OpponentLeg): string {
  const where = leg.wasHome ? `home to ${leg.team ?? "?"}` : `@${leg.team ?? "?"}`;
  return leg.fdrRating != null ? `${where} (FDR ${leg.fdrRating})` : where;
}

/** This gameweek's fixture(s), or that there is none. */
export function fixtureReason(legs: OpponentLeg[] | undefined): string | null {
  if (!legs) return null;
  if (legs.length === 0) return "No game this gameweek (blank)";
  if (legs.length === 1) return `Plays ${legText(legs[0])}`;
  return `Two games: ${legs.map(legText).join(" and ")}`;
}

const COMPONENT_LABELS: Record<string, string> = {
  goals: "goals",
  assists: "assists",
  cleanSheet: "clean sheet",
  bonus: "bonus",
  saves: "saves",
  defensiveContribution: "defensive contribution",
};

/** The two biggest scoring sources in the xP (appearance points left out: everyone who plays gets them). */
export function sourceReason(components: PoolPlayer["components"]): string | null {
  if (!components) return null;
  const parts = Object.entries(components)
    .filter(([k, v]) => k in COMPONENT_LABELS && typeof v === "number" && v >= 0.3)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 2);
  if (parts.length === 0) return null;
  return `Most of his xP from ${parts.map(([k, v]) => `${COMPONENT_LABELS[k]} ${f1(v as number)}`).join(" and ")}`;
}

/** Recent points if the payload has them, else FPL's form figure. */
export function formReason(p: Pick<PoolPlayer, "recentPoints" | "form">): string | null {
  const recent = (p.recentPoints ?? []).filter((x): x is number => x != null);
  if (recent.length >= 3) return `Last ${recent.length} gameweeks: ${recent.join(", ")} points`;
  if (typeof p.form === "number" && p.form > 0) return `FPL form ${f1(p.form)}`;
  return null;
}

/** Why the shortlist rates this player as a captain this gameweek (target week = index 0). */
export function captainReasons(p: PoolPlayer | undefined): string[] {
  if (!p) return [];
  return [fixtureReason(p.opponents?.[0]), sourceReason(p.components), formReason(p)].filter((r): r is string => !!r);
}

const flagged = (p: PoolPlayer) => p.availability?.status && p.availability.status !== "a";

/** Average FPL difficulty over the given weeks' fixtures, or null when FPL rated none. */
function avgFdr(p: PoolPlayer, weeks: number[]): number | null {
  const ratings = weeks.flatMap((w) => (p.opponents?.[w] ?? []).map((l) => l.fdrRating)).filter((r): r is number => r != null);
  return ratings.length ? sum(ratings) / ratings.length : null;
}

/** Why the plan swaps `out` for `inn` over `weeks` (indices into the forecast window). */
export function transferReasons(out: PoolPlayer | undefined, inn: PoolPlayer | undefined, weeks: number[]): string[] {
  if (!out || !inn || weeks.length === 0) return [];
  const reasons: string[] = [];
  const xpIn = sum(weeks.map((w) => inn.perGameweek[w] ?? 0));
  const xpOut = sum(weeks.map((w) => out.perGameweek[w] ?? 0));
  const span = weeks.length === 1 ? "this gameweek" : `over the next ${weeks.length} gameweeks`;
  reasons.push(`${xpIn >= xpOut ? "+" : "−"}${f1(Math.abs(xpIn - xpOut))} xP ${span} (${f1(xpIn)} vs ${f1(xpOut)})`);
  if (flagged(out)) {
    const chance = out.availability.chance;
    reasons.push(`${out.webName} is flagged${chance != null ? ` (${chance}% chance of playing)` : ""}${out.availability.news ? `: ${out.availability.news}` : ""}`);
  }
  const fIn = avgFdr(inn, weeks);
  const fOut = avgFdr(out, weeks);
  if (fIn != null && fOut != null && Math.abs(fIn - fOut) >= 0.5) {
    reasons.push(`${fIn < fOut ? "Easier" : "Harder"} fixtures: average FDR ${f1(fIn)} vs ${f1(fOut)}`);
  }
  if (reasons.length < 3) {
    const diff = inn.price - out.sellPrice;
    if (Math.abs(diff) >= 0.05) reasons.push(diff > 0 ? `Costs £${f1(diff)}m more than ${out.webName} sells for` : `Frees £${f1(-diff)}m in the bank`);
  }
  return reasons.slice(0, 3);
}
