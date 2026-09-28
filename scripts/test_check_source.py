import importlib.util
from pathlib import Path
import subprocess
import shutil
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("check_source", Path(__file__).with_name("check-source.py"))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class SourceCheckTests(unittest.TestCase):
    def test_formatted_go_passes(self):
        with patch.object(source.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "", "")):
            self.assertEqual(source.check("gofmt", ["main.go"]), 0)

    def test_unformatted_go_fails_without_writing(self):
        with patch.object(source.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "main.go\n", "")) as run:
            self.assertEqual(source.check("gofmt", ["main.go"]), 1)
            self.assertEqual(run.call_args.args[0][:2], ["gofmt", "-l"])
            self.assertNotIn("-w", run.call_args.args[0])

    def test_syntax_errors_fail(self):
        for mode in ("gofmt", "javascript"):
            with patch.object(source.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", "syntax error")):
                self.assertEqual(source.check(mode, ["bad source"]), 1)

    def test_missing_tool_fails(self):
        with patch.object(source.subprocess, "run", side_effect=FileNotFoundError):
            self.assertEqual(source.check("javascript", ["file.js"]), 1)

    def test_javascript_checks_every_file_separately(self):
        results = [subprocess.CompletedProcess([], 0, "", ""), subprocess.CompletedProcess([], 1, "", "bad second file")]
        with patch.object(source.subprocess, "run", side_effect=results) as run:
            self.assertEqual(source.check("javascript", ["first.js", "second.js"]), 1)
            self.assertEqual(run.call_count, 2)
            self.assertTrue(run.call_args.args[0][-1].endswith("second.js"))

    def test_filenames_are_not_shell_commands_or_flags(self):
        path = "-name with spaces;$.js"
        with patch.object(source.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "", "")) as run:
            self.assertEqual(source.check("javascript", [path]), 0)
            self.assertEqual(run.call_args.args[0], ["node", "--check", str(Path(path).resolve())])
            self.assertNotIn("shell", run.call_args.kwargs)

    def test_empty_selection_does_not_require_tools(self):
        with patch.object(source.subprocess, "run") as run:
            self.assertEqual(source.check("gofmt", []), 0)
            run.assert_not_called()

    @unittest.skipUnless(shutil.which("gofmt"), "gofmt is not installed")
    def test_real_gofmt_rejects_unformatted_source_without_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "space in name.go"
            original = "package fixture\nfunc f(){println(1)}\n"
            path.write_text(original)
            self.assertEqual(source.check("gofmt", [path]), 1)
            self.assertEqual(path.read_text(), original)
            path.write_text("package fixture\n\nfunc f() { println(1) }\n")
            self.assertEqual(source.check("gofmt", [path]), 0)

    @unittest.skipUnless(shutil.which("node"), "Node.js is not installed")
    def test_real_javascript_rejects_invalid_second_file(self):
        with tempfile.TemporaryDirectory() as directory:
            good = Path(directory) / "good.js"
            bad = Path(directory) / "bad.js"
            good.write_text("const valid = 1;\n")
            bad.write_text("const broken = ;\n")
            self.assertEqual(source.check("javascript", [good, bad]), 1)
            self.assertEqual(bad.read_text(), "const broken = ;\n")
            bad.write_text("const fixed = 2;\n")
            self.assertEqual(source.check("javascript", [good, bad]), 0)


if __name__ == "__main__":
    unittest.main()
