"""Guest forecasts across the squad situations friends will actually be in.

Until now the guest path (api/forecast.py) was mostly tested on the owner's own
team, which has never had a hit, a mid-season start or a chip in the based-on
week at the same time. Each case here takes the owner's real committed squad,
changes only what that situation changes (the chip played, the transfers made,
when the team started, a player FPL no longer lists), and runs the real model
through the same build api/forecast.py uses on Vercel. Only the FPL fetch is
stubbed.

Every case checks the same things a friend would see as wrong first: the 15
players on the pitch, a legal starting XI, the bank, and the free transfers.
The expected free transfers are worked out by hand in each case, from FPL's
rules, rather than by calling the function under test.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

import pytest

import api.forecast as forecast_api
import scripts.compress_deploy_data as compress_deploy_data
import scripts.compute_forecast as cf

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OWNER = 1168513
GUEST = 424242
TARGET_GW = 11
GONE_ID = 999_999  # an id the bundled bootstrap doesn't list: a player FPL added after the nightly build


def _owner_picks(gw: int) -> dict:
    path = DATA_DIR / f"picks-{OWNER}" / f"gw{gw}.json"
    if not path.exists():
        pytest.skip(f"no committed picks for GW{gw}")
    return json.loads(path.read_text())


def _history(transfers_by_gw: dict[int, int], chips: list[dict] | None = None, first_gw: int = 1, last_gw: int = 10) -> dict:
    """An entry-history payload: one row per gameweek played, with the transfers made that week."""
    rows = [
        {"event": gw, "event_transfers": transfers_by_gw.get(gw, 0), "event_transfers_cost": 0, "points": 50, "total_points": 50 * gw}
        for gw in range(first_gw, last_gw + 1)
    ]
    return {"current": rows, "chips": chips or [], "past": []}


@dataclass
class Case:
    name: str
    history: dict
    active_chip: str | None = None
    entry_history_patch: dict = field(default_factory=dict)
    replace_pick: tuple[int, int] | None = None  # (old element, new element) in the based-on week's picks
    previous_week_picks: bool = False  # serve GW9's real picks (needed after a Free Hit)
    expect_ft: int = 1
    expect_from_gw9: bool = False  # the squad shown is GW9's (FPL restored it after a Free Hit)
    expect_chip_used: str | None = None
    expect_hit: int = 0  # points the based-on week's transfers cost, as shown in last week's review


# Free transfers at the GW11 deadline, by FPL's rules: the first week played is unlimited, 1 FT
# arrives the week after, each later week spends what was used (never below 0) then adds 1, capped
# at 5; a Wildcard or Free Hit week neither spends nor adds.
CASES = [
    # GW2-10 with no transfers: 1 -> 2 -> 3 -> 4 -> 5, then capped.
    Case("five banked, the most FPL allows", _history({}), expect_ft=5),
    # Five banked by GW6; 1 used in GW9 (5 -> 5); a Wildcard in GW10 keeps the 5 although 10 moves were made.
    Case(
        "wildcard in the based-on week",
        _history({9: 1, 10: 10}, chips=[{"name": "wildcard", "event": 10}]),
        active_chip="wildcard",
        expect_ft=5,
        expect_chip_used="wildcard",
    ),
    # Same shape with a Free Hit: the bank is kept, and the squad going forward is GW9's again.
    Case(
        "free hit in the based-on week",
        _history({9: 1, 10: 9}, chips=[{"name": "freehit", "event": 10}]),
        active_chip="freehit",
        previous_week_picks=True,
        expect_ft=5,
        expect_from_gw9=True,
        expect_chip_used="freehit",
    ),
    # Bench Boost changes no transfers: 1 a week used throughout keeps 1 FT.
    Case(
        "bench boost in the based-on week",
        _history({gw: 1 for gw in range(2, 11)}, chips=[{"name": "bboost", "event": 10}]),
        active_chip="bboost",
        expect_ft=1,
        expect_chip_used="bboost",
    ),
    # A -4: 2 transfers on 1 FT in GW10 -> max(0, 1 - 2) + 1 = 1.
    Case(
        "took a -4 hit in the based-on week",
        _history({**{gw: 1 for gw in range(2, 10)}, 10: 2}),
        entry_history_patch={"event_transfers": 2, "event_transfers_cost": 4},
        expect_ft=1,
        expect_hit=4,
    ),
    # Joined in GW9 (unlimited week); 1 FT for GW10, none used -> 2 at GW11.
    Case("joined in gameweek 9", _history({}, first_gw=9), expect_ft=2),
    # One of the 15 is a player FPL added after the bundled data was built (the January window): the
    # guest route looks him up in FPL's fresh listing and shows him at 0 xP. FT as in the first case.
    Case("a player new to FPL since the nightly build", _history({}), replace_pick=(None, GONE_ID), expect_ft=5),
]


def _frozen(bootstrap: dict) -> dict:
    """The bundled bootstrap as it was before GW11 finished. The nightly snapshot moves the real one
    on (GW11 finished, then GW12...), which would change the week the build is based on and ask for
    picks these cases don't serve. Freezing the finished flags keeps every case on GW10 -> GW11."""
    frozen = copy.deepcopy(bootstrap)
    for event in frozen.get("events", []):
        done = event["id"] < TARGET_GW
        event["finished"] = done
        event["data_checked"] = done
        event["is_current"] = event["id"] == TARGET_GW - 1
        event["is_next"] = event["id"] == TARGET_GW
    return frozen


