import { createHash } from "node:crypto";
import { clientIp } from "./rateLimit.ts";

/* Three server routes (/api/live via liveInputs, /api/league, /api/league/squad)
 * call /api/forecast for a guest. Seen from api/forecast.py, those calls come
 * from Vercel's own outgoing address, so every guest would share one rate-limit
 * bucket (engine/ratelimit.py) and one busy spell would break Live and Leagues
 * for all of them. These headers pass on the visitor's own address, so each
 * guest is counted on their own. The address is only believed alongside a key
 * derived from OWNER_SECRET, which a caller outside the server can't know; with
 * no OWNER_SECRET set, no headers are sent and calls count as before. */

export const INTERNAL_KEY_HEADER = "x-gaffer-internal";
export const CLIENT_IP_HEADER = "x-gaffer-client-ip";

type Env = Record<string, string | undefined>;

/** Must match engine/ratelimit.py's internal_key(). */
export function internalKey(secret: string): string {
  return createHash("sha256").update(`gaffer-internal:${secret}`).digest("hex");
}

export function internalForecastHeaders(
  visitor: { get(name: string): string | null },
  env: Env = process.env,
): Record<string, string> {
  const secret = env.OWNER_SECRET;
  if (!secret) return {};
  return { [INTERNAL_KEY_HEADER]: internalKey(secret), [CLIENT_IP_HEADER]: clientIp(visitor) };
}
