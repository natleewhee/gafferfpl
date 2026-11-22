/* Per-address attempt limit for POST /api/owner, the one route where guessing
 * pays (the owner key). Fixed window, kept in memory, so it is best effort:
 * each warm function instance counts on its own and a cold start resets it.
 * The real defence is a long random OWNER_SECRET (20+ characters), which no
 * number of guesses at this rate will find; this stops a script trying. The
 * Python twin, for the anonymous forecast and solver, is engine/ratelimit.py. */

const MAX_KEYS = 5000;

export class FailureLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  readonly limit: number;
  readonly windowMs: number;
  private now: () => number;

  // plain fields, not parameter properties: the unit tests run with Node's type stripping
  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Seconds until `key` may try again, or 0 if it may try now. */
  retryAfter(key: string): number {
    const w = this.windows.get(key);
    if (!w) return 0;
    const elapsed = this.now() - w.start;
    if (elapsed >= this.windowMs) {
      this.windows.delete(key);
      return 0;
    }
    return w.count >= this.limit ? Math.max(1, Math.ceil((this.windowMs - elapsed) / 1000)) : 0;
  }

  recordFailure(key: string): void {
    const now = this.now();
    const w = this.windows.get(key);
    const fresh = !w || now - w.start >= this.windowMs;
    this.windows.delete(key);
    this.windows.set(key, fresh ? { start: now, count: 1 } : { start: w.start, count: w.count + 1 });
    while (this.windows.size > MAX_KEYS) this.windows.delete(this.windows.keys().next().value!);
  }
}

/** The caller's address as Vercel reports it (`x-real-ip`, else the first `x-forwarded-for`). */
export function clientIp(headers: { get(name: string): string | null }): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
