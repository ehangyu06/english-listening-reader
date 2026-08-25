#!/usr/bin/env python3
"""Serve English Listening Reader on the local network so an iPad can open it."""

import json
import socket
import subprocess
import http.server
import socketserver
from pathlib import Path
from urllib.parse import unquote

import store

ROOT = Path(__file__).resolve().parent
PORT = 5174


def lan_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def bonjour_host():
    try:
        result = subprocess.run(
            ["scutil", "--get", "LocalHostName"],
            capture_output=True,
            text=True,
            check=True,
        )
        name = result.stdout.strip()
        if name:
            return "%s.local" % name
    except (OSError, subprocess.CalledProcessError):
        pass
    return "your-mac.local"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        sys_stderr = __import__("sys").stderr
        sys_stderr.write("%s - %s\n" % (self.address_string(), format % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def _send_bytes(self, code, body, content_type="application/json; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _send_json(self, code, payload):
        self._send_bytes(code, json.dumps(payload, ensure_ascii=False))

    def _api_parts(self):
        path = unquote(self.path.split("?", 1)[0])
        return path, [part for part in path.split("/") if part]

    def do_GET(self):
        for header_name in ("If-Modified-Since", "If-None-Match"):
            if header_name in self.headers:
                try:
                    del self.headers[header_name]
                except Exception:
                    pass
        path, parts = self._api_parts()
        if path == "/__lan.json":
            ip = lan_ip()
            bonjour = bonjour_host()
            self._send_json(
                200,
                {
                    "ip": ip,
                    "port": PORT,
                    "url": "http://%s:%s" % (ip, PORT),
                    "bonjour": bonjour,
                    "bonjourUrl": "http://%s:%s" % (bonjour, PORT),
                },
            )
            return
        if path == "/api/state":
            self._send_json(200, store.get_state())
            return
        if len(parts) == 4 and parts[0] == "api" and parts[1] in ("images", "audio") and parts[3] == "exists":
            self._send_json(200, {"exists": store.blob_exists(parts[1], parts[2])})
            return
        if len(parts) == 3 and parts[0] == "api" and parts[1] in ("images", "audio"):
            blob = store.get_blob(parts[1], parts[2])
            if not blob:
                self._send_json(404, {"error": "not found"})
                return
            self._send_bytes(
                200,
                blob["data"],
                blob["mimeType"],
                {"X-File-Name": blob["fileName"] or ""},
            )
            return
        return super().do_GET()

    def do_PUT(self):
        path, parts = self._api_parts()
        try:
            if len(parts) == 3 and parts[0] == "api" and parts[1] == "lessons":
                lesson = json.loads(self._read_body().decode("utf-8") or "{}")
                lesson["id"] = parts[2]
                store.put_lesson(lesson)
                self._send_json(200, {"ok": True})
                return
            if len(parts) == 3 and parts[0] == "api" and parts[1] == "settings":
                payload = json.loads(self._read_body().decode("utf-8") or "{}")
                store.put_setting(parts[2], payload.get("value"))
                self._send_json(200, {"ok": True})
                return
            if len(parts) == 3 and parts[0] == "api" and parts[1] in ("images", "audio"):
                store.put_blob(
                    parts[1],
                    parts[2],
                    self._read_body(),
                    self.headers.get("Content-Type") or "",
                    unquote(self.headers.get("X-File-Name") or ""),
                )
                self._send_json(200, {"ok": True})
                return
        except (ValueError, json.JSONDecodeError) as error:
            self._send_json(400, {"error": str(error)})
            return
        self._send_json(404, {"error": "not found"})

    def do_DELETE(self):
        path, parts = self._api_parts()
        try:
            if len(parts) == 3 and parts[0] == "api" and parts[1] == "lessons":
                store.delete_lesson(parts[2])
                self._send_json(200, {"ok": True})
                return
            if len(parts) == 3 and parts[0] == "api" and parts[1] in ("images", "audio"):
                store.delete_blob(parts[1], parts[2])
                self._send_json(200, {"ok": True})
                return
        except ValueError as error:
            self._send_json(400, {"error": str(error)})
            return
        self._send_json(404, {"error": "not found"})


class IPv4Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    address_family = socket.AF_INET


def main():
    ip = lan_ip()
    bonjour = bonjour_host()
    with IPv4Server(("0.0.0.0", PORT), Handler) as httpd:
        print("English Listening Reader", flush=True)
        print(flush=True)
        print("localhost  http://127.0.0.1:%s" % PORT, flush=True)
        print("Bonjour    http://%s:%s" % (bonjour, PORT), flush=True)
        print("LAN        http://%s:%s" % (ip, PORT), flush=True)
        print(flush=True)
        print("아이패드는 Bonjour 주소를 북마크하세요. IP가 바뀌어도 같습니다.", flush=True)
        print("맥이 켜져 있으면 Platform Manager가 이 서버를 자동으로 켭니다.", flush=True)
        print(flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n서버를 종료합니다.")


if __name__ == "__main__":
    main()
