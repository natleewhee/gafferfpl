import test from "node:test";
import assert from "node:assert/strict";
import { overallState, runFromGithub, transferState, type RebuildRun } from "@/lib/transferStatus";

const built = "2026-11-18T07:52:26Z";
const squad = new Set([1, 2, 15]); // 15 came in for 154
const t1 = { out: 154, in: 15 };
const t2 = { out: 569, in: 379 }; // not in the forecast yet

test("a transfer the forecast was built with is in the forecast, whatever the run says", () => {
  assert.equal(transferState(t1, squad, built, null), "in-forecast");
  assert.equal(transferState(t1, squad, built, { status: "failed", startedAt: null, finishedAt: "2026-11-18T07:54:24Z" }), "in-forecast");
});

test("one not in it yet: rebuilding, rebuilt (reload), failed or waiting", () => {
  const later = "2026-11-18T07:52:43Z"; // started after this forecast was built
  const run = (status: RebuildRun["status"], startedAt: string | null, finishedAt: string | null): RebuildRun => ({ status, startedAt, finishedAt });
  assert.equal(transferState(t2, squad, built, run("running", later, null)), "rebuilding");
  assert.equal(transferState(t2, squad, built, run("queued", null, null)), "rebuilding");
  assert.equal(transferState(t2, squad, built, run("done", later, "2026-11-18T07:54:24Z")), "rebuilt");
  assert.equal(transferState(t2, squad, built, run("failed", later, "2026-11-18T07:54:24Z")), "failed");
  assert.equal(transferState(t2, squad, built, run("failed", "2026-11-18T06:00:00Z", "2026-11-18T07:00:00Z")), "waiting", "a failure before this forecast is old news");
  assert.equal(transferState(t2, squad, built, null), "waiting");
});

test("the run that built the forecast on screen is not a newer one, though it finished after it", () => {
  // compute_forecast writes generatedAt mid-run; the run's own finish comes a minute later
  const same: RebuildRun = { status: "done", startedAt: "2026-11-18T07:50:50Z", finishedAt: "2026-11-18T07:52:39Z" };
  assert.equal(transferState(t2, squad, built, same), "waiting", "a transfer this run skipped (or saved after it read them) waits, not 'reload'");
});

test("the banner shows the state that needs you most", () => {
  assert.equal(overallState([]), null);
  assert.equal(overallState(["in-forecast", "in-forecast"]), "in-forecast");
  assert.equal(overallState(["in-forecast", "rebuilding"]), "rebuilding");
  assert.equal(overallState(["rebuilding", "failed"]), "failed");
  assert.equal(overallState(["waiting", "rebuilt"]), "rebuilt");
});

test("GitHub's run fields map onto the four run states", () => {
  assert.equal(runFromGithub(undefined), null);
  assert.equal(runFromGithub({ status: "in_progress", conclusion: null })?.status, "running");
  assert.equal(runFromGithub({ status: "queued", conclusion: null })?.status, "queued");
  assert.equal(runFromGithub({ status: "completed", conclusion: "success", updated_at: "x" })?.status, "done");
  assert.equal(runFromGithub({ status: "completed", conclusion: "failure" })?.status, "failed");
  assert.equal(runFromGithub({ status: "completed", conclusion: "cancelled" })?.status, "failed");
});