@pytest.fixture(scope="module")
def pool_context():
    """The model context is the same for every team; build it once for the module."""
    compress_deploy_data.main()
    forecast_api._decompressed = False
    original = cf.DATA_DIR
    with pytest.MonkeyPatch.context() as mp:
        forecast_api._ensure_data_decompressed()
        frozen = _frozen(cf.load_bootstrap())
        mp.setattr(cf, "load_bootstrap", lambda *a, **k: frozen)
        ctx = forecast_api._get_pool_context(frozen, TARGET_GW)
        yield ctx
    forecast_api._decompressed = False
    forecast_api._cached_pool_ctx = None
    forecast_api._cached_pool_ctx_gw = None
    cf.DATA_DIR = original


@pytest.fixture
def pinned_before_gw11(monkeypatch, pool_context):
    deadline = datetime.fromisoformat(cf.deadline_time_for_gw(cf.load_bootstrap(), TARGET_GW).replace("Z", "+00:00"))

    class _Pinned(datetime):
        @classmethod
        def now(cls, tz=None):
            return deadline - timedelta(days=1)

    monkeypatch.setattr(forecast_api, "datetime", _Pinned)
    monkeypatch.setattr(forecast_api, "_get_pool_context", lambda bootstrap, target: pool_context)


def _serve(monkeypatch, case: Case) -> tuple[list[int], dict]:
    based = _owner_picks(10)
    picks = copy.deepcopy(based["picks"])
    if case.replace_pick:
        _, new = case.replace_pick
        bench_slot = next(p for p in picks if p["position"] == 15)  # a bench player, so the XI rules still hold
        bench_slot["element"] = new
    entry_history = {**based["entry_history"], **case.entry_history_patch}
    payloads = {
        f"/entry/{GUEST}/": {"name": "Matrix FC", "player_first_name": "Mat", "player_last_name": "Rix"},
        f"/entry/{GUEST}/history/": case.history,
        f"/entry/{GUEST}/event/10/picks/": {"picks": picks, "entry_history": entry_history, "active_chip": case.active_chip},
    }
    if case.previous_week_picks:
        payloads[f"/entry/{GUEST}/event/9/picks/"] = _owner_picks(9)
    if case.replace_pick:
        replaced = next(p for p in based["picks"] if p["position"] == 15)["element"]
        old = next(e for e in cf.load_bootstrap()["elements"] if e["id"] == replaced)
        new_listing = {**old, "id": GONE_ID, "web_name": "Newman", "code": None}
        payloads["/bootstrap-static/"] = {"elements": [new_listing]}
    forecast_api._fresh_elements.clear()

    def fake_get(path: str, timeout: float = 15) -> dict:
        if path in payloads:
            return payloads[path]
        raise forecast_api.urllib.error.HTTPError(path, 404, "not found", None, None)

    monkeypatch.setattr(forecast_api, "_fpl_get", fake_get)
    expected_squad = [p["element"] for p in (_owner_picks(9)["picks"] if case.expect_from_gw9 else picks)]
    expected_entry = _owner_picks(9)["entry_history"] if case.expect_from_gw9 else entry_history
    return expected_squad, expected_entry


