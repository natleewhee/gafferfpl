import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* A real double and blank gameweek on screen. tests/test_double_blank_replay.py runs FPL's real
 * 2025/26 GW33 (six teams twice) and GW34 (six teams without a game) through the forecast builder as
 * this season's GW11 and GW12, and writes the result to data/double-blank-replay.json. Here a guest is
 * served that payload and the Team and Scenarios tabs must show it: two opponents in a double, a dash
 * in a blank, nothing cut off at 360px, and no page errors. Expected counts come from the payload. */

const ORIGIN = `http://localhost:${process.env.PW_PORT ?? 3123}`;
type Leg = { team: string };
type Week = { gameweek: number; captainId: number; players: { id: number; opponents: Leg[] }[] };
const replay = JSON.parse(readFileSync(join(__dirname, "data", "double-blank-replay.json"), "utf8"));
const [gw11, gw12] = replay.upcoming as Week[];
const doubles = gw11.players.filter((p) => p.opponents.length === 2).map((p) => p.id);
const blanks = gw12.players.filter((p) => p.opponents.length === 0).map((p) => p.id);
const nameOf = (id: number) => replay.squad.players.find((p: { id: number }) => p.id === id).webName as string;

let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try { localStorage.setItem("fpl-pitch-view", "2d"); } catch {}
  });
  await page.route("**/api/live*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.route("**/api/recap*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.route("**/api/forecast*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(replay) }));
});
test.afterEach(() => {
  expect(pageErrors, "no uncaught page errors").toEqual([]);
});

test("the replayed real double and blank weeks render on the Team tab at 360px", async ({ page, context }) => {
  expect(doubles.length, "the replay has doubles in the squad").toBeGreaterThan(0);
  expect(blanks.length, "and blanks").toBeGreaterThan(0);
  await context.addCookies([{ name: "fpl_team_id", value: "515151", url: ORIGIN }]);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?tab=squad");
  const ticker = page.getByTestId("fixture-ticker");
  await ticker.waitFor({ state: "attached" });
  await ticker.locator("summary").click();
  // every double in the squad shows both opponents, every blank a dash
  for (const id of doubles) {
    const row = ticker.locator("tr, [data-row]").filter({ hasText: nameOf(id) }).first();
    const cell = row.locator("[data-cell=double]").first();
    await expect(cell).toBeVisible();
    await expect(cell.locator("span.truncate")).toHaveCount(2);
  }
  expect(await ticker.locator("[data-cell=blank]").count()).toBeGreaterThanOrEqual(blanks.length);
  await expect(ticker.locator("[data-cell=blank]").first()).toHaveText("–");
  // the captain shortlist knows the pick has two games
  if (doubles.includes(gw11.captainId)) {
    await expect(page.getByTestId("captain-shortlist").locator("li[data-pick=true]")).toContainText("Double GW");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: test.info().outputPath("replay-team-360.png"), fullPage: true });
});

test("Scenarios plans through the replayed blank week without errors", async ({ page, context }) => {
  await context.addCookies([{ name: "fpl_team_id", value: "515151", url: ORIGIN }]);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?tab=scenarios");
  await expect(page.getByRole("tab", { name: /^Scenarios$/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/Top pick|Roll your transfer/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: test.info().outputPath("replay-scenarios-360.png"), fullPage: true });
});
