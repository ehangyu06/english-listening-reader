"""Shared library on the Mac so every iPad/Mac address sees the same lessons."""

import json
import re
import shutil
import threading
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
BACKUP_DIR = DATA / "backups"
LESSONS_FILE = DATA / "lessons.json"
SETTINGS_FILE = DATA / "settings.json"
FILES_FILE = DATA / "files.json"
IMAGES_DIR = DATA / "images"
AUDIO_DIR = DATA / "audio"

PREV_BACKUP = BACKUP_DIR / "lessons.prev.json"
DAILY_KEEP = 14
# If a save drops more than half the expressions (or 20+), keep the missing ones.
# Smaller intentional cleanups must be allowed to sync.
PROTECT_MIN_LOST = 20
PROTECT_RATIO = 0.5

SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")
_lock = threading.Lock()


def ensure_dirs():
    DATA.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
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


def _expression_count(lessons):
    if not isinstance(lessons, dict):
        return 0
    total = 0
    for lesson in lessons.values():
        if isinstance(lesson, dict):
            total += len(lesson.get("expressions") or [])
    return total


def _item_key(item):
    if not isinstance(item, dict):
        return ""
    item_id = str(item.get("id") or "").strip()
    if item_id:
        return item_id
    phrase = str(item.get("phrase") or "").strip().lower()
    return ("phrase:" + phrase) if phrase else ""


def _merge_items(primary, secondary):
    merged = {}
    for item in list(secondary or []) + list(primary or []):
        key = _item_key(item)
        if key:
            merged[key] = item
    return list(merged.values())


def _should_protect_list(incoming, existing):
    incoming_list = incoming if isinstance(incoming, list) else []
    existing_list = existing if isinstance(existing, list) else []
    incoming_n = len(incoming_list)
    existing_n = len(existing_list)
    if existing_n == 0 or incoming_n >= existing_n:
        return False
    lost = existing_n - incoming_n
    return lost >= PROTECT_MIN_LOST or incoming_n < existing_n * PROTECT_RATIO


def _drop_old_extras(merged, larger_list, smaller_list, smaller_lesson):
    larger_list = list(larger_list or [])
    smaller_list = list(smaller_list or [])
    if not smaller_list or len(larger_list) <= len(smaller_list):
        return list(merged or [])
    if not _ids_subset(smaller_list, larger_list):
        return list(merged or [])
    keep_ids = {_item_key(item) for item in smaller_list if _item_key(item)}
    cutoff = _parse_time((smaller_lesson or {}).get("updatedAt"))
    out = []
    for item in merged or []:
        key = _item_key(item)
        if key and key in keep_ids:
            out.append(item)
        elif _item_time(item) > cutoff:
            out.append(item)
    return out


def _protect_lesson(incoming, existing):
    if not isinstance(existing, dict) or not isinstance(incoming, dict):
        return incoming
    next_lesson = dict(incoming)

    def union_deleted(a, b):
        out = []
        seen = set()
        for value in list(a or []) + list(b or []):
            key = str(value or "").strip()
            if key and key not in seen:
                seen.add(key)
                out.append(key)
        return out

    deleted_expr = set(
        union_deleted(incoming.get("deletedExpressionIds"), existing.get("deletedExpressionIds"))
    )
    deleted_listen = set(
        union_deleted(incoming.get("deletedListeningIds"), existing.get("deletedListeningIds"))
    )
    next_lesson["deletedExpressionIds"] = list(deleted_expr)
    next_lesson["deletedListeningIds"] = list(deleted_listen)

    incoming_expr = list(incoming.get("expressions") or [])
    existing_expr = list(existing.get("expressions") or [])
    expressions = _merge_items(incoming_expr, existing_expr)
    if len(incoming_expr) >= len(existing_expr):
        expressions = _drop_old_extras(expressions, incoming_expr, existing_expr, existing)
    else:
        expressions = _drop_old_extras(expressions, existing_expr, incoming_expr, incoming)

    incoming_listen = list(incoming.get("listeningPoints") or [])
    existing_listen = list(existing.get("listeningPoints") or [])
    listening = _merge_items(incoming_listen, existing_listen)
    if len(incoming_listen) >= len(existing_listen):
        listening = _drop_old_extras(listening, incoming_listen, existing_listen, existing)
    else:
        listening = _drop_old_extras(listening, existing_listen, incoming_listen, incoming)

    next_lesson["expressions"] = [
        item
        for item in expressions
        if _item_key(item) not in deleted_expr and str(item.get("id") or "") not in deleted_expr
    ]
    next_lesson["listeningPoints"] = [
        item
        for item in listening
        if _item_key(item) not in deleted_listen and str(item.get("id") or "") not in deleted_listen
    ]
    return next_lesson


def _ids_subset(smaller, larger):
    large_ids = {_item_key(item) for item in larger or [] if _item_key(item)}
    if not smaller:
        return True
    if not large_ids:
        return False
    return all(_item_key(item) in large_ids for item in smaller)


def _parse_time(value):
    text = str(value or "").strip()
    if not text:
        return 0.0
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def _item_time(item):
    if not isinstance(item, dict):
        return 0.0
    return _parse_time(item.get("createdAt") or item.get("updatedAt"))


def _prune_daily_backups():
    daily = sorted(BACKUP_DIR.glob("lessons.daily-*.json"))
    for path in daily[:-DAILY_KEEP]:
        try:
            path.unlink()
        except OSError:
            pass


def _backup_lessons_file():
    """Keep an immediate previous copy and one snapshot per calendar day."""
    ensure_dirs()
    if not LESSONS_FILE.exists() or LESSONS_FILE.stat().st_size < 3:
        return
    try:
        shutil.copy2(LESSONS_FILE, PREV_BACKUP)
    except OSError:
        pass
    day = datetime.now().strftime("%Y-%m-%d")
    daily_path = BACKUP_DIR / f"lessons.daily-{day}.json"
    if not daily_path.exists():
        try:
            shutil.copy2(LESSONS_FILE, daily_path)
        except OSError:
            pass
        _prune_daily_backups()


def _write_lessons(lessons):
    _backup_lessons_file()
    _write_json(LESSONS_FILE, lessons)


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
        "safety": {
            "expressions": _expression_count(lessons if isinstance(lessons, dict) else {}),
            "prevBackup": PREV_BACKUP.exists(),
            "dailyBackup": (BACKUP_DIR / f"lessons.daily-{datetime.now().strftime('%Y-%m-%d')}.json").exists(),
        },
    }


def put_lesson(lesson):
    if not isinstance(lesson, dict) or not check_id(lesson.get("id")):
        raise ValueError("invalid lesson")
    ensure_dirs()
    with _lock:
        lessons = _read_json(LESSONS_FILE, {})
        if not isinstance(lessons, dict):
            lessons = {}
        existing = lessons.get(lesson["id"])
        protected = _protect_lesson(lesson, existing)
        lessons[protected["id"]] = protected
        _write_lessons(lessons)
    return protected


def delete_lesson(lesson_id):
    if not check_id(lesson_id):
        raise ValueError("invalid id")
    ensure_dirs()
    with _lock:
        lessons = _read_json(LESSONS_FILE, {})
        if isinstance(lessons, dict):
            lessons.pop(lesson_id, None)
            _write_lessons(lessons)


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
