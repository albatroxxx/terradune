import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from ci import JOBS, changed_paths, gate, main, select


class SelectionTests(unittest.TestCase):
    def selected(self, paths):
        return {job for job, enabled in select(paths).items() if enabled}

    def test_site_only(self):
        for path in ("site/index.html", "site/assets/screenshot.png",
                     "scripts/check-site.py", "e2e/site.config.js",
                     "e2e/site-tests/site.spec.js"):
            with self.subTest(path=path):
                self.assertEqual(self.selected([path]), {"site"})

    def test_docs_only(self):
        self.assertEqual(self.selected(["README.md", "docs/CI.md"]), set())

    def test_embedded_assets_need_go_but_not_cli(self):
        for path in ("internal/server/index.html", "internal/server/assets/review.js",
                     "internal/server/assets/logo.svg", "internal/server/server.go"):
            self.assertEqual(self.selected([path]), {"test", "browser", "sast"})

    def test_core_and_fixtures(self):
        for path in ("main.go", "scheduler.go", "internal/ingest/ingest.go",
                     "internal/graph/graph.go", "examples/vpc/main.tf"):
            self.assertEqual(self.selected([path]), {"test", "browser", "cli", "sast"})

    def test_app_browser_changes(self):
        self.assertEqual(self.selected(["e2e/tests/app.spec.js"]), {"test", "browser"})

    def test_shared_dependencies_ci_and_unknown_paths_fail_full(self):
        for path in ("VERSION", "go.mod", "go.sum", "e2e/package.json",
                     "e2e/pnpm-lock.yaml", ".github/workflows/pages.yml",
                     "scripts/ci.py", "new-directory/data.json"):
            self.assertEqual(self.selected([path]), set(JOBS))

    def test_combined_changes(self):
        self.assertEqual(self.selected(["site/index.html", "main.go"]), set(JOBS))

    def test_full_and_empty(self):
        self.assertTrue(all(select([], full=True).values()))
        self.assertFalse(any(select([]).values()))

    def test_diff_includes_both_sides_of_rename_and_deleted_files(self):
        with tempfile.TemporaryDirectory() as directory:
            def git(*args):
                return subprocess.check_output(["git", "-C", directory, *args], text=True).strip()

            git("init", "-q")
            git("config", "user.email", "ci@example.invalid")
            git("config", "user.name", "CI test")
            root = Path(directory)
            (root / "site").mkdir()
            (root / "site" / "space and\nnewline.txt").write_text("fixture")
            git("add", ".")
            git("commit", "-qm", "base")
            base = git("rev-parse", "HEAD")
            (root / "site" / "space and\nnewline.txt").rename(root / "main.go")
            git("add", ".")
            git("commit", "-qm", "move")
            head = git("rev-parse", "HEAD")
            original = os.getcwd()
            try:
                os.chdir(directory)
                for event, payload in (
                    ("push", {"before": base, "after": head}),
                    ("pull_request", {"pull_request": {
                        "base": {"sha": base}, "head": {"sha": head},
                    }}),
                ):
                    self.assertEqual(set(changed_paths(event, payload)), {
                        "site/space and\nnewline.txt", "main.go",
                    })
            finally:
                os.chdir(original)

    def test_unavailable_diff_is_not_silently_empty(self):
        with patch("ci.subprocess.check_output", side_effect=subprocess.CalledProcessError(128, "git")):
            with self.assertRaises(subprocess.CalledProcessError):
                changed_paths("push", {"before": "0" * 40, "after": "abc"})

    def run_selector(self, event_name, event=None, **overrides):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "event.json").write_text(json.dumps(event or {}))
            env = {
                "GITHUB_EVENT_NAME": event_name,
                "GITHUB_EVENT_PATH": str(root / "event.json"),
                "GITHUB_OUTPUT": str(root / "output"),
                "GITHUB_STEP_SUMMARY": str(root / "summary"),
                "GITHUB_REF": "refs/heads/main", "FORCE_FULL": "false",
                **overrides,
            }
            with patch.dict(os.environ, env), patch("sys.argv", ["ci.py"]):
                self.assertEqual(main(), 0)
            self.assertIn("CI selection", (root / "summary").read_text())
            return dict(line.split("=") for line in (root / "output").read_text().splitlines())

    def test_scheduled_manual_reusable_and_release_runs_are_full(self):
        for event in ("schedule", "workflow_dispatch", "workflow_call"):
            self.assertEqual(set(self.run_selector(event).values()), {"true"})
        self.assertEqual(set(self.run_selector("push", GITHUB_REF="refs/tags/v1.0.5").values()), {"true"})
        self.assertEqual(set(self.run_selector("push", FORCE_FULL="true").values()), {"true"})

    def test_bad_event_falls_back_to_full(self):
        self.assertEqual(set(self.run_selector("push").values()), {"true"})

    def test_site_event_emits_exact_boolean_outputs(self):
        with patch("ci.changed_paths", return_value=["site/assets/site.css"]):
            self.assertEqual(self.run_selector("pull_request"), {
                job: "true" if job == "site" else "false" for job in JOBS
            })


class GateTests(unittest.TestCase):
    def setUp(self):
        self.needs = {
            "changes": {"result": "success", "outputs": {
                job: "true" if job == "site" else "false" for job in JOBS
            }},
            "semgrep": {"result": "success"},
            **{job: {"result": "success" if job == "site" else "skipped"} for job in JOBS},
        }

    def test_intentional_skips_pass(self):
        self.assertEqual(gate(self.needs), [])

    def test_required_failure_cancellation_skip_or_missing_fails(self):
        for job in ("site", "changes", "semgrep"):
            for result in ("failure", "cancelled", "skipped", "missing"):
                needs = copy.deepcopy(self.needs)
                needs[job]["result"] = result
                self.assertTrue(gate(needs), (job, result))

    def test_missing_output_fails(self):
        del self.needs["changes"]["outputs"]["test"]
        self.assertTrue(gate(self.needs))

    def test_missing_job_fails(self):
        del self.needs["site"]
        self.assertTrue(gate(self.needs))

    def test_full_success(self):
        for job in JOBS:
            self.needs["changes"]["outputs"][job] = "true"
            self.needs[job]["result"] = "success"
        self.assertEqual(gate(self.needs), [])


if __name__ == "__main__":
    unittest.main()
