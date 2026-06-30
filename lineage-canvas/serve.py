#!/usr/bin/env python3
"""Serve the built Lineage Canvas app using only Python (no Node/npm required).

The app is a local-first static site: once built into ``dist/`` it runs entirely
in the browser. This script serves that ``dist/`` folder over HTTP so you can run
the app on a machine that has Python but cannot install Node/npm.

Usage:
    python3 serve.py            # serve dist/ on http://localhost:5173 and open a browser
    python3 serve.py --port 8000
    python3 serve.py --no-browser
    python3 serve.py --dir some/other/build/dir

Note: this only *runs* an existing build. Producing/refreshing ``dist/`` still
requires Node (`npm run build`) on a build machine; copy the resulting ``dist/``
folder here and serve it with this script.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import sys
import threading
import webbrowser
from pathlib import Path

DEFAULT_PORT = 5173
DEFAULT_DIR = "dist"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", "-p", type=int, default=DEFAULT_PORT, help=f"Port to listen on (default {DEFAULT_PORT}).")
    parser.add_argument("--dir", "-d", default=DEFAULT_DIR, help=f"Directory to serve (default '{DEFAULT_DIR}').")
    parser.add_argument("--host", default="127.0.0.1", help="Host/interface to bind (default 127.0.0.1).")
    parser.add_argument("--no-browser", action="store_true", help="Do not auto-open a browser.")
    args = parser.parse_args()

    # Resolve the directory relative to this script so it works from any CWD.
    serve_dir = (Path(__file__).resolve().parent / args.dir).resolve()
    if not serve_dir.is_dir() or not (serve_dir / "index.html").is_file():
        print(f"error: '{serve_dir}' does not look like a built app (no index.html).", file=sys.stderr)
        print("Build it first on a machine with Node: `npm run build`, then copy the dist/ folder here.", file=sys.stderr)
        return 1

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(serve_dir))
    # Allow quick restarts without 'Address already in use'.
    http.server.ThreadingHTTPServer.allow_reuse_address = True

    try:
        httpd = http.server.ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as exc:
        print(f"error: could not bind {args.host}:{args.port} — {exc}", file=sys.stderr)
        print("Try a different port: python3 serve.py --port 8000", file=sys.stderr)
        return 1

    url = f"http://{'localhost' if args.host in ('127.0.0.1', '0.0.0.0') else args.host}:{args.port}/"
    print(f"Serving {serve_dir}")
    print(f"Lineage Canvas running at {url}")
    print("Press Ctrl+C to stop.")

    if not args.no_browser and os.environ.get("NO_BROWSER") is None:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
