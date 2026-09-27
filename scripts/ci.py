"""Dependency-free CI selection and fail-closed merge gate."""

import json
import os
from pathlib import Path
import subprocess
import sys


JOBS = ("site", "test", "browser", "cli", "sast")


def select(paths, full=False):
    selected = set(JOBS) if full else set()
    for path in paths:
        if path.startswith("site/") or path in (
            "scripts/check-site.py", "e2e/site.config.js",
        ) or path.startswith("e2e/site-tests/"):
            selected.add("site")
        elif path.startswith("internal/server/"):
            selected.update(("test", "browser", "sast"))
        elif path.startswith("e2e/tests/") or path in (
            "e2e/playwright.config.js", "internal/e2eserver/main.go",
        ):
            selected.update(("test", "browser"))
        elif path.startswith(("internal/", "examples/")) or path.endswith(".go"):
            selected.update(("test", "browser", "cli", "sast"))
        elif path.startswith(("docs/", ".github/ISSUE_TEMPLATE/")) or path in (
            "README.md", "CHANGELOG.md", "SECURITY.md", "LICENSE", "e2e/README.md",
        ):
            continue
        else:
            # Dependencies, version, workflow/CI tooling, and new directories
            # require the full suite until their dependency boundary is known.
            selected.update(JOBS)
    return {job: job in selected for job in JOBS}


def changed_paths(event_name, event):
    if event_name == "pull_request":
        base = event["pull_request"]["base"]["sha"]
        head = event["pull_request"]["head"]["sha"]
        base = subprocess.check_output(
            ["git", "merge-base", base, head], text=True,
        ).strip()
    elif event_name == "push":
        base, head = event["before"], event["after"]
    else:
        raise ValueError("event requires full validation")
    # Treat renames as a deletion plus addition so both ownership areas run.
    output = subprocess.check_output([
        "git", "diff", "--no-renames", "--name-only", "-z", base, head, "--",
    ])
    return [os.fsdecode(path) for path in output.split(b"\0") if path]


def gate(needs):
    failures = []
    for job in ("changes", "semgrep", *JOBS):
        result = needs.get(job, {}).get("result", "missing")
        if job in JOBS:
            flag = needs.get("changes", {}).get("outputs", {}).get(job)
            if flag not in ("true", "false"):
                failures.append(f"{job}: missing or invalid selection")
                continue
            expected = "success" if flag == "true" else "skipped"
        else:
            expected = "success"
        if result != expected:
            failures.append(f"{job}: {result}, expected {expected}")
    return failures


def main():
    if sys.argv[1:] == ["gate"]:
        failures = gate(json.loads(os.environ["NEEDS_JSON"]))
        print("\n".join(failures) if failures else "All required checks passed.")
        return bool(failures)
    event_name = os.environ["GITHUB_EVENT_NAME"]
    full = os.environ.get("FORCE_FULL") == "true" or event_name not in (
        "pull_request", "push",
    ) or os.environ.get("GITHUB_REF", "").startswith("refs/tags/")
    paths = []
    if not full:
        try:
            event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
            paths = changed_paths(event_name, event)
        except (OSError, ValueError, KeyError, subprocess.CalledProcessError):
            print("Cannot establish a reliable diff; running all checks.")
            full = True
    selection = select(paths, full)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        for job, enabled in selection.items():
            print(f"{job}={str(enabled).lower()}", file=output)
    summary = "## CI selection\n\n" + (
        "Full validation requested or diff unavailable.\n\n" if full else
        f"Classified {len(paths)} changed paths.\n\n"
    )
    summary += "| Check | Selected |\n| --- | --- |\n"
    summary += "".join(f"| {job} | {'run' if enabled else 'skip'} |\n"
                       for job, enabled in selection.items())
    summary += "| Semgrep (including secrets) | always |\n"
    print(summary)
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
        output.write(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
