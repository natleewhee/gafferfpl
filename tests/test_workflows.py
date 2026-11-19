"""Every GitHub Actions workflow must still parse: a mis-indented line in a `run: |` block
ends the block early, and then the workflow never starts at all (scheduled or dispatched)."""

from pathlib import Path

import pytest
import yaml

WORKFLOWS = sorted((Path(__file__).resolve().parent.parent / ".github" / "workflows").glob("*.yml"))


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_workflow_parses(path: Path) -> None:
    data = yaml.safe_load(path.read_text())
    assert isinstance(data, dict) and data.get("jobs"), f"{path.name} has no jobs"


def test_snapshot_commit_step_keeps_its_push_retry() -> None:
    data = yaml.safe_load((WORKFLOWS[0].parent / "snapshot.yml").read_text())
    step = next(s for s in data["jobs"]["snapshot"]["steps"] if s.get("name") == "Commit snapshot")
    script = step["run"]
    assert "git pull --rebase -X theirs" in script
    assert "Could not push after 4 attempts" in script, "the retry loop must stay inside the step"
