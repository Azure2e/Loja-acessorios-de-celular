#!/usr/bin/env python3
"""Loja NEXO: arquivos estáticos + API Mercado Pago (Pix e Checkout Pro)."""
from __future__ import annotations

import base64
import sqlite3
import gzip
import hashlib
import hmac
import http.cookies
import http.server
import io
import json
import os
import socket
import socketserver
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8080"))
MP_API = "https://api.mercadopago.com"
PAYMENTS: dict = {}
SESSIONS: dict = {}
LOGS: deque = deque(maxlen=300)
STORE_LOCK = threading.Lock()
STORE_PATH = ROOT / "data" / "store.json"
DB_PATH = ROOT / "data" / "nexo.db"


def jwt_secret() -> str:
    env = os.environ.get("NEXO_JWT_SECRET", "").strip()
    if env:
        return env
    cfg = ROOT / "admin-config.json"
    if cfg.is_file():
        try:
            return str(json.loads(cfg.read_text(encoding="utf-8")).get("jwt_secret") or "nexo-dev-secret").strip()
        except Exception:
            return "nexo-dev-secret"
    return "nexo-dev-secret"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def jwt_encode(payload: dict) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(jwt_secret().encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{_b64url(sig)}"


def jwt_decode(token: str) -> dict | None:
    try:
        header_b, body_b, sig_b = token.split(".")
        expect = hmac.new(jwt_secret().encode(), f"{header_b}.{body_b}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64url(expect), sig_b):
            return None
        data = json.loads(_b64url_decode(body_b))
        if int(data.get("exp") or 0) < int(time.time()):
            return None
        return data
    except Exception:
        return None


def admin_password() -> str:
    env = os.environ.get("NEXO_ADMIN_PASSWORD", "").strip()
    if env:
        return env
    cfg = ROOT / "admin-config.json"
    if cfg.is_file():
        try:
            return str(json.loads(cfg.read_text(encoding="utf-8")).get("password") or "").strip()
        except Exception:
            return ""
    return ""


def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    con = db()
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          name TEXT,
          category TEXT,
          price REAL,
          old_price REAL,
          stock INTEGER,
          compat TEXT,
          rating REAL,
          image TEXT,
          descr TEXT
        );
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          created TEXT,
          status TEXT,
          payload TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created TEXT,
          line TEXT
        );
        """
    )
    count = con.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    if count == 0 and STORE_PATH.is_file():
        try:
            raw = json.loads(STORE_PATH.read_text(encoding="utf-8"))
        except Exception:
            raw = {}
        for p in raw.get("products") or []:
            con.execute(
                "INSERT OR REPLACE INTO products VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    p.get("id"), p.get("name"), p.get("category"), p.get("price") or 0,
                    p.get("old"), p.get("stock") or 0, p.get("compat"), p.get("rating") or 0,
                    p.get("image"), p.get("desc"),
                ),
            )
        for o in raw.get("orders") or []:
            con.execute(
                "INSERT OR REPLACE INTO orders VALUES (?,?,?,?)",
                (o.get("id"), o.get("date"), o.get("status"), json.dumps(o, ensure_ascii=False)),
            )
        for k, v in (raw.get("settings") or {}).items():
            con.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (k, json.dumps(v, ensure_ascii=False)))
    con.commit()
    con.close()


def product_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "price": row["price"],
        "old": row["old_price"],
        "stock": row["stock"],
        "compat": row["compat"] or "",
        "rating": row["rating"] or 0,
        "image": row["image"] or "",
        "desc": row["descr"] or "",
    }


def load_store() -> dict:
    init_db()
    con = db()
    products = [product_row(r) for r in con.execute("SELECT * FROM products ORDER BY name")]
    orders = []
    for r in con.execute("SELECT payload FROM orders ORDER BY created DESC"):
        try:
            orders.append(json.loads(r["payload"]))
        except Exception:
            pass
    settings = {}
    for r in con.execute("SELECT key, value FROM settings"):
        try:
            settings[r["key"]] = json.loads(r["value"])
        except Exception:
            settings[r["key"]] = r["value"]
    con.close()
    return {"products": products, "orders": orders, "settings": settings}


def save_store(store: dict) -> None:
    init_db()
    con = db()
    con.execute("DELETE FROM products")
    for p in store.get("products") or []:
        con.execute(
            "INSERT OR REPLACE INTO products VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                p.get("id"), p.get("name"), p.get("category"), p.get("price") or 0,
                p.get("old"), p.get("stock") or 0, p.get("compat"), p.get("rating") or 0,
                p.get("image"), p.get("desc"),
            ),
        )
    con.execute("DELETE FROM orders")
    for o in store.get("orders") or []:
        con.execute(
            "INSERT OR REPLACE INTO orders VALUES (?,?,?,?)",
            (o.get("id"), o.get("date") or o.get("created"), o.get("status"), json.dumps(o, ensure_ascii=False)),
        )
    con.execute("DELETE FROM settings")
    for k, v in (store.get("settings") or {}).items():
        con.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (k, json.dumps(v, ensure_ascii=False)))
    con.commit()
    con.close()
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")

POLICY = {
    ".html": "public, max-age=0, must-revalidate",
    ".txt": "public, max-age=0, must-revalidate",
    ".json": "public, max-age=0, must-revalidate",
    ".js": "public, max-age=31536000, immutable",
    ".css": "public, max-age=31536000, immutable",
    ".webp": "public, max-age=31536000, immutable",
    ".jpg": "public, max-age=31536000, immutable",
    ".jpeg": "public, max-age=31536000, immutable",
    ".png": "public, max-age=31536000, immutable",
    ".svg": "public, max-age=31536000, immutable",
    ".woff2": "public, max-age=31536000, immutable",
    ".ico": "public, max-age=31536000, immutable",
}
COMPRESSIBLE = {".html", ".css", ".js", ".svg", ".json", ".txt"}


def mp_config() -> dict:
    data = {}
    cfg = ROOT / "mp-config.json"
    if cfg.is_file():
        try:
            data = json.loads(cfg.read_text(encoding="utf-8"))
        except Exception:
            data = {}
    return data


def access_token() -> str:
    env = os.environ.get("MP_ACCESS_TOKEN", "").strip()
    if env:
        return env
    return str(mp_config().get("access_token") or "").strip()


def lan_ips() -> list[str]:
    found: list[str] = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        found.append(sock.getsockname()[0])
        sock.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.append(info[4][0])
    except Exception:
        pass
    out = []
    for ip in found:
        if ip and not ip.startswith("127.") and ip not in out:
            out.append(ip)
    return out or ["127.0.0.1"]


def qr_page() -> bytes:
    cards = []
    for ip in lan_ips():
        url = f"http://{ip}:{PORT}"
        img = "https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=" + urllib.request.quote(url, safe="")
        cards.append(
            f'<div class="card"><img src="{img}" alt="QR"><p><b>{url}</b></p></div>'
        )
    html = f"""<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Entrar no celular</title>
