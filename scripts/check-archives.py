#!/usr/bin/env python3
"""Verify packaged release contents and execute the host-native binary."""

import argparse
import hashlib
import platform
import re
import subprocess
import tarfile
import tempfile
import zipfile
from pathlib import Path


def check(root):
    checksums = {}
    for line in (root / "checksums.txt").read_text().splitlines():
        digest, name = line.split(maxsplit=1)
        assert re.fullmatch(r"[a-f0-9]{64}", digest), name
        assert Path(name).name == name and name not in checksums, name
        checksums[name] = digest

    host_os = {"Darwin": "darwin", "Linux": "linux", "Windows": "windows"}[platform.system()]
    host_arch = {"aarch64": "arm64", "arm64": "arm64", "AMD64": "amd64", "x86_64": "amd64"}[platform.machine()]
    seen = set()
    native_ran = False
    for name, digest in checksums.items():
        match = re.fullmatch(r"terradune_.+_(darwin|linux|windows)_(amd64|arm64)\.(tar\.gz|zip)", name)
        assert match, f"Unexpected release artifact: {name}"
        os_name, arch, extension = match.groups()
        assert (os_name, arch) not in seen, name
        seen.add((os_name, arch))
        archive = root / name
        assert hashlib.sha256(archive.read_bytes()).hexdigest() == digest, name
        binary = "terradune.exe" if os_name == "windows" else "terradune"
        assert extension == ("zip" if os_name == "windows" else "tar.gz"), name
        if extension == "zip":
            with zipfile.ZipFile(archive) as package:
                members = package.namelist()
                payload = package.read(binary)
        else:
            with tarfile.open(archive, "r:gz") as package:
                members = package.getnames()
                member = package.getmember(binary)
                assert member.isfile() and member.mode & 0o111, name
                payload = package.extractfile(member).read()
        assert set(members) == {binary, "LICENSE", "README.md", "CHANGELOG.md"}, (name, members)
        assert len(payload) > 1024, name
        if (os_name, arch) == (host_os, host_arch):
            # Extract only the verified executable, never arbitrary archive paths.
            with tempfile.TemporaryDirectory(prefix="terradune-archive-") as directory:
                executable = Path(directory) / binary
                executable.write_bytes(payload)
                executable.chmod(0o700)
                version = subprocess.check_output([str(executable), "-version"], text=True, timeout=15).strip()
                assert re.fullmatch(r"terradune v\d+\.\d+\.\d+(?:[-+].+)?", version), version
                result = subprocess.run([str(executable), "-print", str(Path(directory) / "missing")],
                                        capture_output=True, text=True, timeout=15)
                assert result.returncode != 0 and "terradune:" in result.stderr, result
                print(f"Executed {os_name}/{arch}: {version}; invalid workspace exits nonzero")
                native_ran = True
    expected = {(os_name, arch) for os_name in ("linux", "darwin", "windows") for arch in ("amd64", "arm64")}
    assert seen == expected, (seen, expected)
    assert native_ran, f"No archive for {host_os}/{host_arch}"
    print("Archive checks passed: six platforms, checksums, contents, executable mode, native startup")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, nargs="?", default=Path("dist"))
    check(parser.parse_args().directory)
