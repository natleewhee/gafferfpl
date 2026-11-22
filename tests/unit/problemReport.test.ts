import { test } from "node:test";
import assert from "node:assert/strict";
import { problemReport, shortDevice } from "@/lib/problemReport";

const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

test("the device line names the OS and browser, not the whole user agent", () => {
  assert.equal(shortDevice(PIXEL), "Android 14, Chrome/131");
  assert.equal(shortDevice(IPHONE), "iPhone OS 18.1, Version/18.1 Safari");
  assert.equal(shortDevice("curl/8"), "unknown OS, unknown browser");
});

test("a report carries what's needed to reproduce, and nothing is invented", () => {
  const text = problemReport({
    teamId: "424242",
    view: "Team · Now",
    targetGameweek: 12,
    basedOnGameweek: 11,
    forecastBuiltAt: "2026-11-22T03:10:00Z",
    build: "6b73459",
    url: "https://fplforecast.vercel.app/?team=424242",
    userAgent: PIXEL,
    viewport: { width: 412, height: 915, dpr: 2.6 },
    pitch: "3d",
    now: new Date("2026-11-22T10:00:00Z"),
  });
  for (const part of ["Team ID: 424242", "Screen: Team · Now", "GW12 (from GW11 squad), built 2026-11-22T03:10:00Z",
    "Build: 6b73459", "Android 14, Chrome/131, 412x915 @2.6x, pitch 3d", "Time: 2026-11-22T10:00:00.000Z"]) {
    assert.ok(text.includes(part), part);
  }
  assert.match(text, /What happened: \(write it here\)/);
});

test("with no forecast yet it says so", () => {
  const text = problemReport({ teamId: "", view: "Team ID screen", url: "x", userAgent: "", viewport: { width: 1, height: 1, dpr: 1 }, now: new Date(0) });
  assert.match(text, /Forecast: no forecast loaded/);
  assert.match(text, /Team ID: none/);
  assert.match(text, /Build: unknown/);
});
