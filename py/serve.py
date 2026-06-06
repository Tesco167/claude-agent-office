"""Silent HTTP server for the office dashboard.

Launched by serve.ps1 (and the autostart task) via pythonw.exe so there is no
console window. A plain `pythonw -m http.server` does NOT work when run detached:
with no console its std handles are unusable, so http.server's per-request logger
aborts the response mid-flight and the browser sees ERR_EMPTY_RESPONSE (the socket
still binds, so the port appears to be listening). Redirecting stdout/stderr to the
void makes request logging a harmless no-op, so requests serve correctly.

Serves the repo root (this file lives in py/) on port 8765.
"""
import http.server
import os
import sys

PORT = 8765

# Serve the repo root regardless of where the launcher set the working directory.
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Under pythonw the std handles can't be written to; silence all logging output.
sys.stdout = sys.stderr = open(os.devnull, "w")

# ThreadingHTTPServer matches `python -m http.server` (allow_reuse_address + threads).
with http.server.ThreadingHTTPServer(("", PORT), http.server.SimpleHTTPRequestHandler) as httpd:
    httpd.serve_forever()
