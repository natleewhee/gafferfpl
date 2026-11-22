import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameBudget, MAX_GAP_MS, SAMPLE_FRAMES, SLOW_FRAME_MS, SLOW_WINDOWS, WARMUP_MS, clearFrameStats, latestFrameStats } from "@/lib/frameBudget";
import { lowPowerDevice, startIn2d } from "@/lib/device";

/** Feeds evenly spaced frames starting at `from` ms; returns the first verdict. */
function feed(b: FrameBudget, gap: number, frames: number, from = WARMUP_MS) {
  let t = from;
  for (let i = 0; i < frames; i++) {
    t += gap;
    const v = b.record(gap, t);
    if (v) return v;
  }
  return null;
}

test("frames in the warm-up are not counted, however slow", () => {
  const b = new FrameBudget(0);
  assert.equal(feed(b, 400, 3, 0), null); // shader compiling, hydration, players running on
  assert.equal(feed(b, 17, SAMPLE_FRAMES * SLOW_WINDOWS), null);
  assert.deepEqual(latestFrameStats(), { frames: SAMPLE_FRAMES, medianMs: 17, slow: false }, "kept for the problem report");
});

test("only slow windows in a row switch to 2D; one busy moment doesn't", () => {
  const slow = SLOW_FRAME_MS + 15;
  const b = new FrameBudget(0);
  assert.equal(feed(b, slow, SAMPLE_FRAMES), null, "one slow window");
  assert.equal(feed(b, 17, SAMPLE_FRAMES, 10_000), null, "then a quick one resets the count");
  const verdict = feed(b, slow, SAMPLE_FRAMES * SLOW_WINDOWS, 20_000);
  assert.deepEqual(verdict, { frames: SAMPLE_FRAMES, medianMs: slow, slow: true });
  assert.equal(b.record(500, 99_999), null, "one verdict only");
});

test("pauses don't count, and the 30 fps ambient passing is not slowness", () => {
  assert.equal(feed(new FrameBudget(0), MAX_GAP_MS + 1, 200), null);
  assert.equal(feed(new FrameBudget(0), 34, 200), null);
  assert.equal(feed(new FrameBudget(0), SLOW_FRAME_MS, 200), null, "exactly at the line is not slow");
});

test("choosing 3D again forgets the old figures", () => {
  feed(new FrameBudget(0), 17, SAMPLE_FRAMES);
  assert.ok(latestFrameStats());
  clearFrameStats();
  assert.equal(latestFrameStats(), null);
});

test("only very low-powered devices start in 2D; the crowd rule stays stricter", () => {
  assert.equal(startIn2d({ hardwareConcurrency: 4 }), false, "Safari reports 4 cores on fast iPhones");
  assert.equal(startIn2d({ hardwareConcurrency: 2 }), true);
  assert.equal(startIn2d({ hardwareConcurrency: 8, deviceMemory: 2 }), true);
  assert.equal(startIn2d({ hardwareConcurrency: 8, connection: { saveData: true } }), true);
  assert.equal(startIn2d(undefined), false, "server render: 3D, as before");
  assert.equal(lowPowerDevice({ hardwareConcurrency: 4 }), true, "no crowd on 4 cores, as before");
});
