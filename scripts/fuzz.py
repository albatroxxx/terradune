"""Run every Go fuzz target for a short while.

Targets are discovered from the test files, so a new `func FuzzX(f *testing.F)`
is exercised by CI without editing this script or the workflow. Go runs one
target per invocation, hence one `go test` per target.
"""

import argparse
import pathlib
import re
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGET = re.compile(r"^func (Fuzz\w+)\(\w+ \*testing\.F\)", re.MULTILINE)
SKIP = {"examples", "node_modules", "testdata", ".git", ".cache"}


def discover(root):
    """Return (package directory, target name) pairs, in a stable order."""
    found = []
    for path in sorted(root.rglob("*_test.go")):
        if SKIP.intersection(path.relative_to(root).parts):
            continue
        package = path.parent.relative_to(root).as_posix()
        for name in TARGET.findall(path.read_text()):
            found.append((package if package != "." else "", name))
    return found


def command(package, name, fuzztime):
    return ["go", "test", "-run=^$", f"-fuzz=^{name}$", f"-fuzztime={fuzztime}",
            "./" + package if package else "."]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fuzztime", default="10s", help="per-target budget, a Go duration")
    parser.add_argument("--list", action="store_true", help="print the targets and exit")
    args = parser.parse_args(argv)
    targets = discover(ROOT)
    if not targets:
        print("no fuzz targets found", file=sys.stderr)
        return 1
    for package, name in targets:
        print(f"== {package or '.'} {name} ({args.fuzztime})", flush=True)
        if not args.list:
            subprocess.run(command(package, name, args.fuzztime), cwd=ROOT, check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
