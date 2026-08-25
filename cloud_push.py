"""Upload Mac disk photos and audio to Supabase so the iPad can play them."""

import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import store

CLOUD_FILE = store.DATA / "cloud.json"

_lock = threading.Lock()
_status = {
    "running": False,
    "complete": False,
    "done": 0,
    "total": 0,
    "skipped": 0,
    "failed": 0,
    "current": "",
    "error": "",
}
_started = False


def load_cloud_config():
    store.ensure_dirs()
    data = store._read_json(CLOUD_FILE, {})
    url = str(data.get("supabaseUrl") or "").strip().rstrip("/")
    key = str(data.get("supabaseAnonKey") or "").strip()
    if not url or not key:
        return None
    return {"supabaseUrl": url, "supabaseAnonKey": key}


def save_cloud_config(supabase_url, supabase_anon_key):
    url = str(supabase_url or "").strip().rstrip("/")
    key = str(supabase_anon_key or "").strip()
    if not url or not key:
        raise ValueError("invalid cloud config")
    store.ensure_dirs()
    store._write_json(CLOUD_FILE, {"supabaseUrl": url, "supabaseAnonKey": key})
    start_push()
    return get_status()


def get_status():
    with _lock:
        return dict(_status)


def start_push_if_configured():
    if load_cloud_config():
        start_push()


def start_push():
    global _started
    with _lock:
        if _status["running"]:
            return get_status()
        _status.update(
            {
                "running": True,
                "complete": False,
                "done": 0,
                "total": 0,
                "skipped": 0,
                "failed": 0,
                "current": "",
                "error": "",
            }
        )
        _started = True
    thread = threading.Thread(target=_run_push, name="cloud-push", daemon=True)
    thread.start()
    return get_status()


def _set(**kwargs):
    with _lock:
        _status.update(kwargs)


def _headers(key, extra=None):
    headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
    }
    if extra:
        headers.update(extra)
    return headers


def _request(method, url, key, data=None, extra=None, json_body=None):
    body = data
    headers = _headers(key, extra)
    if json_body is not None:
        body = json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            raw = res.read()
            if not raw:
                return res.status, None
            try:
                return res.status, json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                return res.status, raw
    except urllib.error.HTTPError as error:
        raw = error.read()
        text = raw.decode("utf-8", "replace") if raw else ""
        raise RuntimeError("cloud %s %s" % (error.code, text[:240])) from error


def _existing_files(url, key):
    status, payload = _request(
        "GET",
        url + "/rest/v1/listening_files?select=kind,id",
        key,
    )
    if status >= 400:
        raise RuntimeError("cloud files %s" % status)
    found = set()
    for row in payload or []:
        kind = row.get("kind")
        file_id = row.get("id")
        if kind in ("images", "audio") and file_id:
            found.add((kind, file_id))
    return found


def _local_blobs():
    state = store.get_state()
    files = state.get("files") or {}
    items = []
    seen = set()
    for kind in ("images", "audio"):
        folder = store.IMAGES_DIR if kind == "images" else store.AUDIO_DIR
        meta_map = files.get(kind) if isinstance(files.get(kind), dict) else {}
        names = set(meta_map)
        if folder.exists():
            names.update(path.name for path in folder.iterdir() if path.is_file())
        for file_id in sorted(names):
            if not store.check_id(file_id):
                continue
            path = store.blob_path(kind, file_id)
            if not path.exists():
                continue
            key = (kind, file_id)
            if key in seen:
                continue
            seen.add(key)
            meta = meta_map.get(file_id) or {}
            items.append(
                {
                    "kind": kind,
                    "id": file_id,
                    "path": path,
                    "mimeType": meta.get("mimeType") or "application/octet-stream",
                    "fileName": meta.get("fileName") or "",
                }
            )
    return items


def _upload_blob(url, key, item):
    object_url = "%s/storage/v1/object/listening-media/%s/%s" % (
        url,
        item["kind"],
        urllib.parse.quote(item["id"], safe=""),
    )
    data = item["path"].read_bytes()
    try:
        _request(
            "POST",
            object_url,
            key,
            data=data,
            extra={
                "Content-Type": item["mimeType"],
                "x-upsert": "true",
            },
        )
    except RuntimeError as error:
        message = str(error)
        if "409" not in message and "Duplicate" not in message:
            raise
    _request(
        "POST",
        url + "/rest/v1/listening_files",
        key,
        extra={"Prefer": "resolution=merge-duplicates,return=minimal"},
        json_body={
            "kind": item["kind"],
            "id": item["id"],
            "mime_type": item["mimeType"],
            "file_name": item["fileName"],
            "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    )


def _run_push():
    cfg = load_cloud_config()
    if not cfg:
        _set(running=False, complete=True, error="클라우드 설정이 없습니다.")
        return
    url = cfg["supabaseUrl"]
    key = cfg["supabaseAnonKey"]
    try:
        items = _local_blobs()
        existing = _existing_files(url, key)
        pending = [item for item in items if (item["kind"], item["id"]) not in existing]
        _set(total=len(pending), skipped=len(items) - len(pending))
        done = 0
        failed = 0
        last_error = ""
        for item in pending:
            _set(current=item["fileName"] or item["id"])
            try:
                _upload_blob(url, key, item)
                done += 1
            except Exception as error:
                failed += 1
                last_error = str(error)[:240]
                print("cloud push failed %s/%s: %s" % (item["kind"], item["id"], last_error), flush=True)
            _set(done=done, failed=failed, error=last_error)
        _set(
            running=False,
            complete=True,
            current="",
            error=last_error if failed else "",
        )
    except Exception as error:
        _set(running=False, complete=True, error=str(error)[:240], current="")
        print("cloud push stopped:", error, flush=True)
