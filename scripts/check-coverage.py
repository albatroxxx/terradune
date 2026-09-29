"""Enforce a statement-coverage floor for each production Go package."""

from pathlib import Path, PurePosixPath
import re
import sys


MODULE = "github.com/albatroxxx/terradune"
REQUIRED = {MODULE, *(f"{MODULE}/internal/{p}" for p in (
    "graph", "ingest", "server", "watch",
))}
MINIMUM = 85
BLOCK = re.compile(r"(.+\.go):(\d+)\.(\d+),(\d+)\.(\d+) (\d+) (\d+)")


def measure(profile):
    lines = profile.splitlines()
    if not lines or lines[0] not in ("mode: set", "mode: count", "mode: atomic"):
        raise ValueError("missing or unsupported coverage mode")
    packages = {}
    seen = set()
    for line in lines[1:]:
        match = BLOCK.fullmatch(line)
        if not match:
            raise ValueError(f"invalid coverage block: {line!r}")
        filename, *numbers = match.groups()
        start_line, start_col, end_line, end_col, statements, count = map(int, numbers)
        if min(start_line, start_col, end_line, end_col) < 1 or (
            start_line, start_col
        ) > (end_line, end_col):
            raise ValueError("invalid source range")
        key = (filename, start_line, start_col, end_line, end_col)
        if key in seen:
            raise ValueError("duplicate coverage block")
        seen.add(key)
        package = str(PurePosixPath(filename).parent)
        if package != MODULE and not package.startswith(MODULE + "/"):
            raise ValueError(f"unexpected module: {package}")
        covered, total = packages.get(package, (0, 0))
        packages[package] = (covered + (statements if count else 0), total + statements)
    missing = REQUIRED - packages.keys()
    if missing:
        raise ValueError(f"missing production packages: {', '.join(sorted(missing))}")
    if any(total == 0 for _, total in packages.values()):
        raise ValueError("package has no measured statements")
    return packages


def report(packages):
    failed = False
    lines = ["## Go statement coverage", "", "| Package | Coverage | Minimum |",
             "| --- | ---: | ---: |"]
    for package, (covered, total) in sorted(packages.items()):
        failed |= covered * 100 < total * MINIMUM
        lines.append(f"| {package} | {covered / total:.1%} | {MINIMUM}% |")
    covered = sum(pair[0] for pair in packages.values())
    total = sum(pair[1] for pair in packages.values())
    lines.extend(["", f"Total: **{covered / total:.1%}**.", "",
                  "Statement coverage is not branch coverage or proof of correctness."])
    return "\n".join(lines), failed


def main():
    if len(sys.argv) != 2:
        print("usage: check-coverage.py <go-coverprofile>", file=sys.stderr)
        return 1
    try:
        text, failed = report(measure(Path(sys.argv[1]).read_text()))
    except (OSError, ValueError) as error:
        print(f"Coverage check failed: {error}", file=sys.stderr)
        return 1
    print(text)
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())
