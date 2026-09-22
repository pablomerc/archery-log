#!/usr/bin/env python3
"""Local dev server.

python3 -m http.server sends Last-Modified but no Cache-Control, so browsers
heuristically cache your JS and you end up editing a file while the page keeps
running the old one. This sends no-store on everything, so a reload is always
a real reload.

    python3 serve.py [port]        # defaults to 8777
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # Service workers need a secure context; localhost counts as one.
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "GET" in (fmt % args) and " 200 " in (fmt % args):
            return  # quiet on the happy path
        super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print(f"Archery Log dev server → http://localhost:{port}  (no-cache)")
    print("Ctrl-C to stop.")
    try:
        ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
