import test from "node:test";
import assert from "node:assert/strict";
import { liveTransfers, stillApplies } from "@/lib/transfers";

const cutoff = "2026-11-21T11:00:00Z"; // GW11's deadline, passed: the forecast is on FPL's locked squad

test("with no cutoff (before the deadline) every saved transfer applies", () => {
  assert.equal(stillApplies({ out: 1, in: 2 }, null), true);
  assert.equal(stillApplies({ out: 1, in: 2, savedAt: "2026-11-01T00:00:00Z" }, undefined), true);
});

test("after it, only transfers saved since apply; old ones (or untimed) were plans for the locked week", () => {
  const saved = [
    { out: 1, in: 2 },
    { out: 3, in: 4, savedAt: "2026-11-21T10:59:00Z" },
    { out: 5, in: 6, savedAt: "2026-11-21T11:00:00Z" },
    { out: 7, in: 8, savedAt: "2026-11-22T09:00:00Z" },
  ];
  assert.deepEqual(liveTransfers(saved, cutoff).map((t) => t.out), [5, 7]);
  assert.equal(stillApplies({ out: 1, in: 2, savedAt: "soon" }, cutoff), false, "an unreadable time counts as before");
});
