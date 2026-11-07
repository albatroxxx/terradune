import pathlib
import tempfile
import unittest

import fuzz


class DiscoverTests(unittest.TestCase):
    def test_finds_targets_by_package_and_skips_fixtures(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "main_test.go").write_text(
                "package main\n\nfunc FuzzListenAddress(f *testing.F) {}\n"
                "func TestFuzzy(t *testing.T) {}\n"
            )
            pkg = root / "internal" / "graph"
            pkg.mkdir(parents=True)
            (pkg / "fuzz_test.go").write_text(
                "package graph\n\nfunc FuzzBuild(x *testing.F) {}\nfunc FuzzDOT(f *testing.F) {\n}\n"
            )
            (pkg / "graph.go").write_text("package graph\n\nfunc FuzzNotATest(f *testing.F) {}\n")
            fixtures = root / "internal" / "ingest" / "testdata" / "fakecli"
            fixtures.mkdir(parents=True)
            (fixtures / "main_test.go").write_text("package main\n\nfunc FuzzIgnored(f *testing.F) {}\n")
            examples = root / "examples" / "x"
            examples.mkdir(parents=True)
            (examples / "x_test.go").write_text("package x\n\nfunc FuzzIgnored(f *testing.F) {}\n")
            self.assertEqual(fuzz.discover(root), [
                ("internal/graph", "FuzzBuild"),
                ("internal/graph", "FuzzDOT"),
                ("", "FuzzListenAddress"),
            ])

    def test_command_runs_one_target_in_its_package(self):
        self.assertEqual(fuzz.command("internal/graph", "FuzzBuild", "8s"),
                         ["go", "test", "-run=^$", "-fuzz=^FuzzBuild$", "-fuzztime=8s", "./internal/graph"])
        self.assertEqual(fuzz.command("", "FuzzListenAddress", "10s")[-1], ".")

    def test_repository_has_targets_in_every_production_package(self):
        packages = {package for package, _ in fuzz.discover(fuzz.ROOT)}
        self.assertTrue({"", "internal/graph", "internal/ingest", "internal/server"} <= packages, packages)


if __name__ == "__main__":
    unittest.main()