<style>
body{{font-family:system-ui,sans-serif;background:#141414;color:#fff;margin:0;padding:2rem;text-align:center}}
.card{{display:inline-block;background:#fff;color:#141414;border-radius:20px;padding:1rem;margin:.75rem}}
img{{width:280px;height:280px}}
p{{margin:.75rem 0 0}}
.sub{{opacity:.7}}
</style></head>
<body>
<h1>Escaneie para abrir a loja</h1>
<p class="sub">Celular e PC na mesma Wi-Fi. Deixe o server.py ligado.</p>
{''.join(cards)}
</body></html>"""
    return html.encode("utf-8")


def public_key() -> str:
    env = os.environ.get("MP_PUBLIC_KEY", "").strip()
    if env:
        return env
    return str(mp_config().get("public_key") or "").strip()


def mp_request(method: str, path: str, body: dict | None = None, idem: str | None = None) -> tuple[int, dict]:
    token = access_token()
    if not token:
        return 401, {"error": "missing_token", "message": "Configure MP_ACCESS_TOKEN ou mp-config.json"}
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        MP_API + path,
        data=data,
        method=method,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    if idem:
        req.add_header("X-Idempotency-Key", idem)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode("utf-8") or "{}"
            return res.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"error": raw[:500]}
        return exc.code, payload
    except Exception as exc:
        return 502, {"error": "network", "message": str(exc)}


def extract_pix(pay: dict) -> dict:
    poi = ((pay.get("point_of_interaction") or {}).get("transaction_data") or {})
    return {
        "id": pay.get("id"),
        "status": pay.get("status"),
        "status_detail": pay.get("status_detail"),
        "amount": pay.get("transaction_amount"),
        "qr_code": poi.get("qr_code") or "",
        "qr_base64": poi.get("qr_code_base64") or "",
        "ticket_url": poi.get("ticket_url") or "",
        "external_reference": pay.get("external_reference") or "",
    }


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("X-Content-Type-Options", "nosniff")
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def json_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            return {}

    def reply_json(self, code: int, payload: dict, cookie: str | None = None):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def session_ok(self) -> bool:
        auth = self.headers.get("Authorization") or ""
        token = ""
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
        if not token:
            raw = self.headers.get("Cookie") or ""
            try:
                jar = http.cookies.SimpleCookie(raw)
                morsel = jar.get("nexo_admin")
                token = morsel.value if morsel else ""
            except Exception:
                token = ""
        data = jwt_decode(token) if token else None
        if data and data.get("role") == "admin":
            return True
        return bool(token and token in SESSIONS)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/qr", "/qr.html", "/entrar"):
            data = qr_page()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return
        if path == "/api/catalog":
            store = load_store()
            return self.reply_json(200, {
                "products": store.get("products") or [],
                "settings": store.get("settings") or {},
            })
        if path == "/api/admin/me":
            return self.reply_json(200, {"ok": self.session_ok()})
        if path == "/api/admin/logs":
            if not self.session_ok():
                return self.reply_json(401, {"error": "unauthorized"})
            rows = list(LOGS)
            try:
                init_db()
                con = db()
                extra = con.execute("SELECT created AS time, line FROM logs ORDER BY id DESC LIMIT 200").fetchall()
                con.close()
                if extra:
                    rows = [{"time": r["time"], "line": r["line"]} for r in extra]
            except Exception:
                pass
            return self.reply_json(200, {"logs": rows, "database": str(DB_PATH)})
        if path == "/api/admin/store":
            if not self.session_ok():
                return self.reply_json(401, {"error": "unauthorized"})
            return self.reply_json(200, load_store())
        if path == "/api/mp/status":
            token = access_token()
            return self.reply_json(200, {
                "configured": bool(token),
                "public_key": public_key(),
                "mode": "mercadopago" if token else "local",
            })
        if path.startswith("/api/mp/payment/"):
            pid = path.rsplit("/", 1)[-1]
            cached = PAYMENTS.get(str(pid))
            code, pay = mp_request("GET", f"/v1/payments/{pid}")
            if code >= 400:
                if cached:
                    return self.reply_json(200, cached)
                return self.reply_json(code, pay)
            info = extract_pix(pay)
            PAYMENTS[str(pid)] = info
            return self.reply_json(200, info)
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        body = self.json_body()
        if path == "/api/admin/login":
            if (body.get("password") or "") != admin_password() or not admin_password():
                return self.reply_json(401, {"error": "senha incorreta"})
            token = jwt_encode({
                "role": "admin",
                "iat": int(time.time()),
                "exp": int(time.time()) + 60 * 60 * 12,
            })
            SESSIONS[token] = True
            return self.reply_json(200, {"ok": True, "token": token, "token_type": "Bearer"}, cookie=f"nexo_admin={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200")
        if path == "/api/admin/logout":
            return self.reply_json(200, {"ok": True}, cookie="nexo_admin=; Path=/; Max-Age=0")
        if path == "/api/orders":
            store = load_store()
            order = body if isinstance(body, dict) else {}
            if not order.get("id"):
                order["id"] = "NX" + uuid.uuid4().hex[:6].upper()
            order.setdefault("status", "Novo")
            with STORE_LOCK:
                store = load_store()
                store.setdefault("orders", []).insert(0, order)
                for item in order.get("items") or []:
                    for p in store.get("products") or []:
                        if p.get("id") == item.get("id"):
                            p["stock"] = max(0, int(p.get("stock") or 0) - int(item.get("qty") or 0))
                save_store(store)
            return self.reply_json(200, {"ok": True, "id": order["id"]})
        if path == "/api/admin/product":
            if not self.session_ok():
                return self.reply_json(401, {"error": "unauthorized"})
            with STORE_LOCK:
                store = load_store()
                products = store.setdefault("products", [])
                item = body
                if not item.get("id"):
                    item["id"] = "p" + uuid.uuid4().hex[:4]
                found = False
                for i, p in enumerate(products):
                    if p.get("id") == item.get("id"):
                        products[i] = {**p, **item}
                        found = True
                        break
                if not found:
                    item.setdefault("stock", 0)
                    item.setdefault("image", "images/capa-silicone.jpg")
                    products.append(item)
                save_store(store)
            return self.reply_json(200, {"ok": True, "id": item["id"]})
        if path == "/api/admin/product-delete":
            if not self.session_ok():
                return self.reply_json(401, {"error": "unauthorized"})
            pid = body.get("id")
            with STORE_LOCK:
                store = load_store()
                store["products"] = [p for p in store.get("products") or [] if p.get("id") != pid]
                save_store(store)
            return self.reply_json(200, {"ok": True})
        if path == "/api/admin/order-status":
            if not self.session_ok():
                return self.reply_json(401, {"error": "unauthorized"})
            with STORE_LOCK:
                store = load_store()
                for o in store.get("orders") or []:
                    if o.get("id") == body.get("id"):
                        o["status"] = body.get("status") or o.get("status")
                save_store(store)
            return self.reply_json(200, {"ok": True})
        if path == "/api/admin/settings":
            if not self.session_ok():
                return self.reply_json(401, {"error": "unauthorized"})
            with STORE_LOCK:
                store = load_store()
                store.setdefault("settings", {}).update(body or {})
                save_store(store)
            return self.reply_json(200, {"ok": True})
        if path == "/api/mp/webhook":
            data = body.get("data") or {}
            pid = str(data.get("id") or body.get("id") or "")
            if pid:
                code, pay = mp_request("GET", f"/v1/payments/{pid}")
                if code < 400:
                    PAYMENTS[pid] = extract_pix(pay)
            return self.reply_json(200, {"ok": True})
        if path == "/api/mp/pix":
            amount = round(float(body.get("amount") or 0), 2)
            email = (body.get("email") or "comprador@example.com").strip()
            name = (body.get("nome") or "Cliente").strip()
            order_id = (body.get("order_id") or "NEXO").strip()
            desc = (body.get("description") or f"Pedido {order_id}")[:127]
            if amount < 0.01:
                return self.reply_json(400, {"error": "invalid_amount"})
            first, _, last = name.partition(" ")
            payload = {
                "transaction_amount": amount,
                "description": desc,
                "payment_method_id": "pix",
                "external_reference": order_id,
                "payer": {
                    "email": email,
                    "first_name": first or "Cliente",
                    "last_name": last or "NEXO",
                },
            }
            code, pay = mp_request("POST", "/v1/payments", payload, idem=str(uuid.uuid4()))
            if code >= 400:
                return self.reply_json(code, pay)
            info = extract_pix(pay)
            if info.get("id"):
                PAYMENTS[str(info["id"])] = info
            return self.reply_json(200, info)
        if path == "/api/mp/card":
            amount = round(float(body.get("amount") or 0), 2)
            token_card = (body.get("token") or "").strip()
            method = (body.get("payment_method_id") or "").strip()
            email = (body.get("email") or "comprador@example.com").strip()
            order_id = (body.get("order_id") or "NEXO").strip()
            installments = int(body.get("installments") or 1)
            issuer = body.get("issuer_id")
            ident_type = (body.get("identification_type") or "CPF").strip()
            ident_number = (body.get("identification_number") or "").strip()
            if amount < 0.01 or not token_card or not method:
                return self.reply_json(400, {"error": "invalid_card_payload"})
            payload = {
                "transaction_amount": amount,
                "token": token_card,
                "description": (body.get("description") or f"Pedido {order_id}")[:127],
                "installments": max(1, installments),
                "payment_method_id": method,
                "external_reference": order_id,
                "payer": {
                    "email": email,
                    "identification": {"type": ident_type, "number": ident_number} if ident_number else None,
                },
            }
            if not payload["payer"]["identification"]:
                payload["payer"].pop("identification")
            if issuer:
                payload["issuer_id"] = issuer
            code, pay = mp_request("POST", "/v1/payments", payload, idem=str(uuid.uuid4()))
            if code >= 400:
                return self.reply_json(code, pay)
            info = extract_pix(pay)
            info["status_detail"] = pay.get("status_detail")
            if info.get("id"):
                PAYMENTS[str(info["id"])] = info
            return self.reply_json(200, info)
        if path == "/api/mp/preference":
            items = body.get("items") or []
            if not items:
                return self.reply_json(400, {"error": "empty_items"})
            payer = body.get("payer") or {}
            payload = {
                "items": items,
                "payer": payer,
                "external_reference": body.get("order_id") or "",
                "back_urls": {
                    "success": f"http://127.0.0.1:{PORT}/?mp=success",
                    "pending": f"http://127.0.0.1:{PORT}/?mp=pending",
                    "failure": f"http://127.0.0.1:{PORT}/?mp=failure",
                },
                "auto_return": "approved",
                "statement_descriptor": "NEXO",
            }
            code, pref = mp_request("POST", "/checkout/preferences", payload, idem=str(uuid.uuid4()))
            if code >= 400:
                return self.reply_json(code, pref)
            return self.reply_json(200, {
                "id": pref.get("id"),
                "init_point": pref.get("init_point"),
                "sandbox_init_point": pref.get("sandbox_init_point"),
            })
        return self.send_error(404, "Not found")

    def send_head(self):
        path = Path(self.translate_path(self.path.split("?")[0]))
        if path.is_dir():
            path = path / "index.html"
        if not path.is_file():
            self.send_error(404, "File not found")
            return None
        ext = path.suffix.lower()
        data = path.read_bytes()
        etag = '"' + hashlib.md5(data).hexdigest()[:16] + '"'
        cache = POLICY.get(ext, "public, max-age=3600")
        inm = self.headers.get("If-None-Match")
        if inm and etag in inm:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", cache)
            self.end_headers()
            return None
        content_type = self.guess_type(str(path))
        accept = self.headers.get("Accept-Encoding", "")
        if ext in COMPRESSIBLE and "gzip" in accept and len(data) > 256:
            buf = io.BytesIO()
            with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=6) as gz:
                gz.write(data)
            data = buf.getvalue()
            encoded = "gzip"
        else:
            encoded = None
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.send_header("ETag", etag)
        if encoded:
            self.send_header("Content-Encoding", encoded)
        self.end_headers()
        return io.BytesIO(data)

    def log_message(self, fmt, *args):
        line = "%s - %s" % (self.address_string(), fmt % args)
        item = {"time": time.strftime("%Y-%m-%d %H:%M:%S"), "line": line}
        LOGS.appendleft(item)
        try:
            init_db()
            con = db()
            con.execute("INSERT INTO logs (created, line) VALUES (?,?)", (item["time"], item["line"]))
            con.commit()
            con.close()
        except Exception:
            pass
        sys.stderr.write(line + "\n")


if __name__ == "__main__":
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), Handler) as httpd:
        token = access_token()
        init_db()
        print(f"Banco SQLite:   {DB_PATH}")
        print(f"NEXO no PC:     http://127.0.0.1:{PORT}")
        print(f"QR do celular:  http://127.0.0.1:{PORT}/qr")
        for ip in lan_ips():
            print(f"No celular:     http://{ip}:{PORT}")
        print("Mercado Pago:", "configurado" if token else "sem token — Pix local de fallback")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor encerrado.")
