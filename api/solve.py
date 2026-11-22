"""Live squad solve for the "force keep / force remove a player" control
(2026-09-05 transfer-scenarios plan follow-up). A Vercel Python Function --
everything else in this repo is precomputed at forecast-build time and
served as static JSON (the plan's deliberate "the browser never solves
anything" call), but an arbitrary force-in/force-out pick can't be
precomputed for every possible player, so this is the one on-demand solve.

Reads the already-committed ``data/forecast/gw<N>.json`` for its pool/squad
(the same data ``scripts/compute_forecast.py`` bakes the precomputed
scenarios from) rather than recomputing the xP model -- this endpoint only
ever re-runs the ILP, never the model. The JSON shaping comes from
``engine/scenario_shape.py``, shared with ``scripts/compute_forecast.py``; it
imports only ``engine.optimise`` (``pulp``), so pandas/numpy stay out of this
lambda. tests/test_solve_api.py pins the contract.

A guest page sends ``team`` (its own squad, sell prices, bank and free
transfers); without it the solve uses the owner's committed squad.

NOT verified against a live Vercel deployment from this environment (no
Vercel access here) -- see the PR description for the specific things that
need checking after deploy: the CBC binary running under Vercel's Python
runtime, data/forecast/*.json being bundled via vercel.json's
``includeFiles``, and cold-start latency.
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from engine.optimise import solve_squad, with_held_rows  # noqa: E402
from engine.scenario_shape import scenario_to_dict as _scenario_to_dict  # noqa: E402
from engine.ratelimit import RateLimiter, client_ip, too_many_body  # noqa: E402

# Solves per visitor address per 10 minutes (see engine/ratelimit.py). Each pin or
# horizon change in Scenarios is one solve, so this is higher than the forecast's.
SOLVE_LIMIT = RateLimiter(limit=60, window_s=600)

MAX_FORCED_PLAYERS = 15  # can't force in/out more than a full squad


def _load_forecast(gw: int) -> dict:
    path = os.path.join(_ROOT, "data", "forecast", f"gw{gw}.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _pool_by_id_with_squad_fallback(forecast: dict) -> dict:
    pool_by_id = {p["id"]: p for p in forecast["pool"]}
    for card in forecast["squad"]["players"]:
        pool_by_id.setdefault(card["id"], card)
    return pool_by_id


_POSITION_TYPE = {"GKP": 1, "DEF": 2, "MID": 3, "FWD": 4}


def _strict_int(value, what: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or float(value) != int(value):
        raise ValueError(f"{what} must be a whole number")
    return int(value)


def _parse_team(team: dict) -> dict:
    """Validate a guest's ``{"squad": [{"id", "position"?, "team"?, "webName"?,
    "price"?}] x15, "bank", "freeTransfers"}``. Positions, clubs, names and
    prices are only used for a player missing from the pool (one who has
    left), and a price must be a real FPL price (3.5-15.5)."""
    squad = team["squad"]
    if not isinstance(squad, list) or len(squad) != 15:
        raise ValueError("squad must list 15 players")
    cards: dict[int, dict] = {}
    for row in squad:
        pid = _strict_int(row["id"], "player id")
        if pid <= 0:
            raise ValueError(f"player id {pid} must be positive")
        card = {"id": pid}
        pos = row.get("position")
        if pos in _POSITION_TYPE:
            card.update(position=pos, elementType=_POSITION_TYPE[pos])
        if isinstance(row.get("team"), str) and 0 < len(row["team"]) <= 5:
            card["team"] = row["team"]
        if isinstance(row.get("webName"), str):
            card["webName"] = row["webName"][:40]
        price = row.get("price")
        if price is not None:
            price = float(price)
            if not 3.5 <= price <= 15.5:
                raise ValueError(f"player {pid} has an impossible price")
            card.update(price=price, sellPrice=price)
        cards[pid] = card
    if len(cards) != 15:
        raise ValueError("squad has a duplicate player")
    bank = float(team["bank"])
    if not 0.0 <= bank <= 100.0:
        raise ValueError("bank out of range")
    free_transfers = _strict_int(team["freeTransfers"], "freeTransfers")
    if not 0 <= free_transfers <= 5:
        raise ValueError("freeTransfers must be 0-5")
    return {"ids": list(cards), "cards": cards, "bank": bank, "freeTransfers": free_transfers}


def solve(body: dict) -> tuple[int, dict]:
    """Pure request -> (status, payload) so this is testable without an
    HTTP server in front of it."""
    try:
        forecast_gw = int(body["forecastGw"])
        horizon = int(body.get("horizon", 1))
        scenario_type = body.get("type", "transfer")
        force_in = [int(pid) for pid in (body.get("forceIn") or [])]
        force_out = [int(pid) for pid in (body.get("forceOut") or [])]
    except (KeyError, TypeError, ValueError) as exc:
        return 400, {"error": f"bad request: {exc}"}

    if horizon not in (1, 3, 5):
        return 400, {"error": "horizon must be 1, 3, or 5"}
    if scenario_type not in ("transfer", "freeHit", "wildcard"):
        return 400, {"error": "type must be transfer, freeHit, or wildcard"}
    if len(force_in) + len(force_out) > MAX_FORCED_PLAYERS:
        return 400, {"error": f"cannot force more than {MAX_FORCED_PLAYERS} players total"}
    if set(force_in) & set(force_out):
        return 400, {"error": "a player cannot be both forced in and forced out"}

    try:
        forecast = _load_forecast(forecast_gw)
    except FileNotFoundError:
        return 404, {"error": f"no forecast for GW{forecast_gw}"}

    pool = forecast["pool"]
    pool_by_id = _pool_by_id_with_squad_fallback(forecast)
    squad_ids = [p["id"] for p in forecast["squad"]["players"]]
    bank = forecast["squad"]["bank"]
    free_transfers = forecast["scenarios"]["freeTransfers"]["value"]
    target_gw = forecast["targetGameweek"]

    # A guest's own squad. The committed forecast is the app owner's; its pool
    # is team-agnostic and reusable, but its squad, bank and free transfers
    # are the owner's. A guest's page sends its own 15 (ids, plus position,
    # club and name used only for a player no longer in the pool), bank and
    # free transfers. Prices come from the pool, not the request.
    team = body.get("team")
    cards = {p["id"]: p for p in forecast["squad"]["players"]}
    if team is not None and team is not False:
        try:
            guest = _parse_team(team)
        except (KeyError, TypeError, ValueError) as exc:
            return 400, {"error": f"bad team: {exc}"}
        squad_ids, bank, free_transfers = guest["ids"], guest["bank"], guest["freeTransfers"]
        cards = guest["cards"]

    # A held player who has left the league has no pool row; give him a 0-xP
    # one so a sale counts as a transfer and credits his sell price.
    pool = with_held_rows(pool, squad_ids, cards)
    pool_by_id = {**pool_by_id, **{p["id"]: p for p in pool}}

    if scenario_type == "transfer":
        result = solve_squad(
            pool,
            held=squad_ids,
            bank=bank,
            free_transfers=free_transfers,
            horizon_gws=horizon,
            force_in=force_in,
            force_out=force_out,
        )
    else:
        if scenario_type == "freeHit":
            horizon = 1  # Free Hit is deliberately single-gameweek (KD in the plan)
        total_budget = bank + sum(
            pool_by_id[pid]["sellPrice"] for pid in squad_ids if pid in pool_by_id
        )
        result = solve_squad(
            pool,
            held=[],
            bank=total_budget,
            free_transfers=0,
            horizon_gws=horizon,
            unlimited=True,
            force_in=force_in,
            force_out=force_out,
        )

    if not result.feasible:
        return 422, {
            "error": (
                "No feasible squad satisfies these constraints — the forced "
                "players may not fit the budget, formation, or 3-per-club limit, "
                "or may no longer be available to pick."
            )
        }

    return 200, _scenario_to_dict(result, pool_by_id, target_gw)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", 0) or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            self._respond(400, {"error": "invalid JSON body"})
            return
        allowed, retry_after = SOLVE_LIMIT.check(client_ip(getattr(self, "headers", None) or {}))
        if not allowed:
            self._respond(429, too_many_body("transfer searches"), retry_after=retry_after)
            return
        status, payload = solve(body)
        self._respond(status, payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _respond(self, status: int, payload: dict, retry_after: int | None = None):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        if retry_after:
            self.send_header("Retry-After", str(retry_after))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)
