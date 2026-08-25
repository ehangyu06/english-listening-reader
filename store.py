"""Shared library on the Mac so every iPad/Mac address sees the same lessons."""

import json
import re
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
LESSONS_FILE = DATA / "lessons.json"
SETTINGS_FILE = DATA / "settings.json"
FILES_FILE = DATA / "files.json"
IMAGES_DIR = DATA / "images"
AUDIO_DIR = DATA / "audio"

SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")
_lock = threading.Lock()


def ensure_dirs():
    DATA.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    if not LESSONS_FILE.exists():
        LESSONS_FILE.write_text("{}", encoding="utf-8")
    if not SETTINGS_FILE.exists():
        SETTINGS_FILE.write_text("{}", encoding="utf-8")
    if not FILES_FILE.exists():
        FILES_FILE.write_text('{"images": {}, "audio": {}}', encoding="utf-8")


def _read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def _write_json(path, value):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def check_id(value):
    return bool(value) and bool(SAFE_ID.match(str(value)))


def get_state():
    ensure_dirs()
    with _lock:
        lessons = _read_json(LESSONS_FILE, {})
        settings = _read_json(SETTINGS_FILE, {})
        files = _read_json(FILES_FILE, {"images": {}, "audio": {}})
    return {
        "lessons": list(lessons.values()) if isinstance(lessons, dict) else [],
        "settings": settings if isinstance(settings, dict) else {},
        "files": files if isinstance(files, dict) else {"images": {}, "audio": {}},
    }


def put_lesson(lesson):
    if not isinstance(lesson, dict) or not check_id(lesson.get("id")):
        raise ValueError("invalid lesson")
    ensure_dirs()
    with _lock:
        lessons = _read_json(LESSONS_FILE, {})
        if not isinstance(lessons, dict):
            lessons = {}
        lessons[lesson["id"]] = lesson
        _write_json(LESSONS_FILE, lessons)
    return lesson


def delete_lesson(lesson_id):
    if not check_id(lesson_id):
        raise ValueError("invalid id")
    ensure_dirs()
    with _lock:
        lessons = _read_json(LESSONS_FILE, {})
        if isinstance(lessons, dict):
            lessons.pop(lesson_id, None)
            _write_json(LESSONS_FILE, lessons)


def put_setting(key, value):
    key = str(key or "").strip()
    if not key:
        raise ValueError("invalid key")
    ensure_dirs()
    with _lock:
        settings = _read_json(SETTINGS_FILE, {})
        if not isinstance(settings, dict):
            settings = {}
        settings[key] = value
        _write_json(SETTINGS_FILE, settings)


def blob_path(kind, file_id):
    folder = IMAGES_DIR if kind == "images" else AUDIO_DIR
    return folder / file_id


def get_blob(kind, file_id):
    if kind not in ("images", "audio") or not check_id(file_id):
        return None
    ensure_dirs()
    path = blob_path(kind, file_id)
    if not path.exists():
        return None
    with _lock:
        files = _read_json(FILES_FILE, {"images": {}, "audio": {}})
        meta = (files.get(kind) or {}).get(file_id) or {}
    return {
        "data": path.read_bytes(),
        "mimeType": meta.get("mimeType") or "application/octet-stream",
        "fileName": meta.get("fileName") or "",
    }


def blob_exists(kind, file_id):
    if kind not in ("images", "audio") or not check_id(file_id):
        return False
    ensure_dirs()
    return blob_path(kind, file_id).exists()


def put_blob(kind, file_id, data, mime_type="", file_name=""):
    if kind not in ("images", "audio") or not check_id(file_id):
        raise ValueError("invalid file")
    ensure_dirs()
    path = blob_path(kind, file_id)
    path.write_bytes(data)
    with _lock:
        files = _read_json(FILES_FILE, {"images": {}, "audio": {}})
        if kind not in files or not isinstance(files[kind], dict):
            files[kind] = {}
        files[kind][file_id] = {
            "mimeType": mime_type or "application/octet-stream",
            "fileName": file_name or "",
        }
        _write_json(FILES_FILE, files)


def delete_blob(kind, file_id):
    if kind not in ("images", "audio") or not check_id(file_id):
        return
    ensure_dirs()
    path = blob_path(kind, file_id)
    if path.exists():
        path.unlink()
    with _lock:
        files = _read_json(FILES_FILE, {"images": {}, "audio": {}})
        if isinstance(files.get(kind), dict):
            files[kind].pop(file_id, None)
            _write_json(FILES_FILE, files)
