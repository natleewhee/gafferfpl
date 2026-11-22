import { NextRequest, NextResponse } from "next/server";
import { OWNER_COOKIE, isOwnerRequest, secretMatches } from "@/lib/ownerAuth";
import { FailureLimiter, clientIp } from "@/lib/rateLimit";

/** Unlocks (POST { secret }) or locks (DELETE) editing in this browser, and
 * reports whether it is currently unlocked (GET). */
export async function GET(req: NextRequest) {
  return NextResponse.json({ owner: isOwnerRequest(req), configured: Boolean(process.env.OWNER_SECRET) });
}

// 10 wrong keys per address per 10 minutes (see src/lib/rateLimit.ts).
const wrongKeys = new FailureLimiter(10, 10 * 60 * 1000);

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const wait = wrongKeys.retryAfter(ip);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Too many wrong keys. Try again in ${Math.ceil(wait / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }
  const body = await req.json().catch(() => null);
  const secret = typeof body?.secret === "string" ? body.secret : "";
  if (!secretMatches(secret)) {
    wrongKeys.recordFailure(ip);
    return NextResponse.json({ error: "That key doesn't match." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // plain-http dev (a phone on the LAN) would drop a secure cookie
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(OWNER_COOKIE);
  return res;
}
