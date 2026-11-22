"""Checks a deployed GafferFPL site the way a visitor would: the home page
loads, and the guest forecast route answers for a few team IDs.

Run by .github/workflows/deploy-smoke.yml after each Production deploy.
Standard library only, so the workflow needs no install step.

    python scripts/smoke_check.py https://fplforecast.vercel.app 1168513 123456

Exit code 0 when everything answered, 1 otherwise. Prints one line per check.

The team IDs are ones known to be real, with a squad, so only a 200 with a
squad passes. A 404 ("no such team") or 422 ("no squad yet") for one of them
means a lookup is broken, as does a 5xx, a timeout or a platform HTML page.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

# A guest build can take ~10 s on a cold start; the function's own limit is 30 s.
TIMEOUT_S = 40
USER_AGENT = "gafferfpl-smoke-check"


def _get(url: str) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def check_home(base: str, get=_get) -> tuple[bool, str]:
    try:
        status, body = get(f"{base}/")
    except Exception as exc:  # noqa: BLE001 -- any failure to load is the finding
        return False, f"home page: could not load ({exc})"
    if status != 200:
        return False, f"home page: HTTP {status}"
    if b"GafferFPL" not in body:
        return False, "home page: loaded, but it isn't the GafferFPL page"
    return True, "home page: OK"


def check_forecast(base: str, team_id: str, get=_get) -> tuple[bool, str]:
    label = f"forecast for team {team_id}"
    try:
        status, body = get(f"{base}/api/forecast?teamId={team_id}")
    except Exception as exc:  # noqa: BLE001
        return False, f"{label}: no answer ({exc})"
    try:
        payload = json.loads(body)
    except ValueError:
        return False, f"{label}: HTTP {status}, not JSON (the platform answered, not the app)"
    if status != 200 or not isinstance(payload, dict):
        return False, f"{label}: HTTP {status} {payload.get('error', '') if isinstance(payload, dict) else ''}".rstrip()
    if not (payload.get("squad") or {}).get("players"):
        return False, f"{label}: HTTP 200 but the forecast has no squad"
    return True, f"{label}: OK (GW{payload.get('targetGameweek')})"


def run(base: str, team_ids: list[str], get=_get, retries: int = 1, wait_s: float = 20) -> list[tuple[bool, str]]:
    """Each check gets `retries` more tries after a failure: the first request
    after a deploy can land on a cold function."""
    base = base.rstrip("/")
    checks = [lambda: check_home(base, get)] + [
        (lambda t=t: check_forecast(base, t, get)) for t in team_ids
    ]
    results = []
    for check in checks:
        ok, line = check()
        for _ in range(retries):
            if ok:
                break
            time.sleep(wait_s)
            ok, line = check()
        results.append((ok, line))
    return results


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: smoke_check.py BASE_URL [TEAM_ID ...]", file=sys.stderr)
        return 2
    base, team_ids = argv[1], [t for t in argv[2:] if t.strip()]
    results = run(base, team_ids)
    for ok, line in results:
        print(("PASS " if ok else "FAIL ") + line)
    return 0 if all(ok for ok, _ in results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
