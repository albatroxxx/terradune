"""Serve a temporary website snapshot at its real GitHub Pages prefix."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from shutil import copytree
from tempfile import TemporaryDirectory


if __name__ == "__main__":
    with TemporaryDirectory(prefix="terradune-site-") as root:
        copytree(Path(__file__).resolve().parents[1] / "site", Path(root) / "terradune")
        handler = partial(SimpleHTTPRequestHandler, directory=root)
        with ThreadingHTTPServer(("127.0.0.1", 18394), handler) as server:
            server.serve_forever()
