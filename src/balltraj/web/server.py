"""Serveur local : fichiers statiques + API JSON. Bibliothèque standard uniquement.

    trajectoire-web                # ouvre http://127.0.0.1:8765 dans le navigateur
    trajectoire-web --port 9000 --no-browser

Le serveur n'écoute que sur 127.0.0.1 : rien n'est exposé sur le réseau.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from . import api

STATIC = Path(__file__).parent / "static"
MAX_BODY = 64 * 1024
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("text/javascript", ".js")

POST_ROUTES = {
    "/api/simulate": api.run_simulation,
    "/api/optimal": api.run_optimal,
    "/api/target": api.run_target,
}


class Handler(BaseHTTPRequestHandler):
    server_version = "balltraj"

    def log_message(self, format: str, *args: Any) -> None:  # silence : pas de bruit dans le terminal
        pass

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, data: Any) -> None:
        self._send(
            status, json.dumps(data, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8"
        )

    def do_GET(self) -> None:
        route = self.path.split("?", 1)[0]
        if route == "/api/meta":
            self._json(HTTPStatus.OK, api.meta())
            return
        relative = "index.html" if route == "/" else route.lstrip("/")
        target = (STATIC / relative).resolve()
        if STATIC.resolve() not in target.parents or not target.is_file():
            self._json(HTTPStatus.NOT_FOUND, {"error": "introuvable"})
            return
        kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if kind.startswith("text/") or kind.endswith("javascript"):
            kind += "; charset=utf-8"
        self._send(HTTPStatus.OK, target.read_bytes(), kind)

    def do_POST(self) -> None:
        handler = POST_ROUTES.get(self.path.split("?", 1)[0])
        if handler is None:
            self._json(HTTPStatus.NOT_FOUND, {"error": "introuvable"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if not 0 <= length <= MAX_BODY:
            self._json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "requête trop grande"})
            return
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(payload, dict):
                raise api.ApiError("le corps doit être un objet JSON")
            self._json(HTTPStatus.OK, handler(payload))
        except (api.ApiError, json.JSONDecodeError) as exc:
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # calcul impossible : on le dit au lieu de couper la connexion
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"échec du calcul : {exc}"})


def make_server(port: int = 8765) -> ThreadingHTTPServer:
    """Serveur lié à 127.0.0.1 (port 0 : le système choisit un port libre)."""
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main() -> None:
    p = argparse.ArgumentParser(description="Interface web du simulateur de trajectoire.")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--no-browser", action="store_true", help="n'ouvre pas le navigateur")
    args = p.parse_args()
    server = make_server(args.port)
    url = f"http://127.0.0.1:{server.server_address[1]}"
    print(f"Trajectoire : {url}   (Ctrl+C pour arrêter)")
    if not args.no_browser:
        threading.Timer(0.4, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
