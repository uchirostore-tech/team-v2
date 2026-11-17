#!/usr/bin/env python3
"""Khmer Dropshipping Team Hub - standard-library web app server."""
from __future__ import annotations

import hashlib
import ipaddress
import json
import mimetypes
import os
import re
import secrets
import socket
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
from urllib.request import Request, urlopen, HTTPRedirectHandler, build_opener

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
