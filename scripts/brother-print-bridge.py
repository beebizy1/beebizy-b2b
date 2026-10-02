#!/usr/bin/env python3
"""Local-only USB bridge for printing Beebizy Brother QL-800 badge jobs."""

from __future__ import annotations

import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from brother_ql.backends import backend_factory


HOST = "127.0.0.1"
PORT = 8765
PRINTER = "usb://0x04f9:0x209b"
ALLOWED_ORIGINS = {
    "https://beebizy-studio-preview.vercel.app",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:4180",
    "http://127.0.0.1:4191",
    "http://localhost:4173",
    "http://localhost:4180",
    "http://localhost:4191",
}
MAX_JOB_BYTES = 100_000


class PrintHandler(BaseHTTPRequestHandler):
    server_version = "BeebizyBrotherBridge/1.0"

    def _origin_allowed(self) -> bool:
        return self.headers.get("Origin", "") in ALLOWED_ORIGINS

    def _send_headers(self, status: int, content_type: str = "application/json") -> None:
        self.send_response(status)
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", content_type)
        self.end_headers()

    def _json(self, status: int, payload: dict[str, object]) -> None:
        self._send_headers(status)
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self) -> None:  # noqa: N802 - stdlib handler API
        if not self._origin_allowed():
            self._json(403, {"ok": False, "error": "Origin is not allowed."})
            return
        self._send_headers(204)

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        if self.path != "/health":
            self._json(404, {"ok": False, "error": "Not found."})
            return
        self._json(200, {"ok": True, "printer": "Brother QL-800"})

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler API
        if self.path != "/print":
            self._json(404, {"ok": False, "error": "Not found."})
            return
        if not self._origin_allowed():
            self._json(403, {"ok": False, "error": "Origin is not allowed."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"ok": False, "error": "Invalid job size."})
            return
        if length <= 0 or length > MAX_JOB_BYTES:
            self._json(400, {"ok": False, "error": "Invalid badge job."})
            return
        job = self.rfile.read(length)
        backend_class = backend_factory("pyusb")["backend_class"]
        backend = None
        try:
            backend = backend_class(PRINTER)
            backend.write(job)
        except Exception as error:  # USB libraries expose several backend-specific errors.
            logging.exception("Brother QL-800 print failed")
            self._json(503, {"ok": False, "error": str(error)})
            return
        finally:
            if backend is not None:
                backend.dispose()
        self._json(200, {"ok": True, "bytes": len(job)})

    def log_message(self, message: str, *args: object) -> None:
        logging.info("%s - %s", self.address_string(), message % args)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    server = ThreadingHTTPServer((HOST, PORT), PrintHandler)
    logging.info("Beebizy Brother bridge ready at http://%s:%d", HOST, PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
