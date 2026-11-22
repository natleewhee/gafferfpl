import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameBudget, MAX_GAP_MS, SAMPLE_FRAMES, SLOW_FRAME_MS, WARMUP_FRAMES, latestFrameStats } from "@/lib/frameBudget";
import { lowPowerDevice, startIn2d } from "@/lib/device";

const feed = (b: FrameBudget, gaps: number[]) => gaps.map((g) => b.record(g)).find((v) => v) ?? null;

test("warm-up frames are skipped, then a verdict comes once, after enough frames", () => {
  const b = new FrameBudget();
  const slowStart = Array(WARMUP_FRAMES).fill(400); // shader compiling: slow everywhere, not counted
  const verdict = feed(b, [...slowStart, ...Array(SAMPLE_FRAMES).fill(17)]);
  assert.deepEqual(verdict, { frames: SAMPLE_FRAMES, medianMs: 17, slow: false });
  assert.equal(b.record(500), null, "one verdict only");
  assert.deepEqual(latestFrameStats(), verdict, "kept for the problem report");
});

test("a phone drawing under 20 frames a second is too slow; pauses don't count", () => {
  const b = new FrameBudget();
  const v = feed(b, [...Array(WARMUP_FRAMES).fill(16), ...Array(SAMPLE_FRAMES).fill(SLOW_FRAME_MS + 15), MAX_GAP_MS + 1]);
  assert.equal(v?.slow, true);
  const c = new FrameBudget();
  assert.equal(feed(c, Array(WARMUP_FRAMES + SAMPLE_FRAMES).fill(MAX_GAP_MS + 1)), null, "tab switches are not frames");
});

test("the 30 fps ambient passing is not mistaken for slowness", () => {
  const b = new FrameBudget();
  assert.equal(feed(b, Array(WARMUP_FRAMES + SAMPLE_FRAMES).fill(34))?.slow, false);
});

test("only very low-powered devices start in 2D; the crowd rule stays stricter", () => {
  assert.equal(startIn2d({ hardwareConcurrency: 4 }), false, "Safari reports 4 cores on fast iPhones");
  assert.equal(startIn2d({ hardwareConcurrency: 2 }), true);
  assert.equal(startIn2d({ hardwareConcurrency: 8, deviceMemory: 2 }), true);
  assert.equal(startIn2d({ hardwareConcurrency: 8, connection: { saveData: true } }), true);
  assert.equal(startIn2d(undefined), false, "server render: 3D, as before");
  assert.equal(lowPowerDevice({ hardwareConcurrency: 4 }), true, "no crowd on 4 cores, as before");
});
