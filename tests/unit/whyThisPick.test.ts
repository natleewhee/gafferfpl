import { test } from "node:test";
import assert from "node:assert/strict";
import { captainReasons, fixtureReason, formReason, sourceReason, transferReasons } from "@/lib/whyThisPick";
import type { PoolPlayer } from "@/lib/snapshots";

const player = (over: Partial<PoolPlayer>): PoolPlayer => ({
  id: 1, webName: "Saka", team: "ARS", elementType: 3, position: "MID", price: 10, sellPrice: 10,
  selectedByPercent: 40, form: 6.2, perGameweek: [6, 5, 4], total: 15,
  opponents: [[{ team: "NEW", wasHome: false, fdrRating: 3 }], [{ team: "BUR", wasHome: true, fdrRating: 2 }], [{ team: "MCI", wasHome: false, fdrRating: 5 }]],
  availability: { status: "a", chance: null, news: null, risks: [] } as PoolPlayer["availability"],
  components: { appearance: 2, goals: 1.9, assists: 0.8, cleanSheet: 0.1, bonus: 0.6, saves: 0, cards: -0.1, goalsConceded: 0, defensiveContribution: 0 } as PoolPlayer["components"],
  ...over,
});

test("fixtures read as plain words, including blanks and doubles", () => {
  assert.equal(fixtureReason([{ team: "NEW", wasHome: false, fdrRating: 3 }]), "Plays @NEW (FDR 3)");
  assert.equal(fixtureReason([]), "No game this gameweek (blank)");
  assert.equal(
    fixtureReason([{ team: "NEW", wasHome: false, fdrRating: 3 }, { team: "BUR", wasHome: true, fdrRating: null }]),
    "Two games: @NEW (FDR 3) and home to BUR",
  );
  assert.equal(fixtureReason(undefined), null);
});

test("the xP source names the two biggest scoring parts, never appearance points", () => {
  assert.equal(sourceReason(player({}).components), "Biggest sources of his xP: goals 1.9 and assists 0.8");
  assert.equal(sourceReason(null), null);
});

test("form prefers real recent points, else FPL form, else nothing", () => {
  assert.equal(formReason({ recentPoints: [9, null, 2, 11], form: 3 }), "Last 4 gameweeks: 9, –, 2, 11 points", "a missed week is a dash, not skipped");
  assert.equal(formReason({ recentPoints: [], form: 6.2 }), "FPL form 6.2");
  assert.equal(formReason({ recentPoints: undefined, form: 0 }), null);
});

test("a captain gets at most three reasons, all from his own fields", () => {
  const r = captainReasons(player({ recentPoints: [8, 12, 3, 6, 2] }));
  assert.deepEqual(r, ["Plays @NEW (FDR 3)", "Biggest sources of his xP: goals 1.9 and assists 0.8", "Last 5 gameweeks: 8, 12, 3, 6, 2 points"]);
  assert.deepEqual(captainReasons(undefined), []);
});

test("a transfer: xP gain over the horizon, a flag on the man out, easier fixtures", () => {
  const out = player({
    id: 2, webName: "Jackson", perGameweek: [2, 2, 2], sellPrice: 7.2,
    availability: { status: "d", chance: 50, news: "Knock", risks: [] } as PoolPlayer["availability"],
    opponents: [[{ team: "MCI", wasHome: false, fdrRating: 5 }], [{ team: "LIV", wasHome: true, fdrRating: 4 }], [{ team: "ARS", wasHome: false, fdrRating: 5 }]],
  });
  const inn = player({ id: 3, webName: "Evanilson", perGameweek: [4, 3.5, 3], price: 6.5 });
  assert.deepEqual(transferReasons(out, inn, [0, 1, 2]), [
    "+4.5 xP over the next 3 gameweeks (10.5 vs 6.0)",
    "Jackson is flagged (50% chance of playing): Knock",
    "Easier fixtures: average FDR 3.3 vs 4.7",
  ]);
});

test("a one-week transfer with nothing else to say mentions the money", () => {
  const out = player({ id: 2, webName: "Hall", perGameweek: [3, 3], price: 5.0, opponents: [[{ team: "X", wasHome: true, fdrRating: 3 }], []] });
  const inn = player({ id: 3, webName: "Gabriel", perGameweek: [5.2, 1], price: 6.1, opponents: [[{ team: "Y", wasHome: true, fdrRating: 3 }], []] });
  assert.deepEqual(transferReasons(out, inn, [0]), ["+2.2 xP this gameweek (5.2 vs 3.0)", "£1.1m dearer than Hall"]);
  assert.equal(transferReasons(out, inn, [1], "in GW13")[0], "−2.0 xP in GW13 (1.0 vs 3.0)", "a later plan week is named");
  assert.deepEqual(transferReasons(undefined, inn, [0]), [], "no guessing when a player is missing from the pool");
});
