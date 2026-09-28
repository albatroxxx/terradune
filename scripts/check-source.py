"""Read-only source checks for filenames provided by pre-commit."""

from pathlib import Path
import subprocess
import sys


def check(mode, paths):
    failed = False
    for path in paths:
        # Absolute paths also keep filenames beginning with '-' from becoming flags.
        filename = str(Path(path).resolve())
        command = ["gofmt", "-l", filename] if mode == "gofmt" else ["node", "--check", filename]
        try:
            result = subprocess.run(command, capture_output=True, text=True, check=False)
        except FileNotFoundError:
            print(f"{command[0]} is required for this check; install it and retry.", file=sys.stderr)
            return 1
        if result.returncode or (mode == "gofmt" and result.stdout.strip()):
            failed = True
            print(f"{path}: {mode} check failed", file=sys.stderr)
            print(result.stdout + result.stderr, file=sys.stderr)
            if mode == "gofmt" and result.returncode == 0:
                print("Run gofmt -w on this file, review the change, and stage it again.", file=sys.stderr)
    return int(failed)


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("gofmt", "javascript"):
        sys.exit("Usage: check-source.py {gofmt|javascript} [files ...]")
    sys.exit(check(sys.argv[1], sys.argv[2:]))
