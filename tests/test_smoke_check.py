"""scripts/smoke_check.py: what counts as the live site working, without the network."""

from __future__ import annotations

import json
from pathlib import Path

import yaml

import scripts.smoke_check as smoke

FORECAST = json.dumps({"targetGameweek": 12, "squad": {"players": [{"id": 1}]}}).encode()


def _site(routes: dict[str, tuple[int, bytes]]):
    def get(url: str):
        for suffix, answer in routes.items():
            if url.endswith(suffix):
                if isinstance(answer, Exception):
                    raise answer
                return answer
        raise AssertionError(f"unexpected url {url}")

    return get


HOME = ("/", (200, b"<title>GafferFPL</title>"))


def test_a_healthy_site_passes():
    get = _site(dict([HOME, ("teamId=1", (200, FORECAST))]))
    results = smoke.run("https://x.example/", ["1"], get=get, retries=0)
    assert all(ok for ok, _ in results)
    assert results[1][1].endswith("OK (GW12)")


def test_unknown_team_and_no_squad_yet_count_as_the_app_answering():
    get = _site(
        dict(
            [
                HOME,
                ("teamId=404", (404, b'{"error": "no FPL team found"}')),
                ("teamId=422", (422, b'{"error": "no picks yet"}')),
            ]
        )
    )
    assert all(ok for ok, _ in smoke.run("https://x.example", ["404", "422"], get=get, retries=0))


def test_server_errors_platform_pages_and_empty_forecasts_fail():
    get = _site(
        dict(
            [
                HOME,
                ("teamId=1", (502, b'{"error": "forecast build failed"}')),
                ("teamId=2", (504, b"<html>FUNCTION_INVOCATION_TIMEOUT</html>")),
                ("teamId=3", (200, b'{"squad": {"players": []}}')),
                ("teamId=4", TimeoutError("timed out")),
            ]
        )
    )
    results = smoke.run("https://x.example", ["1", "2", "3", "4"], get=get, retries=0)
    assert [ok for ok, _ in results] == [True, False, False, False, False]


def test_a_page_that_is_not_ours_fails_the_home_check():
    ok, line = smoke.check_home("https://x.example", _site({"/": (200, b"Deployment protected")}))
    assert not ok and "isn't the GafferFPL page" in line


def test_a_failure_is_retried_once():
    answers = iter([(503, b"{}"), (200, FORECAST)])
    calls = []

    def get(url: str):
        if url.endswith("/"):
            return HOME[1]
        calls.append(url)
        return next(answers)

    results = smoke.run("https://x.example", ["7"], get=get, retries=1, wait_s=0)
    assert results[1][0] and len(calls) == 2


def test_main_exit_codes(monkeypatch, capsys):
    monkeypatch.setattr(smoke, "run", lambda base, ids: [(True, "a"), (False, "b")])
    assert smoke.main(["x", "https://x.example", "1"]) == 1
    assert "FAIL b" in capsys.readouterr().out
    monkeypatch.setattr(smoke, "run", lambda base, ids: [(True, "a")])
    assert smoke.main(["x", "https://x.example"]) == 0
    assert smoke.main(["x"]) == 2


def test_workflow_runs_only_after_successful_deploys():
    wf = yaml.safe_load((Path(__file__).resolve().parent.parent / ".github/workflows/deploy-smoke.yml").read_text())
    smoke_if = wf["jobs"]["smoke"]["if"]
    assert "'Production'" in smoke_if and "'success'" in smoke_if
    branch_if = wf["jobs"]["production-branch"]["if"]
    assert "'Preview'" in branch_if and "'success'" in branch_if
    # The issue search is restricted to issues the workflow itself opened (see the 12 Nov audit, F1).
    for job in wf["jobs"].values():
        for step in job["steps"]:
            if "gh issue list" in step.get("run", ""):
                assert "--author app/github-actions" in step["run"]