def _assert_legal_xi(payload: dict) -> None:
    by_id = {p["id"]: p for p in payload["squad"]["players"]}
    xi = payload["squad"]["startingXi"]
    assert len(xi) == 11 and len(set(xi)) == 11
    counts = {t: sum(1 for i in xi if by_id[i]["elementType"] == t) for t in (1, 2, 3, 4)}
    assert counts[1] == 1, counts
    assert counts[2] >= 3 and counts[3] >= 2 and counts[4] >= 1, counts
    assert set(xi) | set(payload["squad"]["bench"]) == set(by_id)


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.name if isinstance(c, Case) else None)
def test_guest_matrix(monkeypatch, pinned_before_gw11, case: Case):
    expected_squad, expected_entry = _serve(monkeypatch, case)

    status, payload = forecast_api.build_forecast_for_team(GUEST)

    assert status == 200, payload
    assert payload["targetGameweek"] == TARGET_GW
    ids = [p["id"] for p in payload["squad"]["players"]]
    assert sorted(ids) == sorted(expected_squad), "the squad shown must be the 15 the manager holds"
    _assert_legal_xi(payload)
    assert payload["squad"]["bank"] == round(expected_entry["bank"] / 10, 1)
    assert payload["scenarios"]["freeTransfers"]["value"] == case.expect_ft, payload["scenarios"]["freeTransfers"]
    # FPL's free-transfer count after a hit is the same as after a normal week, so the hit itself is
    # checked where the app shows it: last week's review.
    assert payload["lastGameweek"]["transfersCost"] == case.expect_hit
    if case.expect_chip_used:
        used = {r["name"] for r in payload["chips"] if r["used"]}
        assert case.expect_chip_used in used
    if case.active_chip in ("wildcard", "freehit"):
        assert "chip weeks kept the bank (GW10)" in payload["scenarios"]["freeTransfers"]["derivation"]
        key = {"wildcard": "wildcard", "freehit": "freeHit"}[case.active_chip]
        assert payload["scenarios"]["chipsAvailable"][key] is False  # this half's chip is spent
    if case.replace_pick:
        new = next(p for p in payload["squad"]["players"] if p["id"] == GONE_ID)
        assert new["webName"] == "Newman" and new["newToFpl"] is True
        assert new["projectedPoints"] == 0 and new["provisional"] is True
        assert GONE_ID not in payload["squad"]["startingXi"]
        assert payload["upcoming"][0]["captainId"] != GONE_ID


def test_a_team_that_joined_after_the_last_finished_week_is_told_so(monkeypatch, pinned_before_gw11):
    """No picks for the based-on week: a plain 422, which the app words as 'check back after the next gameweek'."""
    payloads = {
        f"/entry/{GUEST}/": {"name": "New FC"},
        f"/entry/{GUEST}/history/": {"current": [], "chips": [], "past": []},
    }

    def fake_get(path: str, timeout: float = 15) -> dict:
        if path in payloads:
            return payloads[path]
        raise forecast_api.urllib.error.HTTPError(path, 404, "not found", None, None)

    monkeypatch.setattr(forecast_api, "_fpl_get", fake_get)
    status, payload = forecast_api.build_forecast_for_team(GUEST)
    # FPL answers 404 for the picks of a week the team didn't play. The team exists, so this
    # must be the 422 ("no squad recorded yet"), not the 404 ("FPL has no team with ID ...").
    assert status == 422, payload


def test_if_fpls_listing_cant_be_fetched_the_build_still_succeeds(monkeypatch, pinned_before_gw11):
    """Best effort: no fresh listing means the new player can't be shown (14 players), not a failed forecast."""
    case = next(c for c in CASES if c.replace_pick)
    _serve(monkeypatch, case)
    served = forecast_api._fpl_get

    def no_bootstrap(path: str, timeout: float = 15) -> dict:
        if path == "/bootstrap-static/":
            raise forecast_api.urllib.error.URLError("timed out")
        return served(path, timeout)

    monkeypatch.setattr(forecast_api, "_fpl_get", no_bootstrap)
    status, payload = forecast_api.build_forecast_for_team(GUEST)
    assert status == 200, payload
    assert len(payload["squad"]["players"]) == 14
