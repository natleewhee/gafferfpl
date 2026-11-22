"""engine/ratelimit.py and the 429s it gives api/forecast.py and api/solve.py."""

from __future__ import annotations

import io
import json

import pytest

import api.forecast as forecast_api
import api.solve as solve_api
from engine.ratelimit import MAX_KEYS, RateLimiter, client_ip


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def test_allows_up_to_the_limit_then_says_when_to_retry():
    clock = Clock()
    rl = RateLimiter(limit=3, window_s=600, clock=clock)
    assert [rl.check("a")[0] for _ in range(3)] == [True, True, True]
    clock.t = 100
    allowed, retry = rl.check("a")
    assert not allowed and retry == 501
    assert rl.check("b") == (True, 0)  # other addresses are counted apart


def test_a_new_window_starts_fresh():
    clock = Clock()
    rl = RateLimiter(limit=1, window_s=60, clock=clock)
    assert rl.check("a")[0]
    assert not rl.check("a")[0]
    clock.t = 60
    assert rl.check("a")[0]


def test_memory_stays_bounded():
    rl = RateLimiter(limit=1, window_s=60, clock=Clock())
    for i in range(MAX_KEYS + 10):
        rl.check(str(i))
    assert len(rl._windows) == MAX_KEYS


def test_client_ip_prefers_vercels_real_ip_header():
    assert client_ip({"x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9"}) == "1.2.3.4"
    assert client_ip({"x-forwarded-for": "5.6.7.8, 10.0.0.1"}) == "5.6.7.8"
    assert client_ip({}) == "unknown"


def _handler(module, path="/", headers=None, body=b""):
    h = object.__new__(module.handler)
    h.path = path
    h.headers = headers or {}
    h.rfile = io.BytesIO(body)
    sent: dict = {"headers": {}}
    h.send_response = lambda code: sent.__setitem__("status", code)
    h.send_header = lambda k, v: sent["headers"].__setitem__(k, v)
    h.end_headers = lambda: None
    h.wfile = io.BytesIO()
    return h, sent


@pytest.fixture
def tight_limits(monkeypatch):
    monkeypatch.setattr(forecast_api, "BUILD_LIMIT", RateLimiter(limit=1, window_s=600))
    monkeypatch.setattr(solve_api, "SOLVE_LIMIT", RateLimiter(limit=1, window_s=600))


def test_forecast_answers_429_with_retry_after_once_over_the_limit(monkeypatch, tight_limits):
    builds = []
    monkeypatch.setattr(forecast_api, "build_forecast_for_team", lambda t: builds.append(t) or (200, {"ok": True}))
    headers = {"x-real-ip": "1.2.3.4"}
    h, sent = _handler(forecast_api, "/api/forecast?teamId=16", headers)
    h.do_GET()
    assert sent["status"] == 200
    h, sent = _handler(forecast_api, "/api/forecast?teamId=17", headers)
    h.do_GET()
    assert sent["status"] == 429 and int(sent["headers"]["Retry-After"]) > 0
    assert "Cache-Control" not in sent["headers"]
    assert json.loads(h.wfile.getvalue())["rateLimited"] is True
    assert builds == [16]  # the model never ran for the refused request


def test_a_bad_team_id_is_refused_before_it_counts(monkeypatch, tight_limits):
    monkeypatch.setattr(forecast_api, "build_forecast_for_team", lambda t: (200, {}))
    for _ in range(3):
        h, sent = _handler(forecast_api, "/api/forecast?teamId=abc", {"x-real-ip": "1.2.3.4"})
        h.do_GET()
        assert sent["status"] == 400
    h, sent = _handler(forecast_api, "/api/forecast?teamId=16", {"x-real-ip": "1.2.3.4"})
    h.do_GET()
    assert sent["status"] == 200


def test_solve_answers_429_once_over_the_limit(monkeypatch, tight_limits):
    monkeypatch.setattr(solve_api, "solve", lambda body: (200, {"ok": True}))
    body = b"{}"
    headers = {"x-real-ip": "1.2.3.4", "content-length": str(len(body))}
    h, sent = _handler(solve_api, "/api/solve", headers, body)
    h.do_POST()
    assert sent["status"] == 200
    h, sent = _handler(solve_api, "/api/solve", headers, body)
    h.do_POST()
    assert sent["status"] == 429 and "Retry-After" in sent["headers"]
