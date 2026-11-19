"""How a solved transfer scenario is written out as JSON: the player references, the
per-gameweek XI detail and the scenario itself. Shared by scripts/compute_forecast.py (the
precomputed scenarios) and api/solve.py (the on-demand solve), so the two can't drift.

Needs only engine.optimise's result type (pulp), never the model (pandas/numpy), so the solve
function can import it without bundling those."""

from __future__ import annotations

from engine.optimise import ScenarioResult


def player_ref(pid: int, pool_by_id: dict) -> dict:
    p = pool_by_id.get(pid, {})
    return {
        "id": pid,
        "webName": p.get("webName"),
        "position": p.get("position"),
        "team": p.get("team"),
        "price": p.get("price"),
        "availability": p.get("availability"),
    }


def scenario_weeks(result: ScenarioResult, pool_by_id: dict, target_gw: int) -> list[dict]:
    """Per-gameweek detail for a solved scenario -- the XI that week, each
    player's opponent(s)/FDR and that week's xP, and the week's total (captain
    doubled). Lets the UI offer a "pick a GW within this horizon" view rather
    than only the horizon-wide net total."""
    weeks = []
    for offset in range(result.horizon_gws):
        xi_ids = result.xi_by_gw[offset] if offset < len(result.xi_by_gw) else []
        captain_id = result.captain_by_gw[offset] if offset < len(result.captain_by_gw) else None
        players = []
        total = 0.0
        for pid in xi_ids:
            p = pool_by_id.get(pid, {})
            per_gw = p.get("perGameweek") or []
            xp = per_gw[offset] if offset < len(per_gw) else None
            opponents_by_gw = p.get("opponents") or []
            opponents = opponents_by_gw[offset] if offset < len(opponents_by_gw) else []
            is_captain = pid == captain_id
            players.append(
                {
                    "id": pid,
                    "webName": p.get("webName"),
                    "position": p.get("position"),
                    "team": p.get("team"),
                    "xp": xp,
                    "opponents": opponents,
                    "isCaptain": is_captain,
                }
            )
            if xp is not None:
                total += xp * (2 if is_captain else 1)
        weeks.append(
            {
                "targetGw": target_gw + offset,
                "players": players,
                "totalXp": round(total, 2),
            }
        )
    return weeks


def scenario_to_dict(result: ScenarioResult, pool_by_id: dict, target_gw: int) -> dict:
    return {
        "squad": result.squad_ids,
        "xiByGw": result.xi_by_gw,
        "captainByGw": result.captain_by_gw,
        "horizonGws": result.horizon_gws,
        "points": result.points,
        "hitCost": result.hit_cost,
        "netPoints": result.net_points,
        "transfersIn": [player_ref(pid, pool_by_id) for pid in result.transfers_in],
        "transfersOut": [player_ref(pid, pool_by_id) for pid in result.transfers_out],
        "weeks": scenario_weeks(result, pool_by_id, target_gw),
    }
