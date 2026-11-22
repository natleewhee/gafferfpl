"""A real double and blank gameweek, replayed through the forecast builder.

No double or blank week has reached the committed 2026/27 data yet, so until now the doubles and
blanks were only tested with hand-made numbers. This takes FPL's real 2025/26 schedule
(tests/data/fpl-2025-26-doubles-blanks.json): GW33, where six teams played twice, and GW34, where
six teams had no game. It puts them in as this season's GW11 and GW12, keeping every other week as it
is, and runs the real guest build (model, pool and solver) on the owner's real squad.

Teams are matched by FPL short name. Fixtures with a 2025/26 team not in this season's league (BUR,
WHU, WOL) are dropped, so a team that doubled against one of them plays once here. This season's
promoted teams (COV, HUL, IPS) have no fixture in the replayed weeks and also blank. The checks below
work from the replayed list itself, not from hard-coded teams.

Checks:
- every pool player's opponents and xP follow his team's fixtures: two legs in a double, none and
  0 xP in a blank
- the "hand calculation" for two double-gameweek players: the model's xP for both legs equals its
  xP for each leg on its own, added together (doubles are summed per fixture, not scaled)
- the GW12 lineup never captains a player with no game

It also writes the result, trimmed to the squad and the players they could buy, to
tests/e2e/data/double-blank-replay.json, which the browser test renders. Re-run with
REWRITE_REPLAY=1 to refresh that file after a deliberate model change.
"""

from __future__ import annotations

import copy
import dataclasses
import json
import os
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import pytest

import api.forecast as forecast_api
import engine.model as model
import scripts.compress_deploy_data as compress_deploy_data
import scripts.compute_forecast as cf

ROOT = Path(__file__).resolve().parent.parent
REAL = json.loads((ROOT / "tests/data/fpl-2025-26-doubles-blanks.json").read_text())
REPLAY_OUT = ROOT / "tests/e2e/data/double-blank-replay.json"
OWNER = 1168513
GUEST = 515151
DOUBLE_GW, BLANK_GW = 11, 12  # where the replayed weeks go this season
REAL_DOUBLE, REAL_BLANK = 33, 34  # the 2025/26 weeks they come from


def _frozen(bootstrap: dict) -> dict:
    """GW10 finished, GW11 next, whatever the nightly snapshot has done since (as test_guest_matrix)."""
    frozen = copy.deepcopy(bootstrap)
    for event in frozen.get("events", []):
        done = event["id"] < DOUBLE_GW
        event.update(finished=done, data_checked=done, is_current=event["id"] == DOUBLE_GW - 1, is_next=event["id"] == DOUBLE_GW)
    return frozen


