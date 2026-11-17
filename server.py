#!/usr/bin/env python3
"""Khmer Dropshipping Team Hub - standard-library web app server."""
from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
import zipfile
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import BytesParser
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs, urlencode
from urllib.request import Request, urlopen

BASE_DIR = Path(__file__).resolve().parent
# Optional .env support without requiring third-party packages.
ENV_FILE = BASE_DIR / ".env"
if ENV_FILE.exists():
    for env_line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        env_line = env_line.strip()
        if not env_line or env_line.startswith("#") or "=" not in env_line:
            continue
        env_key, env_value = env_line.split("=", 1)
        os.environ.setdefault(env_key.strip(), env_value.strip().strip('\"').strip("'"))
# Railway's persistent Volume should be mounted at /data and DATA_DIR set to /data.
# Locally, keep the original project-relative storage folder by default.
_configured_data_dir = os.environ.get("DATA_DIR")
if _configured_data_dir:
    DATA_DIR = Path(_configured_data_dir).expanduser()
    if not DATA_DIR.is_absolute():
        DATA_DIR = (BASE_DIR / DATA_DIR).resolve()
else:
    DATA_DIR = BASE_DIR / "storage"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "team_portal.sqlite3"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "3888"))
SECURE_COOKIE = os.environ.get("APP_SECURE_COOKIE", "0") == "1"
MAX_UPLOAD_BYTES = 250 * 1024 * 1024
SESSION_DAYS = 7
DB_LOCK = threading.Lock()

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SEED_RESOURCES = [
    ("វីដេអូខ្មែរ #1 — មេរៀន Dropshipping", "https://www.youtube.com/watch?v=ZRfN-s1r2ZY", "មេរៀនខ្មែរ", "km", "វីដេអូខ្មែរដែលអ្នកបានផ្ដល់។ អ្នកគ្រប់គ្រងអាចកែចំណងជើង និងកំណត់ចំណាំតាមមាតិកាពិត។"),
    ("វីដេអូខ្មែរ #2 — មេរៀន Dropshipping", "https://www.youtube.com/watch?v=24kfc0GHy_I", "មេរៀនខ្មែរ", "km", "បើកមើលតាម YouTube player។ បំពេញចំណុចសំខាន់ៗក្នុងកំណត់ចំណាំក្រុម។"),
    ("វីដេអូខ្មែរ #3 — មេរៀន Dropshipping", "https://www.youtube.com/watch?v=5naFIorRWGc", "មេរៀនខ្មែរ", "km", "វីដេអូខ្មែរដែលបានដាក់ក្នុងបណ្ណាល័យ។"),
    ("វីដេអូខ្មែរ #4 — មេរៀន Dropshipping", "https://www.youtube.com/watch?v=JohiXQKbQ1c", "មេរៀនខ្មែរ", "km", "វីដេអូខ្មែរដែលបានដាក់ក្នុងបណ្ណាល័យ។"),
    ("វីដេអូខ្មែរ #5 — មេរៀន Dropshipping", "https://www.youtube.com/watch?v=_lp55t9zzZA", "មេរៀនខ្មែរ", "km", "វីដេអូខ្មែរដែលបានដាក់ក្នុងបណ្ណាល័យ។"),
    ("វីដេអូខ្មែរ #6 — មេរៀន Dropshipping", "https://www.youtube.com/watch?v=EfRjYfMBFTc", "មេរៀនខ្មែរ", "km", "វីដេអូខ្មែរដែលបានដាក់ក្នុងបណ្ណាល័យ។"),
    ("វីដេអូខ្មែរ #7 — មេរៀន Dropshipping", "https://www.youtube.com/watch?v=GZVLsIGbi3Y", "មេរៀនខ្មែរ", "km", "វីដេអូខ្មែរដែលបានដាក់ក្នុងបណ្ណាល័យ។"),
    ("វីដេអូខ្មែរ #8 — មេរៀន Dropshipping", "https://www.youtube.com/watch?v=tiLtssm5zcQ&t=1s", "មេរៀនខ្មែរ", "km", "ចាប់ផ្តើមមើលនៅវិនាទី 1 តាម link ដើម។"),
    ("វីដេអូខ្មែរ #9 — មេរៀន Dropshipping", "https://www.youtube.com/watch?v=-puRVd5B7uc", "មេរៀនខ្មែរ", "km", "វីដេអូខ្មែរដែលបានដាក់ក្នុងបណ្ណាល័យ។"),
    ("English course #1 — Dropshipping", "https://www.youtube.com/watch?v=DNdBJ5tgyjI", "English course", "en", "English learning video supplied by the team. Rename this lesson after checking its exact topic."),
    ("English course #2 — Dropshipping", "https://www.youtube.com/watch?v=ALMz11FwbSQ", "English course", "en", "English learning video supplied by the team. Rename this lesson after checking its exact topic."),
    ("English course #3 — Dropshipping", "https://www.youtube.com/watch?v=rqGNDT_utao", "English course", "en", "English learning video supplied by the team. Rename this lesson after checking its exact topic."),
    ("English course #4 — Dropshipping", "https://www.youtube.com/watch?v=UavYBwvQwLY", "English course", "en", "English learning video supplied by the team. Rename this lesson after checking its exact topic."),
    ("English course #5 — Dropshipping", "https://www.youtube.com/watch?v=y0S068qNpfA", "English course", "en", "English learning video supplied by the team. Rename this lesson after checking its exact topic."),
    ("English course #6 — Dropshipping", "https://www.youtube.com/watch?v=Bl9j9T1iWJA", "English course", "en", "English learning video supplied by the team. Rename this lesson after checking its exact topic."),
]

