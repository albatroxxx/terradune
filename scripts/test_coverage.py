import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "coverage_check", Path(__file__).with_name("check-coverage.py"),
)
coverage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coverage)


def profile(covered=85, uncovered=15):
    lines = ["mode: atomic"]
    for package in sorted(coverage.REQUIRED):
        lines.extend([
            f"{package}/source.go:1.1,2.2 {covered} 3",
            f"{package}/source.go:3.1,4.2 {uncovered} 0",
        ])
    return "\n".join(lines) + "\n"


class CoverageTests(unittest.TestCase):
    def test_threshold_and_statement_weighting(self):
        text, failed = coverage.report(coverage.measure(profile()))
        self.assertFalse(failed)
        self.assertIn("85.0%", text)
        self.assertTrue(coverage.report(coverage.measure(profile(84, 16)))[1])

    def test_no_rounding_up_to_pass(self):
        self.assertTrue(coverage.report(coverage.measure(profile(84999, 15001)))[1])

    def test_each_package_not_only_total(self):
        data = coverage.measure(profile(100, 0))
        data[coverage.MODULE] = (0, 1)
        self.assertTrue(coverage.report(data)[1])

    def test_new_packages_are_measured(self):
        data = coverage.measure(profile() + f"{coverage.MODULE}/internal/new/x.go:1.1,2.2 10 0\n")
        self.assertTrue(coverage.report(data)[1])

    def test_invalid_or_incomplete_profiles_fail_closed(self):
        for invalid in ("", "mode: atomic\n", profile().replace("atomic", "bad"),
                        profile() + "malformed\n", profile() + profile().splitlines()[1] + "\n",
                        profile().replace(" 85 3", " -85 3"),
                        profile().replace("1.1,2.2", "2.2,1.1"),
                        profile().replace("1.1,2.2", "0.1,2.2"),
                        profile().replace(coverage.MODULE, "other/module"),
                        profile(0, 0)):
            with self.subTest(profile=invalid), self.assertRaises(ValueError):
                coverage.measure(invalid)


if __name__ == "__main__":
    unittest.main()