def replay_fixtures(current: list[dict], bootstrap: dict) -> tuple[list[dict], dict[int, int], dict[int, int]]:
    """This season's fixtures with GW11 and GW12 replaced by the real 2025/26 GW33 and GW34.
    Returns the list and, for each replayed week, team id -> number of games."""
    team_id = {t["short_name"]: t["id"] for t in bootstrap["teams"]}
    deadline = {e["id"]: e["deadline_time"] for e in bootstrap["events"]}
    out = [f for f in current if f.get("event") not in (DOUBLE_GW, BLANK_GW)]
    games: dict[int, Counter] = {DOUBLE_GW: Counter(), BLANK_GW: Counter()}
    next_id = max(f["id"] for f in current) + 1
    for real_gw, gw in ((REAL_DOUBLE, DOUBLE_GW), (REAL_BLANK, BLANK_GW)):
        kickoff = (datetime.fromisoformat(deadline[gw].replace("Z", "+00:00")) + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        for f in (x for x in REAL["fixtures"] if x["event"] == real_gw):
            if f["home"] not in team_id or f["away"] not in team_id:
                continue  # a team not in this season's league
            h, a = team_id[f["home"]], team_id[f["away"]]
            out.append({
                "id": next_id, "event": gw, "team_h": h, "team_a": a,
                "team_h_difficulty": f["home_difficulty"], "team_a_difficulty": f["away_difficulty"],
                "kickoff_time": kickoff, "finished": False, "started": False,
                "team_h_score": None, "team_a_score": None,
            })
            next_id += 1
            games[gw][h] += 1
            games[gw][a] += 1
    return out, dict(games[DOUBLE_GW]), dict(games[BLANK_GW])


@pytest.fixture(scope="module")
def replay():
    compress_deploy_data.main()
    forecast_api._decompressed = False
    original = cf.DATA_DIR
    with pytest.MonkeyPatch.context() as mp:
        forecast_api._ensure_data_decompressed()
        bootstrap = _frozen(cf.load_bootstrap())
        fixtures, doubles, singles_gw12 = replay_fixtures(cf.load_fixtures(), bootstrap)
        mp.setattr(cf, "load_bootstrap", lambda *a, **k: bootstrap)
        mp.setattr(cf, "load_fixtures", lambda: fixtures)
        mp.setattr(cf, "load_cached_pool_context", lambda *a, **k: None)  # the nightly cache knows nothing of the replay
        forecast_api._cached_pool_ctx = None
        forecast_api._cached_pool_ctx_gw = None
        deadline = datetime.fromisoformat(cf.deadline_time_for_gw(bootstrap, DOUBLE_GW).replace("Z", "+00:00"))

        class _Pinned(datetime):
            @classmethod
            def now(cls, tz=None):
                return deadline - timedelta(days=1)

        mp.setattr(forecast_api, "datetime", _Pinned)
        picks = json.loads((ROOT / f"data/picks-{OWNER}/gw10.json").read_text())
        payloads = {
            f"/entry/{GUEST}/": {"name": "Replay FC", "player_first_name": "Re", "player_last_name": "Play"},
            f"/entry/{GUEST}/history/": {"current": [{"event": gw, "event_transfers": 0, "event_transfers_cost": 0, "points": 50, "total_points": 50 * gw} for gw in range(1, 11)], "chips": [], "past": []},
            f"/entry/{GUEST}/event/10/picks/": picks,
        }

        def fake_get(path: str, timeout: float = 15) -> dict:
            if path in payloads:
                return payloads[path]
            raise forecast_api.urllib.error.HTTPError(path, 404, "not found", None, None)

        mp.setattr(forecast_api, "_fpl_get", fake_get)
        status, payload = forecast_api.build_forecast_for_team(GUEST)
        ctx = forecast_api._get_pool_context(bootstrap, DOUBLE_GW)
        yield {"status": status, "payload": payload, "ctx": ctx, "fixtures": fixtures, "doubles": doubles, "gw12": singles_gw12, "bootstrap": bootstrap}
    forecast_api._decompressed = False
    forecast_api._cached_pool_ctx = None
    forecast_api._cached_pool_ctx_gw = None
    cf.DATA_DIR = original


def test_the_real_schedule_survives_the_mapping(replay):
    doubles = [t for t, n in replay["doubles"].items() if n == 2]
    blanks = [t["id"] for t in replay["bootstrap"]["teams"] if t["id"] not in replay["gw12"]]
    # 2025/26 GW33 had six doubles. Burnley isn't in this season's league, and Leeds and Man City each
    # had one of their two games against a team that isn't either, so three doubles survive: BOU, BHA, CHE.
    # GW34 had six blanks, and this season's promoted teams have no replayed fixture.
    assert len(doubles) >= 3, replay["doubles"]
    assert len(blanks) >= 6, blanks
    assert replay["status"] == 200, replay["payload"]


def test_every_players_legs_and_xp_follow_his_teams_fixtures(replay):
    payload = replay["payload"]
    team_of = {e["id"]: e["team"] for e in replay["bootstrap"]["elements"]}
    checked = Counter()
    for p in payload["pool"]:
        team = team_of[p["id"]]
        games_11 = replay["doubles"].get(team, 0)
        games_12 = replay["gw12"].get(team, 0)
        assert len(p["opponents"][0]) == games_11, (p["webName"], p["opponents"][0])
        assert len(p["opponents"][1]) == games_12, (p["webName"], p["opponents"][1])
        if games_12 == 0:
            assert p["perGameweek"][1] == 0, f"{p['webName']} has no GW12 game but {p['perGameweek'][1]} xP"
            checked["blank"] += 1
        if games_11 == 2:
            checked["double"] += 1
    assert checked["double"] > 50 and checked["blank"] > 100, checked


def _single_leg(fixtures: list[dict], team: int, keep: int) -> list[dict]:
    """The fixture list with only one of `team`'s two GW11 games (the `keep`-th)."""
    legs = [f for f in fixtures if f.get("event") == DOUBLE_GW and team in (f["team_h"], f["team_a"])]
    drop = {f["id"] for i, f in enumerate(legs) if i != keep}
    return [f for f in fixtures if f["id"] not in drop]


@pytest.mark.parametrize("rank", [0, 1], ids=["best double-week player", "second double team's best"])
def test_hand_calculation_a_double_is_the_two_games_added_together(replay, rank):
    ctx, frame = replay["ctx"]["ctx"], replay["ctx"]["featureFrame"]
    team_of = {e["id"]: e["team"] for e in replay["bootstrap"]["elements"]}
    double_teams = sorted(t for t, n in replay["doubles"].items() if n == 2)
    # the highest-xP player of the first and second double teams (by team id), so two different clubs
    team = double_teams[rank]
    pid = max((p for p in replay["payload"]["pool"] if team_of[p["id"]] == team), key=lambda p: p["perGameweek"][0])["id"]
    row = frame.loc[pid]
    both = model.project_detail(row, DOUBLE_GW, ctx)
    legs = [model.project_detail(row, DOUBLE_GW, dataclasses.replace(ctx, fixtures=_single_leg(ctx.fixtures, team, k))) for k in (0, 1)]
    assert len(both["opponents"]) == 2 and all(len(leg["opponents"]) == 1 for leg in legs)
    assert both["points"] == pytest.approx(legs[0]["points"] + legs[1]["points"], abs=0.05), (both["points"], [leg["points"] for leg in legs])
    # and each leg is a normal one-game projection: neither is a copy of the other
    assert legs[0]["opponents"][0] != legs[1]["opponents"][0]


def test_nobody_without_a_game_is_captained_in_the_blank_week(replay):
    payload = replay["payload"]
    week = payload["upcoming"][1]
    by_id = {p["id"]: p for p in payload["pool"]}
    blank = lambda pid: len(by_id[pid]["opponents"][1]) == 0 if pid in by_id else False  # noqa: E731
    assert week["gameweek"] == BLANK_GW
    assert not blank(week["captainId"])
    playing_xi = [pid for pid in week["startingXi"] if not blank(pid)]
    assert len(playing_xi) >= 1


def test_write_the_replay_for_the_browser_test(replay):
    """The browser test renders this; it is committed, and only rewritten on request."""
    payload = copy.deepcopy(replay["payload"])
    squad_ids = {p["id"] for p in payload["squad"]["players"]}
    # keep the file small: the squad plus the 60 best players over the window
    best = sorted(payload["pool"], key=lambda p: -sum(p["perGameweek"]))[:60]
    keep = squad_ids | {p["id"] for p in best}
    payload["pool"] = [p for p in payload["pool"] if p["id"] in keep]
    payload["replayNote"] = "Real 2025/26 GW33 (doubles) and GW34 (blanks) as GW11/GW12; see tests/test_double_blank_replay.py"
    if os.environ.get("REWRITE_REPLAY") == "1" or not REPLAY_OUT.exists():
        REPLAY_OUT.parent.mkdir(parents=True, exist_ok=True)
        REPLAY_OUT.write_text(json.dumps(payload, separators=(",", ":")))
    written = json.loads(REPLAY_OUT.read_text())
    assert written["targetGameweek"] == DOUBLE_GW
    assert any(len(p["opponents"][0]) == 2 for p in written["pool"])