ALLOWED_EXTENSIONS = {
    ".jpg": "image", ".jpeg": "image", ".png": "image", ".webp": "image", ".gif": "image",
    ".mp4": "video", ".m4v": "video", ".mov": "video", ".webm": "video", ".mkv": "video",
    ".mp3": "audio", ".wav": "audio", ".m4a": "audio",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def database():
    conn = db_connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with DB_LOCK, database() as conn:
        conn.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'ទូទៅ',
            language TEXT NOT NULL DEFAULT 'km',
            description TEXT NOT NULL DEFAULT '',
            added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS progress (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'not_started',
            updated_at TEXT NOT NULL,
            PRIMARY KEY(user_id, resource_id)
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            assignee_label TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'todo',
            due_date TEXT NOT NULL DEFAULT '',
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            stored_name TEXT NOT NULL,
            original_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            media_type TEXT NOT NULL,
            size INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_resources_team ON resources(team_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);
        CREATE INDEX IF NOT EXISTS idx_uploads_team ON uploads(team_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
        """)
        task_columns = {row["name"] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
        if "assignee_label" not in task_columns:
            conn.execute("ALTER TABLE tasks ADD COLUMN assignee_label TEXT NOT NULL DEFAULT ''")
        if conn.execute("SELECT COUNT(*) FROM teams").fetchone()[0] == 0:
            conn.execute("INSERT INTO teams(name, created_at) VALUES(?, ?)", ("Dropshipping Team", utc_now()))
        if conn.execute("SELECT COUNT(*) FROM resources").fetchone()[0] == 0:
            team_id = conn.execute("SELECT id FROM teams ORDER BY id LIMIT 1").fetchone()[0]
            conn.executemany(
                "INSERT INTO resources(team_id,title,url,category,language,description,created_at) VALUES(?,?,?,?,?,?,?)",
                [(team_id, title, url, category, lang, desc, utc_now()) for title, url, category, lang, desc in SEED_RESOURCES],
            )


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${derived.hex()}"


def password_verify(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, expected = stored.split("$", 2)
        if scheme != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return secrets.compare_digest(actual.hex(), expected)
    except (ValueError, TypeError):
        return False


def clean_filename(name: str) -> str:
    name = Path(name or "upload").name
    name = re.sub(r"[^\w.()\- ]+", "_", name, flags=re.UNICODE).strip(" .")
    return (name or "upload")[:140]


def valid_http_url(value: str) -> bool:
    try:
        parsed = urlparse(value.strip())
        return parsed.scheme in ("http", "https") and bool(parsed.netloc) and len(value) <= 2048
    except Exception:
        return False


def youtube_video_id(value: str) -> str:
    """Extract a video ID only from recognized YouTube URL formats."""
    try:
        parsed = urlparse(value.strip())
        host = (parsed.hostname or "").lower().removeprefix("www.")
        if parsed.scheme not in ("http", "https"):
            return ""
        if host == "youtu.be":
            return parsed.path.strip("/").split("/")[0][:32]
        if host in ("youtube.com", "m.youtube.com", "youtube-nocookie.com"):
            query_id = parse_qs(parsed.query).get("v", [""])[0]
            if query_id:
                return query_id[:32]
            parts = [part for part in parsed.path.split("/") if part]
            if len(parts) >= 2 and parts[0] in ("embed", "shorts", "live"):
                return parts[1][:32]
    except Exception:
        pass
    return ""


def fetch_youtube_oembed(value: str) -> dict:
    """Fetch public YouTube title/thumbnail metadata; never fetches arbitrary hosts."""
    video_id = youtube_video_id(value)
    if not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{6,20}", video_id):
        raise ValueError("URL YouTube មិនត្រឹមត្រូវ។")
    canonical = f"https://www.youtube.com/watch?v={video_id}"
    endpoint = "https://www.youtube.com/oembed?" + urlencode({"url": canonical, "format": "json"})
    request = Request(endpoint, headers={"User-Agent": "KhmerDropshippingHub/1.0 (+video metadata preview)"})
    with urlopen(request, timeout=8) as response:
        if response.status != 200:
            raise ValueError("មិនអាចទាញយកព័ត៌មានវីដេអូបានទេ។")
        raw = response.read(1024 * 256)
    data = json.loads(raw.decode("utf-8"))
    thumbnail = str(data.get("thumbnail_url", ""))
    thumb_host = (urlparse(thumbnail).hostname or "").lower()
    if thumb_host not in ("i.ytimg.com", "img.youtube.com"):
        thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    return {
        "video_id": video_id,
        "title": str(data.get("title") or f"YouTube video {video_id}")[:180],
        "author_name": str(data.get("author_name") or "YouTube creator")[:120],
        "thumbnail_url": thumbnail,
        "watch_url": canonical,
        "embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}",
        "platform": "YouTube",
        "kind": "youtube",
    }


class AppHandler(BaseHTTPRequestHandler):
    server_version = "KhmerTeamHub/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")

    def _security_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https://i.ytimg.com https://img.youtube.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; media-src 'self' blob:")

    def send_json(self, payload: dict | list, status: int = 200, extra_headers: dict | None = None) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        for header, value in (extra_headers or {}).items():
            self.send_header(header, value)
        self._security_headers()
        self.end_headers()
        self.wfile.write(raw)

    def send_error_json(self, message: str, status: int = 400) -> None:
        self.send_json({"error": message}, status)

    def read_body(self, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("សំណើមានទំហំមិនត្រឹមត្រូវ។")
        if length <= 0:
            return b""
        if length > max_bytes:
            raise OverflowError("ឯកសារធំពេក។ អនុញ្ញាតអតិបរមា 250 MB ក្នុងមួយសំណើ។")
        body = self.rfile.read(length)
        if len(body) != length:
            raise ValueError("ទទួលបានទិន្នន័យមិនពេញលេញ។")
        return body

    def read_json(self) -> dict:
        body = self.read_body(2 * 1024 * 1024)
        if not body:
            return {}
        try:
            result = json.loads(body.decode("utf-8"))
            if not isinstance(result, dict):
                raise ValueError
            return result
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            raise ValueError("ទម្រង់ទិន្នន័យ JSON មិនត្រឹមត្រូវ។")

    def check_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        try:
            return urlparse(origin).netloc.lower() == self.headers.get("Host", "").lower()
        except Exception:
            return False

    def current_user(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            token = cookie.get("team_session").value if cookie.get("team_session") else ""
        except Exception:
            token = ""
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        with database() as conn:
            row = conn.execute("""
                SELECT u.id,u.team_id,u.name,u.email,u.role,t.name AS team_name
                FROM sessions s JOIN users u ON u.id=s.user_id JOIN teams t ON t.id=u.team_id
                WHERE s.token_hash=? AND s.expires_at>?
            """, (token_hash, utc_now())).fetchone()
        return dict(row) if row else None

    def require_user(self):
        user = self.current_user()
        if not user:
            self.send_error_json("Workspace session ផុតកំណត់ហើយ។ សូម refresh page។", 401)
            return None
        return user

    def create_session_cookie(self, user_id: int) -> str:
        token = secrets.token_urlsafe(36)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        created = datetime.now(timezone.utc)
        expires = (created + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")
        with database() as conn:
            conn.execute("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)", (token_hash, user_id, expires, created.isoformat(timespec="seconds")))
        cookie = f"team_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DAYS * 86400}"
        if SECURE_COOKIE:
            cookie += "; Secure"
        return cookie

    def set_session(self, user_id: int) -> None:
        cookie = self.create_session_cookie(user_id)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", cookie)
        self.send_header("Cache-Control", "no-store")
        self._security_headers()
        with database() as conn:
            user = conn.execute("SELECT u.id,u.team_id,u.name,u.email,u.role,t.name AS team_name FROM users u JOIN teams t ON t.id=u.team_id WHERE u.id=?", (user_id,)).fetchone()
        raw = json.dumps({"user": dict(user)}, ensure_ascii=False).encode("utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/api/health":
            return self.send_json({"ok": True, "service": "Khmer Dropshipping Team Hub"})
        if path.startswith("/api/"):
            return self.handle_api_get(path, parsed.query)
        if path.startswith("/media/"):
            return self.handle_media_get(path, attachment=False)
        if path.startswith("/download/"):
            return self.handle_media_get(path.replace("/download/", "/media/", 1), attachment=True)
        if path in ("/", "/index.html", "/styles.css", "/data.js", "/app.js", "/README.md"):
            file_path = BASE_DIR / ("index.html" if path == "/" else path.lstrip("/"))
            if not file_path.exists() or not file_path.is_file():
                return self.send_error(404)
            content = file_path.read_bytes()
            content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
            if file_path.suffix == ".js":
                content_type = "text/javascript"
            if file_path.suffix == ".css":
                content_type = "text/css"
            if file_path.suffix == ".md":
                content_type = "text/plain"
            self.send_response(200)
            self.send_header("Content-Type", f"{content_type}; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache" if file_path.suffix in (".html", ".js", ".css") else "public, max-age=3600")
            self._security_headers()
            self.end_headers()
            self.wfile.write(content)
            return
        self.send_error(404)

    def get_or_create_shared_user(self):
        """Return the shared workspace identity used when authentication is disabled."""
        with database() as conn:
            first_team = conn.execute("SELECT id FROM teams ORDER BY id LIMIT 1").fetchone()
            if not first_team:
                cur = conn.execute("INSERT INTO teams(name,created_at) VALUES(?,?)", ("Dropshipping Team", utc_now()))
                team_id = cur.lastrowid
            else:
                team_id = first_team["id"]

            # Use the first existing account on legacy installations to retain its progress.
            existing = conn.execute("""
                SELECT u.id FROM users u WHERE u.team_id=?
                ORDER BY CASE u.role WHEN 'owner' THEN 0 ELSE 1 END, u.id LIMIT 1
            """, (team_id,)).fetchone()
            if existing:
                user_id = existing["id"]
            else:
                email = "shared-workspace@team.local"
                disabled_password = password_hash(secrets.token_urlsafe(48))
                cur = conn.execute(
                    "INSERT INTO users(team_id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
                    (team_id, "Team Workspace", email, disabled_password, "owner", utc_now()),
                )
                user_id = cur.lastrowid
            row = conn.execute("""
                SELECT u.id,u.team_id,u.name,u.email,u.role,t.name AS team_name
                FROM users u JOIN teams t ON t.id=u.team_id WHERE u.id=?
            """, (user_id,)).fetchone()
        return dict(row)

    def handle_api_get(self, path: str, query_string: str = ""):
        bootstrap_cookie = None
        if path == "/api/bootstrap":
            user = self.current_user()
            if not user:
                user = self.get_or_create_shared_user()
                bootstrap_cookie = self.create_session_cookie(user["id"])
        else:
            user = self.require_user()
            if not user:
                return
        if path == "/api/media/preview":
            query = parse_qs(query_string)
            source_url = query.get("url", [""])[0]
            if not valid_http_url(source_url):
                return self.send_error_json("សូមបញ្ចូល URL ត្រឹមត្រូវ។")
            video_id = youtube_video_id(source_url)
            if video_id:
                try:
                    return self.send_json(fetch_youtube_oembed(source_url))
                except Exception as exc:
                    # A thumbnail is still useful when oEmbed metadata is temporarily unavailable.
                    return self.send_json({
                        "kind": "youtube", "video_id": video_id,
                        "title": f"YouTube video {video_id}", "author_name": "YouTube",
                        "thumbnail_url": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                        "watch_url": f"https://www.youtube.com/watch?v={video_id}",
                        "embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}",
                        "platform": "YouTube", "metadata_fallback": True,
                    })
            return self.send_error_json("ការទាញយក title និង banner ស្វ័យប្រវត្តិឥឡូវនេះគាំទ្រ YouTube។ សម្រាប់ platform ផ្សេង សូមប្រើ preview ឬចំណងជើងដោយដៃ។", 422)
        if path == "/api/bootstrap":
            with database() as conn:
                resources = conn.execute("""
                    SELECT r.id,r.title,r.url,r.category,r.language,r.description,r.added_by,r.created_at,
                    COALESCE(p.status,'not_started') AS my_status,
                    (SELECT COUNT(*) FROM progress p2 WHERE p2.resource_id=r.id AND p2.status='completed') AS completed_count,
                    (SELECT COUNT(*) FROM progress p3 WHERE p3.resource_id=r.id) AS tracked_count
                    FROM resources r LEFT JOIN progress p ON p.resource_id=r.id AND p.user_id=?
                    WHERE r.team_id=? ORDER BY r.created_at DESC,r.id DESC
                """, (user["id"], user["team_id"])).fetchall()
                tasks = conn.execute("""
                    SELECT t.id,t.title,t.description,t.assignee_id,t.status,t.due_date,t.created_by,t.created_at,t.updated_at,
                    COALESCE(NULLIF(t.assignee_label,''),u.name) AS assignee_name,c.name AS creator_name
                    FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id LEFT JOIN users c ON c.id=t.created_by
                    WHERE t.team_id=? ORDER BY CASE t.status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END, t.due_date, t.id DESC
                """, (user["team_id"],)).fetchall()
                members = conn.execute("""
                    SELECT u.id,u.name,u.email,u.role,u.created_at,
                    (SELECT COUNT(*) FROM progress p JOIN resources r ON r.id=p.resource_id WHERE p.user_id=u.id AND p.status='completed' AND r.team_id=u.team_id) AS completed_lessons,
                    (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status!='done' AND t.team_id=u.team_id) AS open_tasks
                    FROM users u WHERE u.team_id=? AND u.id=?
                """, (user["team_id"], user["id"])).fetchall()
                uploads = conn.execute("""
                    SELECT f.id,f.original_name,f.mime_type,f.media_type,f.size,f.created_at,f.uploader_id,u.name AS uploader_name
                    FROM uploads f LEFT JOIN users u ON u.id=f.uploader_id WHERE f.team_id=? ORDER BY f.id DESC
                """, (user["team_id"],)).fetchall()
            headers = {"Set-Cookie": bootstrap_cookie} if bootstrap_cookie else None
            return self.send_json({"user": user, "resources": [dict(r) for r in resources], "tasks": [dict(t) for t in tasks], "members": [dict(m) for m in members], "uploads": [dict(f) for f in uploads]}, extra_headers=headers)
        return self.send_error_json("មិនមាន API នេះទេ។", 404)

    def do_POST(self):
        if not self.check_origin():
            return self.send_error_json("សំណើពីប្រភពមិនត្រូវបានអនុញ្ញាត។", 403)
        path = urlparse(self.path).path
        try:
            user = self.require_user()
            if not user:
                return
            if path == "/api/resources":
                return self.api_add_resource(user)
            if path == "/api/resources/bulk":
                return self.api_bulk_resources(user)
            if path == "/api/progress":
                return self.api_set_progress(user)
            if path == "/api/tasks":
                return self.api_add_task(user)
            if path == "/api/uploads":
                return self.api_uploads(user)
            if path == "/api/media/zip":
                return self.api_zip(user)
            if path == "/api/media/process":
                return self.api_process_media(user)
            return self.send_error_json("មិនមាន API នេះទេ។", 404)
        except OverflowError as exc:
            return self.send_error_json(str(exc), 413)
        except ValueError as exc:
            return self.send_error_json(str(exc), 400)
        except Exception as exc:
            print("ERROR:", repr(exc))
            return self.send_error_json("មានបញ្ហាផ្នែកម៉ាស៊ីនមេ។ សូមពិនិត្យ log ហើយសាកល្បងម្ដងទៀត។", 500)

    def do_PATCH(self):
        if not self.check_origin():
            return self.send_error_json("សំណើពីប្រភពមិនត្រូវបានអនុញ្ញាត។", 403)
        user = self.require_user()
        if not user:
            return
        try:
            path = urlparse(self.path).path
            data = self.read_json()
            if path.startswith("/api/resources/"):
                return self.api_update_resource(user, int(path.rsplit("/", 1)[1]), data)
            if path.startswith("/api/tasks/"):
                return self.api_update_task(user, int(path.rsplit("/", 1)[1]), data)
            return self.send_error_json("មិនមាន API នេះទេ។", 404)
        except (ValueError, OverflowError) as exc:
            return self.send_error_json(str(exc), 400)
        except Exception as exc:
            print("ERROR:", repr(exc))
            return self.send_error_json("មានបញ្ហាផ្នែកម៉ាស៊ីនមេ។", 500)

    def do_DELETE(self):
        if not self.check_origin():
            return self.send_error_json("សំណើពីប្រភពមិនត្រូវបានអនុញ្ញាត។", 403)
        user = self.require_user()
        if not user:
            return
        path = urlparse(self.path).path
        try:
            if path.startswith("/api/resources/"):
                rid = int(path.rsplit("/", 1)[1])
                with database() as conn:
                    row = conn.execute("SELECT added_by FROM resources WHERE id=? AND team_id=?", (rid, user["team_id"])).fetchone()
                    if not row:
                        return self.send_error_json("រកមិនឃើញមេរៀនទេ។", 404)
                    if user["role"] != "owner" and row["added_by"] != user["id"]:
                        return self.send_error_json("មានតែអ្នកបង្កើត ឬម្ចាស់ក្រុមទេដែលអាចលុបបាន។", 403)
                    conn.execute("DELETE FROM resources WHERE id=?", (rid,))
                return self.send_json({"ok": True})
            if path.startswith("/api/tasks/"):
                tid = int(path.rsplit("/", 1)[1])
                with database() as conn:
                    row = conn.execute("SELECT created_by FROM tasks WHERE id=? AND team_id=?", (tid, user["team_id"])).fetchone()
                    if not row:
                        return self.send_error_json("រកមិនឃើញកិច្ចការទេ។", 404)
                    if user["role"] != "owner" and row["created_by"] != user["id"]:
                        return self.send_error_json("មានតែអ្នកបង្កើត ឬម្ចាស់ក្រុមទេដែលអាចលុបបាន។", 403)
                    conn.execute("DELETE FROM tasks WHERE id=?", (tid,))
                return self.send_json({"ok": True})
            if path.startswith("/api/uploads/"):
                fid = int(path.rsplit("/", 1)[1])
                with database() as conn:
                    row = conn.execute("SELECT * FROM uploads WHERE id=? AND team_id=?", (fid, user["team_id"])).fetchone()
                    if not row:
                        return self.send_error_json("រកមិនឃើញឯកសារទេ។", 404)
                    if user["role"] != "owner" and row["uploader_id"] != user["id"]:
                        return self.send_error_json("មានតែអ្នកផ្ទុកឯកសារ ឬម្ចាស់ក្រុមទេដែលអាចលុបបាន។", 403)
                    conn.execute("DELETE FROM uploads WHERE id=?", (fid,))
                try:
                    (UPLOAD_DIR / row["stored_name"]).unlink(missing_ok=True)
                except OSError:
                    pass
                return self.send_json({"ok": True})
            return self.send_error_json("មិនមាន API នេះទេ។", 404)
        except ValueError:
            return self.send_error_json("លេខសម្គាល់មិនត្រឹមត្រូវ។", 400)

    def api_add_resource(self, user):
        data = self.read_json()
        title = str(data.get("title", "")).strip()[:180]
        url = str(data.get("url", "")).strip()
        category = str(data.get("category", "ទូទៅ")).strip()[:80] or "ទូទៅ"
        language = "en" if data.get("language") == "en" else "km"
        description = str(data.get("description", "")).strip()[:1200]
        if len(title) < 2 or not valid_http_url(url):
            return self.send_error_json("សូមបញ្ចូលចំណងជើង និង URL HTTP/HTTPS ត្រឹមត្រូវ។")
        with database() as conn:
            cur = conn.execute("INSERT INTO resources(team_id,title,url,category,language,description,added_by,created_at) VALUES(?,?,?,?,?,?,?,?)", (user["team_id"], title, url, category, language, description, user["id"], utc_now()))
        return self.send_json({"ok": True, "id": cur.lastrowid}, 201)

    def api_bulk_resources(self, user):
        data = self.read_json()
        items = data.get("items", [])
        if not isinstance(items, list) or len(items) > 200:
            return self.send_error_json("អាចនាំចូលបានអតិបរមា 200 link ក្នុងមួយដង។")
        prepared = []
        for i, item in enumerate(items, 1):
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()[:180] or f"មេរៀនថ្មី #{i}"
            url = str(item.get("url", "")).strip()
            if valid_http_url(url):
                language = "en" if item.get("language") == "en" else "km"
                category = str(item.get("category", "មេរៀនថ្មី")).strip()[:80] or "មេរៀនថ្មី"
                prepared.append((user["team_id"], title, url, category, language, str(item.get("description", ""))[:1200], user["id"], utc_now()))
        if not prepared:
            return self.send_error_json("រកមិនឃើញ URL ត្រឹមត្រូវសម្រាប់នាំចូលទេ។")
        with database() as conn:
            conn.executemany("INSERT INTO resources(team_id,title,url,category,language,description,added_by,created_at) VALUES(?,?,?,?,?,?,?,?)", prepared)
        return self.send_json({"ok": True, "imported": len(prepared)}, 201)

    def api_update_resource(self, user, rid: int, data: dict):
        fields = []
        values = []
        for key, max_len in (("title", 180), ("url", 2048), ("category", 80), ("description", 1200)):
            if key in data:
                val = str(data[key]).strip()[:max_len]
                if key == "url" and not valid_http_url(val):
                    return self.send_error_json("URL មិនត្រឹមត្រូវ។")
                if key == "title" and len(val) < 2:
                    return self.send_error_json("ចំណងជើងខ្លីពេក។")
                fields.append(f"{key}=?")
                values.append(val)
        if "language" in data:
            fields.append("language=?")
            values.append("en" if data["language"] == "en" else "km")
        if not fields:
            return self.send_error_json("គ្មានអ្វីត្រូវកែប្រែទេ។")
        with database() as conn:
            row = conn.execute("SELECT added_by FROM resources WHERE id=? AND team_id=?", (rid, user["team_id"])).fetchone()
            if not row:
                return self.send_error_json("រកមិនឃើញមេរៀនទេ។", 404)
            if user["role"] != "owner" and row["added_by"] != user["id"]:
                return self.send_error_json("មានតែអ្នកបង្កើត ឬម្ចាស់ក្រុមទេដែលអាចកែប្រែបាន។", 403)
            values.extend([rid, user["team_id"]])
            conn.execute(f"UPDATE resources SET {', '.join(fields)} WHERE id=? AND team_id=?", values)
        return self.send_json({"ok": True})

    def api_set_progress(self, user):
        data = self.read_json()
        try:
            rid = int(data.get("resource_id"))
        except (TypeError, ValueError):
            return self.send_error_json("លេខមេរៀនមិនត្រឹមត្រូវ។")
        status = data.get("status")
        if status not in ("not_started", "in_progress", "completed"):
            return self.send_error_json("ស្ថានភាពមិនត្រឹមត្រូវ។")
        with database() as conn:
            if not conn.execute("SELECT 1 FROM resources WHERE id=? AND team_id=?", (rid, user["team_id"])).fetchone():
                return self.send_error_json("រកមិនឃើញមេរៀនទេ។", 404)
            conn.execute("INSERT INTO progress(user_id,resource_id,status,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,resource_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at", (user["id"], rid, status, utc_now()))
        return self.send_json({"ok": True})

    def api_add_task(self, user):
        data = self.read_json()
        title = str(data.get("title", "")).strip()[:180]
        description = str(data.get("description", "")).strip()[:1200]
        due_date = str(data.get("due_date", "")).strip()[:10]
        assignee = data.get("assignee_id")
        assignee_label = str(data.get("assignee_name", "")).strip()[:100]
        try:
            assignee = int(assignee) if assignee not in (None, "") else None
        except (ValueError, TypeError):
            return self.send_error_json("អ្នកទទួលខុសត្រូវមិនត្រឹមត្រូវ។")
        if len(title) < 2:
            return self.send_error_json("សូមបញ្ចូលឈ្មោះកិច្ចការ។")
        with database() as conn:
            if assignee and not conn.execute("SELECT 1 FROM users WHERE id=? AND team_id=?", (assignee, user["team_id"])).fetchone():
                return self.send_error_json("សមាជិកនេះមិនមានក្នុងក្រុមទេ។")
            cur = conn.execute("INSERT INTO tasks(team_id,title,description,assignee_id,assignee_label,status,due_date,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (user["team_id"], title, description, assignee, assignee_label, "todo", due_date, user["id"], utc_now(), utc_now()))
        return self.send_json({"ok": True, "id": cur.lastrowid}, 201)

    def api_update_task(self, user, tid: int, data: dict):
        allowed = {"todo", "doing", "done"}
        fields, values = [], []
        if "status" in data:
            status = str(data["status"])
            if status not in allowed:
                return self.send_error_json("ស្ថានភាពកិច្ចការមិនត្រឹមត្រូវ។")
            fields.append("status=?")
            values.append(status)
        if "assignee_id" in data:
            try:
                assignee = int(data["assignee_id"]) if data["assignee_id"] not in (None, "") else None
            except (ValueError, TypeError):
                return self.send_error_json("អ្នកទទួលខុសត្រូវមិនត្រឹមត្រូវ។")
            with database() as conn:
                if assignee and not conn.execute("SELECT 1 FROM users WHERE id=? AND team_id=?", (assignee, user["team_id"])).fetchone():
                    return self.send_error_json("សមាជិកនេះមិនមានក្នុងក្រុមទេ។")
            fields.append("assignee_id=?")
            values.append(assignee)
        if "title" in data:
            title = str(data["title"]).strip()[:180]
            if len(title) < 2:
                return self.send_error_json("ឈ្មោះកិច្ចការខ្លីពេក។")
            fields.append("title=?")
            values.append(title)
        if "description" in data:
            fields.append("description=?")
            values.append(str(data["description"]).strip()[:1200])
        if "due_date" in data:
            fields.append("due_date=?")
            values.append(str(data["due_date"]).strip()[:10])
        if not fields:
            return self.send_error_json("គ្មានអ្វីត្រូវកែប្រែទេ។")
        fields.append("updated_at=?")
        values.append(utc_now())
        values.extend([tid, user["team_id"]])
        with database() as conn:
            cur = conn.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id=? AND team_id=?", values)
            if cur.rowcount == 0:
                return self.send_error_json("រកមិនឃើញកិច្ចការទេ។", 404)
        return self.send_json({"ok": True})

    def api_uploads(self, user):
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            return self.send_error_json("សូមផ្ទុកឯកសារតាម form-data។")
        body = self.read_body(MAX_UPLOAD_BYTES)
        message = BytesParser(policy=policy.default).parsebytes(
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body
        )
        saved = []
        total = 0
        for part in message.iter_parts():
            filename = part.get_filename()
            if not filename:
                continue
            raw = part.get_payload(decode=True) or b""
            if not raw:
                continue
            total += len(raw)
            if total > MAX_UPLOAD_BYTES:
                raise OverflowError("ទំហំឯកសារសរុបធំពេក (អតិបរមា 250 MB)។")
            clean = clean_filename(filename)
            ext = Path(clean).suffix.lower()
            media_type = ALLOWED_EXTENSIONS.get(ext)
            if not media_type:
                continue
            stored = f"{uuid.uuid4().hex}{ext}"
            (UPLOAD_DIR / stored).write_bytes(raw)
            mime = mimetypes.guess_type(clean)[0] or "application/octet-stream"
            with database() as conn:
                cur = conn.execute("INSERT INTO uploads(team_id,uploader_id,stored_name,original_name,mime_type,media_type,size,created_at) VALUES(?,?,?,?,?,?,?,?)", (user["team_id"], user["id"], stored, clean, mime, media_type, len(raw), utc_now()))
                saved.append({"id": cur.lastrowid, "original_name": clean, "mime_type": mime, "media_type": media_type, "size": len(raw), "uploader_name": user["name"]})
        if not saved:
            return self.send_error_json("មិនមានប្រភេទឯកសារដែលអនុញ្ញាតទេ។ គាំទ្រ JPG, PNG, WEBP, GIF, MP4, MOV, WEBM, MKV, MP3, WAV និង M4A។")
        return self.send_json({"ok": True, "files": saved}, 201)

    def _get_upload_rows(self, user, ids):
        if not ids or len(ids) > 100:
            return []
        placeholders = ",".join("?" for _ in ids)
        with database() as conn:
            return conn.execute(f"SELECT * FROM uploads WHERE team_id=? AND media_type='image' AND id IN ({placeholders})", [user["team_id"], *ids]).fetchall()

    def api_zip(self, user):
        data = self.read_json()
        try:
            ids = list(dict.fromkeys(int(i) for i in data.get("ids", [])))
        except (ValueError, TypeError):
            return self.send_error_json("បញ្ជីឯកសារមិនត្រឹមត្រូវ។")
        rows = self._get_upload_rows(user, ids)
        if not rows:
            return self.send_error_json("សូមជ្រើសរូបភាពយ៉ាងតិចមួយ។")
        if sum(int(row["size"]) for row in rows) > MAX_UPLOAD_BYTES:
            return self.send_error_json("រូបភាពដែលបានជ្រើសមានទំហំសរុបលើស 250 MB។ សូមបែងចែកជា ZIP ច្រើនដង។", 413)
        memory = BytesIO()
        with zipfile.ZipFile(memory, "w", zipfile.ZIP_DEFLATED) as archive:
            for row in rows:
                path = UPLOAD_DIR / row["stored_name"]
                if path.exists():
                    archive.write(path, arcname=f"{row['id']}_{clean_filename(row['original_name'])}")
        blob = memory.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", "attachment; filename=team-images.zip")
        self.send_header("Content-Length", str(len(blob)))
        self._security_headers()
        self.end_headers()
        self.wfile.write(blob)

    def api_process_media(self, user):
        data = self.read_json()
        try:
            fid = int(data.get("id"))
        except (ValueError, TypeError):
            return self.send_error_json("លេខឯកសារមិនត្រឹមត្រូវ។")
        action = str(data.get("action", ""))
        if action not in ("mp3", "480p", "720p", "1080p", "2160p"):
            return self.send_error_json("ជម្រើសបម្លែងមិនត្រឹមត្រូវ។")
        ffmpeg = shutil.which("ffmpeg")
        ffprobe = shutil.which("ffprobe")
        if not ffmpeg or not ffprobe:
            return self.send_error_json("មុខងារបម្លែងត្រូវការ FFmpeg និង FFprobe។ សូមដំឡើង FFmpeg តាម README ហើយបើក server ឡើងវិញ។", 503)
        with database() as conn:
            row = conn.execute("SELECT * FROM uploads WHERE id=? AND team_id=? AND media_type='video'", (fid, user["team_id"])).fetchone()
        if not row:
            return self.send_error_json("រកមិនឃើញវីដេអូក្នុងក្រុមទេ។", 404)
        source = UPLOAD_DIR / row["stored_name"]
        if not source.exists():
            return self.send_error_json("ឯកសារដើមរកមិនឃើញទេ។", 404)
        source_height = None
        if action != "mp3":
            probe = subprocess.run([ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "json", str(source)], capture_output=True, text=True, timeout=60)
            try:
                streams = json.loads(probe.stdout).get("streams", [])
                source_height = int(streams[0]["height"]) if streams else 0
            except (ValueError, KeyError, IndexError, json.JSONDecodeError):
                source_height = 0
            target_height = int(action[:-1])
            if not source_height or source_height < target_height:
                return self.send_error_json(f"វីដេអូដើមមានកម្ពស់ {source_height or 'មិនស្គាល់'}px។ មិនអាចបង្កើត {action} ដោយមិនបង្កើន resolution សិប្បនិម្មិតបានទេ។")
        stem = Path(row["original_name"]).stem
        out_ext = ".mp3" if action == "mp3" else ".mp4"
        out_name = clean_filename(f"{stem}_{action}{out_ext}")
        stored = f"{uuid.uuid4().hex}{out_ext}"
        target = UPLOAD_DIR / stored
        temp_audio = UPLOAD_DIR / f"{uuid.uuid4().hex}_audio.mp3" if action == "mp3" else None
        cover_image = UPLOAD_DIR / f"{uuid.uuid4().hex}_cover.jpg" if action == "mp3" else None
        if action == "mp3":
            command = [ffmpeg, "-y", "-nostdin", "-i", str(source), "-vn", "-codec:a", "libmp3lame", "-q:a", "2", "-metadata", f"title={stem}", "-metadata", "artist=Team Upload", str(temp_audio)]
        else:
            height = int(action[:-1])
            command = [ffmpeg, "-y", "-nostdin", "-i", str(source), "-vf", f"scale=-2:{height}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(target)]
        try:
            proc = subprocess.run(command, capture_output=True, text=True, timeout=1800)
            intermediate = temp_audio if action == "mp3" else target
            if proc.returncode != 0 or not intermediate.exists() or intermediate.stat().st_size == 0:
                target.unlink(missing_ok=True)
                if temp_audio:
                    temp_audio.unlink(missing_ok=True)
                return self.send_error_json("FFmpeg មិនអាចបម្លែងឯកសារនេះបានទេ។ សូមពិនិត្យប្រភេទវីដេអូដើម។", 422)
            if action == "mp3":
                # Try to create an embedded cover image from the user's own video.
                cover_proc = subprocess.run([ffmpeg, "-y", "-nostdin", "-ss", "00:00:01", "-i", str(source), "-frames:v", "1", "-q:v", "3", str(cover_image)], capture_output=True, text=True, timeout=120)
                if cover_proc.returncode == 0 and cover_image.exists() and cover_image.stat().st_size > 0:
                    tag_proc = subprocess.run([ffmpeg, "-y", "-nostdin", "-i", str(temp_audio), "-i", str(cover_image), "-map", "0:a", "-map", "1:v", "-c:a", "copy", "-c:v", "mjpeg", "-id3v2_version", "3", "-metadata", f"title={stem}", "-metadata", "artist=Team Upload", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)", str(target)], capture_output=True, text=True, timeout=180)
                    if tag_proc.returncode != 0 or not target.exists() or target.stat().st_size == 0:
                        shutil.copy2(temp_audio, target)
                else:
                    shutil.copy2(temp_audio, target)
        except subprocess.TimeoutExpired:
            target.unlink(missing_ok=True)
            if temp_audio:
                temp_audio.unlink(missing_ok=True)
            return self.send_error_json("ការបម្លែងចំណាយពេលលើសកំណត់ 30 នាទី។", 408)
        finally:
            if temp_audio:
                temp_audio.unlink(missing_ok=True)
            if cover_image:
                cover_image.unlink(missing_ok=True)
        if not target.exists() or target.stat().st_size == 0:
            return self.send_error_json("មិនអាចបង្កើតឯកសារលទ្ធផលបានទេ។", 422)
        mime = "audio/mpeg" if action == "mp3" else "video/mp4"
        media_type = "audio" if action == "mp3" else "video"
        with database() as conn:
            cur = conn.execute("INSERT INTO uploads(team_id,uploader_id,stored_name,original_name,mime_type,media_type,size,created_at) VALUES(?,?,?,?,?,?,?,?)", (user["team_id"], user["id"], stored, out_name, mime, media_type, target.stat().st_size, utc_now()))
        return self.send_json({"ok": True, "file": {"id": cur.lastrowid, "original_name": out_name, "mime_type": mime, "media_type": media_type, "size": target.stat().st_size}})

    def handle_media_get(self, path: str, attachment: bool):
        user = self.require_user()
        if not user:
            return
        try:
            fid = int(path.rstrip("/").rsplit("/", 1)[1])
        except (ValueError, IndexError):
            return self.send_error(404)
        with database() as conn:
            row = conn.execute("SELECT * FROM uploads WHERE id=? AND team_id=?", (fid, user["team_id"])).fetchone()
        if not row:
            return self.send_error(404)
        file_path = UPLOAD_DIR / row["stored_name"]
        if not file_path.exists():
            return self.send_error(404)
        size = file_path.stat().st_size
        content_type = row["mime_type"]
        range_header = self.headers.get("Range")
        start, end, status = 0, size - 1, 200
        if range_header and not attachment:
            match = re.match(r"bytes=(\d*)-(\d*)", range_header)
            if match:
                if match.group(1):
                    start = int(match.group(1))
                if match.group(2):
                    end = int(match.group(2))
                if start >= size or end < start:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.end_headers()
                    return
                end = min(end, size - 1)
                status = 206
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        disposition = "attachment" if attachment else "inline"
        filename = clean_filename(row["original_name"])
        self.send_header("Content-Disposition", f"{disposition}; filename*=UTF-8''{__import__('urllib.parse').parse.quote(filename)}")
        self.send_header("Cache-Control", "private, max-age=1800")
        self._security_headers()
        self.end_headers()
        with file_path.open("rb") as fp:
            fp.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fp.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)


def main():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print("=" * 64)
    print(" Khmer Dropshipping Team Hub")
    print(f" On this computer: http://127.0.0.1:{PORT}")
    print(f" Network binding: {HOST}:{PORT}")
    print(" Teammates on the same trusted network should use this computer's LAN IP.")
    print(f" Database: {DB_PATH}")
    print(" No sign-up or sign-in required; visitors share one workspace.")
    print(" Only share this address with people you trust.")
    print(" Stop with Ctrl+C.")
    print("=" * 64)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
