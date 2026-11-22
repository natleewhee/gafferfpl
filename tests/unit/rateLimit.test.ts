import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { FailureLimiter, clientIp } from "@/lib/rateLimit";
import { RATE_LIMITED_MESSAGE, forecastErrorMessage } from "@/lib/forecastErrors";
import { CLIENT_IP_HEADER, INTERNAL_KEY_HEADER, internalForecastHeaders, internalKey } from "@/lib/internalCall";

test("wrong keys are counted per address and blocked past the limit", () => {
  let now = 0;
  const lim = new FailureLimiter(2, 60_000, () => now);
  assert.equal(lim.retryAfter("a"), 0);
  lim.recordFailure("a");
  lim.recordFailure("a");
  now = 10_000;
  assert.equal(lim.retryAfter("a"), 50);
  assert.equal(lim.retryAfter("b"), 0);
  now = 60_000;
  assert.equal(lim.retryAfter("a"), 0, "a new window starts fresh");
});

test("clientIp prefers x-real-ip, then the first x-forwarded-for", () => {
  assert.equal(clientIp(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" })), "5.6.7.8");
  assert.equal(clientIp(new Headers()), "unknown");
});

test("a 429 from the forecast reads as a plain wait-and-retry message", () => {
  assert.equal(forecastErrorMessage(429, "16"), RATE_LIMITED_MESSAGE);
  assert.equal(forecastErrorMessage(429, "16", false), RATE_LIMITED_MESSAGE);
});

test("POST /api/owner refuses after 10 wrong keys from one address, even with the right key", async () => {
  process.env.OWNER_SECRET = "a-long-random-owner-secret-for-tests";
  const { POST } = await import("../../src/app/api/owner/route.ts");
  const post = (secret: string, ip = "7.7.7.7") =>
    POST(
      new NextRequest("http://localhost/api/owner", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": ip },
        body: JSON.stringify({ secret }),
      }),
    );
  assert.equal((await post(process.env.OWNER_SECRET)).status, 200, "the right key works");
  for (let i = 0; i < 10; i++) assert.equal((await post("wrong")).status, 401);
  const blocked = await post(process.env.OWNER_SECRET);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await post(process.env.OWNER_SECRET, "8.8.8.8")).status, 200, "other addresses are unaffected");
});

test("server-to-forecast calls pass on the visitor's address with a key only the server knows", () => {
  assert.equal(internalKey("s"), "2ee61914b5a1fa19a98507798593fe7cc7ec1dec529a50b2487b301ce7a471c4"); // same value pinned in tests/test_ratelimit.py
  const visitor = new Headers({ "x-real-ip": "1.2.3.4" });
  const h = internalForecastHeaders(visitor, { OWNER_SECRET: "s" });
  assert.equal(h[INTERNAL_KEY_HEADER], internalKey("s"));
  assert.equal(h[CLIENT_IP_HEADER], "1.2.3.4");
  assert.deepEqual(internalForecastHeaders(visitor, {}), {}, "no OWNER_SECRET, nothing to vouch with");
});
