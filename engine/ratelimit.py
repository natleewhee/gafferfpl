"""A small per-visitor request limit for the anonymous Python functions
(api/forecast.py, api/solve.py), which run the model or the solver for
anyone who calls them.

Fixed window, counted in memory, so it is best effort: each warm function
instance keeps its own counts, and a cold start begins again at zero. That
is enough to stop one script hammering the API from one address, which is
the realistic risk at this app's size. A Vercel Firewall rate-limit rule
(one is free on Hobby) is the stronger control and can sit in front of it.

Only requests that reach the function are counted. A forecast the CDN
already holds (s-maxage=900) never gets here, so repeat visits to the same
team cost nothing against the limit.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from collections import OrderedDict
from typing import Mapping

# Enough addresses for any real traffic; the oldest window is dropped past this.
MAX_KEYS = 5000


INTERNAL_KEY_HEADER = "x-gaffer-internal"
CLIENT_IP_HEADER = "x-gaffer-client-ip"


def internal_key(secret: str) -> str:
    """Must match src/lib/internalCall.ts's internalKey()."""
    return hashlib.sha256(f"gaffer-internal:{secret}".encode()).hexdigest()


def client_ip(headers: Mapping[str, str] | object, secret: str | None = None) -> str:
    """The caller's address as Vercel reports it. Vercel sets `x-real-ip` and
    overwrites `x-forwarded-for`, so a caller can't choose their own key.

    The app's own server routes (/api/live, /api/league) call this function on a
    guest's behalf from Vercel's address; they send the guest's address in
    `x-gaffer-client-ip` with a key derived from OWNER_SECRET, so each guest is
    counted on their own (see src/lib/internalCall.ts). Without the right key
    that header is ignored."""
    get = getattr(headers, "get")
    secret = os.environ.get("OWNER_SECRET") if secret is None else secret
    given = (get(INTERNAL_KEY_HEADER) or "").strip()
    forwarded_for = (get(CLIENT_IP_HEADER) or "").strip()
    if secret and given and forwarded_for and hmac.compare_digest(given, internal_key(secret)):
        return forwarded_for
    real = (get("x-real-ip") or "").strip()
    if real:
        return real
    forwarded = (get("x-forwarded-for") or "").split(",")[0].strip()
    return forwarded or "unknown"


class RateLimiter:
    def __init__(self, limit: int, window_s: float, clock=time.monotonic):
        self.limit = limit
        self.window_s = window_s
        self._clock = clock
        self._windows: OrderedDict[str, tuple[float, int]] = OrderedDict()

    def check(self, key: str) -> tuple[bool, int]:
        """Counts one request for `key`. Returns (allowed, retry_after_s);
        retry_after_s is 0 when allowed."""
        now = self._clock()
        start, count = self._windows.get(key, (now, 0))
        if now - start >= self.window_s:
            start, count = now, 0
        if count >= self.limit:
            return False, max(1, int(self.window_s - (now - start)) + 1)
        self._windows[key] = (start, count + 1)
        self._windows.move_to_end(key)
        while len(self._windows) > MAX_KEYS:
            self._windows.popitem(last=False)
        return True, 0


def too_many_body(what: str) -> dict:
    return {
        "error": f"Too many {what} from your connection. Wait a few minutes and try again.",
        "rateLimited": True,
    }
