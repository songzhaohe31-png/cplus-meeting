#!/usr/bin/env python3
"""
CPLUS 会议室预约系统
- 可部署到云（Render / Railway / 任意云主机）
- 电脑关机也能约：服务跑在云上，不碰你本机私人文件
- 可选访问码 ACCESS_PIN
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA_DIR = Path(os.environ.get("DATA_DIR", str(ROOT / "data")))
DATA_FILE = DATA_DIR / "bookings.json"
PORT = int(os.environ.get("PORT") or os.environ.get("CPLUS_PORT") or "8765")
# 可选：设置后所有预约接口需携带正确访问码（推荐公网开启）
ACCESS_PIN = (os.environ.get("ACCESS_PIN") or "").strip()

DAY_START = 9 * 60 + 30
DAY_END = 18 * 60

ROOMS = {
    "large": {"name": "大会议室", "max": 10},
    "medium": {"name": "中会议室", "max": 4},
    "small": {"name": "小会议室", "max": 2},
}

_lock = threading.Lock()


def ensure_data():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]", encoding="utf-8")


def load_bookings():
    ensure_data()
    try:
        items = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return [normalize_item(b) for b in items if isinstance(b, dict)]
    except Exception:
        return []


def normalize_item(b: dict) -> dict:
    return {
        "id": b.get("id") or ("b_" + uuid.uuid4().hex[:12]),
        "roomId": b.get("roomId"),
        "date": b.get("date"),
        "startTime": b.get("startTime"),
        "endTime": b.get("endTime"),
        "attendees": int(b.get("attendees") or 1),
        "createdAt": b.get("createdAt") or int(datetime.now().timestamp() * 1000),
        "updatedAt": b.get("updatedAt"),
    }


def save_bookings(items):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    clean = [normalize_item(b) for b in items]
    tmp = DATA_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(DATA_FILE)


def parse_minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def overlaps(s1, e1, s2, e2) -> bool:
    return s1 < e2 and s2 < e1


def is_weekday(date_str: str) -> bool:
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return d.weekday() < 5


def find_conflict(items, candidate, exclude_id=None):
    try:
        s = parse_minutes(candidate["startTime"])
        e = parse_minutes(candidate["endTime"])
    except Exception:
        return None
    for b in items:
        if exclude_id and b.get("id") == exclude_id:
            continue
        if b.get("roomId") != candidate.get("roomId"):
            continue
        if b.get("date") != candidate.get("date"):
            continue
        if overlaps(s, e, parse_minutes(b["startTime"]), parse_minutes(b["endTime"])):
            return b
    return None


def validate(data, items, exclude_id=None):
    for k in ("roomId", "date", "startTime", "endTime"):
        if not str(data.get(k, "")).strip():
            return f"请填写：{k}"
    if data["roomId"] not in ROOMS:
        return "无效会议室"
    if not is_weekday(data["date"]):
        return "仅周一至周五可预约"
    try:
        s = parse_minutes(data["startTime"])
        e = parse_minutes(data["endTime"])
    except Exception:
        return "时间格式不正确"
    if e <= s:
        return "结束时间必须晚于开始时间"
    if e - s < 15:
        return "会议时长至少 15 分钟"
    if s < DAY_START or e > DAY_END:
        return "可预约时段为 9:30 – 18:00"
    try:
        people = int(data.get("attendees") or 0)
    except Exception:
        return "人数格式不正确"
    if people < 1:
        return "人数至少为 1"
    max_cap = ROOMS[data["roomId"]]["max"]
    if people > max_cap:
        return f"{ROOMS[data['roomId']]['name']}最多 {max_cap} 人"
    conflict = find_conflict(items, data, exclude_id)
    if conflict:
        room = ROOMS[data["roomId"]]["name"]
        return (
            f"该时段已被占用：{room} "
            f"{conflict['startTime']}–{conflict['endTime']}。"
            f"请更换时间或会议室（先到先得）。"
        )
    return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def log_message(self, fmt, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Access-Pin",
        )

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def _check_pin(self) -> bool:
        if not ACCESS_PIN:
            return True
        pin = (self.headers.get("X-Access-Pin") or "").strip()
        return pin == ACCESS_PIN

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/config":
            return self._json(
                200,
                {
                    "ok": True,
                    "name": "CPLUS预约会议系统",
                    "pinRequired": bool(ACCESS_PIN),
                    "rooms": ROOMS,
                    "hours": "9:30-18:00",
                    "weekdaysOnly": True,
                },
            )

        if parsed.path.startswith("/api/"):
            if not self._check_pin():
                return self._json(401, {"ok": False, "error": "需要访问码", "needPin": True})

        if parsed.path == "/api/bookings":
            qs = parse_qs(parsed.query)
            with _lock:
                items = load_bookings()
            date = (qs.get("date") or [None])[0]
            room = (qs.get("roomId") or [None])[0]
            if date:
                items = [b for b in items if b.get("date") == date]
            if room and room != "all":
                items = [b for b in items if b.get("roomId") == room]
            items.sort(key=lambda b: (b.get("date", ""), b.get("startTime", "")))
            return self._json(200, {"ok": True, "bookings": items})

        if parsed.path == "/api/health":
            return self._json(200, {"ok": True, "service": "CPLUS预约会议系统"})

        if parsed.path in ("/", ""):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/bookings":
            return self._json(404, {"ok": False, "error": "Not found"})
        if not self._check_pin():
            return self._json(401, {"ok": False, "error": "需要访问码", "needPin": True})
        try:
            data = self._read_json()
        except Exception:
            return self._json(400, {"ok": False, "error": "JSON 无效"})

        with _lock:
            items = load_bookings()
            err = validate(data, items)
            if err:
                return self._json(409, {"ok": False, "error": err})
            item = {
                "id": "b_" + uuid.uuid4().hex[:12],
                "roomId": data["roomId"],
                "date": data["date"],
                "startTime": data["startTime"],
                "endTime": data["endTime"],
                "attendees": int(data.get("attendees") or 1),
                "createdAt": int(datetime.now().timestamp() * 1000),
            }
            items.append(item)
            save_bookings(items)
        return self._json(201, {"ok": True, "booking": normalize_item(item)})

    def do_PUT(self):
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if len(parts) != 3 or parts[0] != "api" or parts[1] != "bookings":
            return self._json(404, {"ok": False, "error": "Not found"})
        if not self._check_pin():
            return self._json(401, {"ok": False, "error": "需要访问码", "needPin": True})
        bid = parts[2]
        try:
            data = self._read_json()
        except Exception:
            return self._json(400, {"ok": False, "error": "JSON 无效"})

        with _lock:
            items = load_bookings()
            idx = next((i for i, b in enumerate(items) if b.get("id") == bid), None)
            if idx is None:
                return self._json(404, {"ok": False, "error": "预约不存在"})
            err = validate(data, items, exclude_id=bid)
            if err:
                return self._json(409, {"ok": False, "error": err})
            items[idx] = {
                "id": bid,
                "roomId": data["roomId"],
                "date": data["date"],
                "startTime": data["startTime"],
                "endTime": data["endTime"],
                "attendees": int(data.get("attendees") or 1),
                "createdAt": items[idx].get("createdAt")
                or int(datetime.now().timestamp() * 1000),
                "updatedAt": int(datetime.now().timestamp() * 1000),
            }
            save_bookings(items)
            item = items[idx]
        return self._json(200, {"ok": True, "booking": normalize_item(item)})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if len(parts) != 3 or parts[0] != "api" or parts[1] != "bookings":
            return self._json(404, {"ok": False, "error": "Not found"})
        if not self._check_pin():
            return self._json(401, {"ok": False, "error": "需要访问码", "needPin": True})
        bid = parts[2]
        with _lock:
            items = load_bookings()
            new_items = [b for b in items if b.get("id") != bid]
            if len(new_items) == len(items):
                return self._json(404, {"ok": False, "error": "预约不存在"})
            save_bookings(new_items)
        return self._json(200, {"ok": True})


def main():
    ensure_data()
    STATIC.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("=" * 56)
    print("  CPLUS预约会议系统")
    print(f"  端口: {PORT}")
    print(f"  访问码: {'已启用' if ACCESS_PIN else '未设置（公网建议设置 ACCESS_PIN）'}")
    print("  可用: 周一至周五 9:30–18:00")
    print("  大10 / 中4 / 小2")
    print("=" * 56)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.server_close()


if __name__ == "__main__":
    main()
