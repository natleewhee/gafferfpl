import { test } from "node:test";
import assert from "node:assert/strict";
import { changesSince, type VisitSnapshot } from "@/lib/sinceLastVisit";

const snap = (over: Partial<VisitSnapshot> = {}): VisitSnapshot => ({
  builtAt: "2026-11-21T03:00:00Z",
  gameweek: 12,
  captainId: 1,
  players: { "1": ["Haaland", 7.2, false], "2": ["Saka", 6.1, false], "3": ["Gabriel", 4.0, false] },
  ...over,
});

test("first visit, or no new build since: nothing to say", () => {
  assert.deepEqual(changesSince(null, snap()), []);
  assert.deepEqual(changesSince(snap(), snap({ captainId: 2 })), [], "same build: nothing new");
});

test("same gameweek: captain change, new flag and the biggest xP move, in that order", () => {
  const now = snap({
    builtAt: "2026-11-22T03:00:00Z",
    captainId: 2,
    players: { "1": ["Haaland", 4.9, true], "2": ["Saka", 7.4, false], "3": ["Gabriel", 4.3, false] },
  });
  assert.deepEqual(changesSince(snap(), now), [
    "Captain pick now Saka (was Haaland)",
    "New FPL flag: Haaland",
    "Haaland 7.2 → 4.9 xP",
  ]);
});

test("small moves and already-flagged players are not news", () => {
  const prev = snap({ players: { "1": ["Haaland", 7.2, true], "2": ["Saka", 6.1, false] } });
  const now = snap({ builtAt: "x", players: { "1": ["Haaland", 7.0, true], "2": ["Saka", 6.8, false] } });
  assert.deepEqual(changesSince(prev, now), []);
});

test("a new gameweek: says so, still names new flags, but compares no xP across weeks", () => {
  const now = snap({
    builtAt: "x",
    gameweek: 13,
    captainId: 3,
    players: { "1": ["Haaland", 2.0, false], "2": ["Saka", 6.1, true], "3": ["Gabriel", 4.0, false] },
  });
  assert.deepEqual(changesSince(snap(), now), ["Now forecasting GW13", "New FPL flag: Saka"]);
});

test("a player bought since the last visit is not compared with anyone", () => {
  const now = snap({ builtAt: "x", players: { "1": ["Haaland", 7.2, false], "9": ["Gyökeres", 9.9, true] } });
  assert.deepEqual(changesSince(snap(), now), []);
});
