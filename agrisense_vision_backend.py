"""
AgriSense Vision Backend  (Project-integrated version)
=======================================================
Place this file in:  Agri-Sense-main/agrisense_vision_backend.py

What it does
------------
- Pulls MJPEG frames from one or more ESP32-CAMs
- Runs YOLOv8n inference on every frame
- Serves annotated MJPEG at   GET  /stream/<cam_id>
  (shortcut: /stream  →  cam1)
- Broadcasts detection JSON   WS   /ws
  payload: { cam_id, detections:[{label,confidence,x,y,width,height}], timestamp }
- Auto-triggers buzzer + LED  POST /trigger
  (also fires automatically on every animal detection for AUTO_TRIGGER_SECONDS)
- Snapshot of latest results  GET  /detections
- Health-check                GET  /health

How to run on your PC
---------------------
1.  Connect PC to the "AgriSense_IoT" Wi-Fi AP (192.168.4.x subnet).
2.  Install deps once:
        pip install flask flask-sock ultralytics opencv-python requests
3.  Copy yolov8n.pt into this same folder (or set YOLO_MODEL to the full path).
4.  Run:
        python agrisense_vision_backend.py
5.  Note the PC's IP on the AP (run `ipconfig`, look for 192.168.4.x).
6.  In VisualMonitor.jsx line 14, set:
        const BACKEND_IP = '192.168.4.xxx';   // your PC's IP
7.  Rebuild APK  OR  for browser testing run:
        npm run dev -- --host
    Open the URL shown (e.g. http://192.168.4.100:5173) on any device on the AP.

CORS is fully open so Vite dev-server and the Android WebView both work.
"""

import cv2
import json
import numpy as np
import os
import requests
import threading
import time

from flask import Flask, Response, jsonify, request
from flask_sock import Sock
import torch

# Fix for PyTorch 2.6: weights_only default changed to True, breaking YOLO model loading
_orig_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    kwargs.setdefault('weights_only', False)
    return _orig_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

from ultralytics import YOLO

# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIG  — edit these as needed
# ═══════════════════════════════════════════════════════════════════════════════

# Cameras: { "cam_id": "stream_url" }
# Add more ESP-CAMs here (e.g. cam2 at 192.168.4.3:81/stream)
CAMERAS = {
    "cam1": "http://192.168.29.201:81/stream",
    # "cam2": "http://192.168.4.3:81/stream",
}

SENSOR_ESP_IP       = "http://192.168.29.200"   # Sensor ESP32 — controls buzzer & LED
YOLO_MODEL          = "yolov8n.pt"            # path to model weights
CONF_THRESHOLD      = 0.30                    # detection confidence cutoff (display + WS)
AUTO_TRIGGER_SEC    = 5                       # seconds buzzer+LED stay on after detection
MIN_CONF_FOR_ALARM  = 0.48                    # stricter threshold before buzzer/LED (reduces false positives)
BACKEND_PORT        = int(os.environ.get("PORT", 5050))
# How often to pull a fresh JPEG from the ESP /capture endpoint (lower = less latency, more ESP + PC load)
CAPTURE_POLL_SEC    = float(os.environ.get("AGRISENSE_CAPTURE_POLL", "0.75"))
# Require this many consecutive polls with a qualifying detection before hardware alarm
ALARM_DEBOUNCE_POLLS = 2
# Skip YOLO on near-black / flat frames only (ESP night / low contrast needs lower bar than office lighting)
FRAME_MIN_STD_GRAY  = 4.0
FRAME_MIN_MEAN_GRAY = 6.0

# COCO: person + bird/cat/dog/horse/sheep/cow/elephant/bear/zebra/giraffe only (no full COCO)
YOLO_CLASSES = [0, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]

# ═══════════════════════════════════════════════════════════════════════════════

app  = Flask(__name__)
sock = Sock(app)


# ── CORS (allow Vite dev server + Android WebView) ───────────────────────────
@app.after_request
def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"]  = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return resp


# ── Shared state ──────────────────────────────────────────────────────────────
_latest_frames     = {k: None for k in CAMERAS}
_latest_detections = {k: []   for k in CAMERAS}
_frame_locks       = {k: threading.Lock() for k in CAMERAS}
_placeholder_jpeg_cache = None
_placeholder_jpeg_lock  = threading.Lock()
_ws_clients        = set()
_ws_lock           = threading.Lock()


def _placeholder_jpeg():
    """Valid JPEG so /frame always returns image/* while the camera thread warms up (avoids 503 + mobile OFFLINE)."""
    global _placeholder_jpeg_cache
    with _placeholder_jpeg_lock:
        if _placeholder_jpeg_cache is None:
            z = np.zeros((120, 160, 3), dtype=np.uint8)
            _, enc = cv2.imencode(".jpg", z, [cv2.IMWRITE_JPEG_QUALITY, 65])
            _placeholder_jpeg_cache = enc.tobytes()
        return _placeholder_jpeg_cache

_trigger_active    = False
_trigger_lock      = threading.Lock()
_trigger_timer_ref = [None]   # list so inner func can mutate
_alarm_streak      = {k: 0 for k in CAMERAS}  # consecutive polls with strong detection


# ── Auto-trigger: buzzer + LED ────────────────────────────────────────────────
def _fire_trigger():
    """Non-blocking: fire buzzer+LED, auto-off after AUTO_TRIGGER_SEC."""
    with _trigger_lock:
        if _trigger_active:
            # Already on — just reset the timer
            if _trigger_timer_ref[0]:
                _trigger_timer_ref[0].cancel()
        else:
            # Turn on
            _trigger_active_setter(True)
            try:
                requests.get(f"{SENSOR_ESP_IP}/buzzer?state=on", timeout=2)
                requests.get(f"{SENSOR_ESP_IP}/light?state=on",  timeout=2)
                print("[trigger] 🔔 Buzzer + LED ON")
            except Exception as e:
                print(f"[trigger] Sensor ESP unreachable: {e}")

        def _auto_off():
            _trigger_active_setter(False)
            try:
                requests.get(f"{SENSOR_ESP_IP}/buzzer?state=off", timeout=2)
                requests.get(f"{SENSOR_ESP_IP}/light?state=off",  timeout=2)
                print("[trigger] 🔕 Buzzer + LED OFF")
            except Exception:
                pass

        t = threading.Timer(AUTO_TRIGGER_SEC, _auto_off)
        t.daemon = True
        t.start()
        _trigger_timer_ref[0] = t


def _trigger_active_setter(val):
    global _trigger_active
    _trigger_active = val


def _resolve_cam_id(requested):
    """Avoid HTTP 404 when app asks for cam1 but config uses another id (or casing differs)."""
    if not CAMERAS:
        return None
    if requested in CAMERAS:
        return requested
    rlow = (requested or "").lower()
    for k in CAMERAS:
        if k.lower() == rlow:
            return k
    return next(iter(CAMERAS.keys()))


def _frame_suitable_for_detection(bgr):
    """Reject only truly dead/flat frames; keep marginal ESP shots so YOLO still runs."""
    if bgr is None or bgr.size < 400:
        return False
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    mean = float(np.mean(gray))
    std = float(np.std(gray))
    if mean < 3.0 and std < 2.0:
        return False
    if mean < FRAME_MIN_MEAN_GRAY and std < FRAME_MIN_STD_GRAY * 1.2:
        return False
    if std < FRAME_MIN_STD_GRAY:
        return False
    return True


def _qualifying_detections(raw_boxes, names):
    """Filter boxes for hardware alarm: stricter conf than display."""
    out = []
    if raw_boxes is None or len(raw_boxes) == 0:
        return out
    for box in raw_boxes:
        conf = float(box.conf)
        if conf < MIN_CONF_FOR_ALARM:
            continue
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        out.append({
            "label":      names[int(box.cls)],
            "confidence": round(conf * 100, 1),
            "x": int(x1), "y": int(y1),
            "width": int(x2 - x1), "height": int(y2 - y1),
        })
    return out


# ── Per-camera background reader thread ───────────────────────────────────────
def _cam_reader(cam_id, stream_url, model):
    if ":81/stream" in stream_url:
        capture_url = stream_url.replace(":81/stream", "/capture")
    else:
        capture_url = stream_url

    print(f"[{cam_id}] Snapshot Mode: polling {capture_url} every {CAPTURE_POLL_SEC}s …")
    while True:
        try:
            resp = requests.get(capture_url, timeout=5)
            if resp.status_code == 200:
                img_bytes = resp.content
                frame = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
                if frame is not None:
                    if not _frame_suitable_for_detection(frame):
                        # No inference: show raw feed, clear detections, reset alarm streak
                        _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                        with _frame_locks[cam_id]:
                            _latest_frames[cam_id]     = jpeg.tobytes()
                            _latest_detections[cam_id] = []
                        _alarm_streak[cam_id] = 0
                        msg = json.dumps({
                            "cam_id":     cam_id,
                            "detections": [],
                            "timestamp":  int(time.time() * 1000),
                        })
                        with _ws_lock:
                            dead = set()
                            for ws in _ws_clients:
                                try:    ws.send(msg)
                                except: dead.add(ws)
                            _ws_clients.difference_update(dead)
                    else:
                        res = model.predict(frame, classes=YOLO_CLASSES, conf=CONF_THRESHOLD, verbose=False)
                        # Minimal logging so terminal isn't totally silent but not spammed either
                        print(f"[{cam_id}] Frame processed, detections: {len(res[0].boxes)}", end='\r')
                        annotated = res[0].plot()

                        detections = []
                        for box in res[0].boxes:
                            x1, y1, x2, y2 = box.xyxy[0].tolist()
                            detections.append({
                                "label":      model.names[int(box.cls)],
                                "confidence": round(float(box.conf) * 100, 1),
                                "x": int(x1), "y": int(y1),
                                "width": int(x2 - x1), "height": int(y2 - y1),
                            })

                        strong = _qualifying_detections(res[0].boxes, model.names)
                        if strong:
                            _alarm_streak[cam_id] = _alarm_streak.get(cam_id, 0) + 1
                        else:
                            _alarm_streak[cam_id] = 0

                        _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])

                        with _frame_locks[cam_id]:
                            _latest_frames[cam_id]     = jpeg.tobytes()
                            _latest_detections[cam_id] = detections

                        if strong and _alarm_streak[cam_id] >= ALARM_DEBOUNCE_POLLS:
                            _alarm_streak[cam_id] = 0
                            threading.Thread(target=_fire_trigger, daemon=True).start()

                        # App + /detections: full list at CONF_THRESHOLD (boxes match annotated stream).
                        # Hardware alarm still uses MIN_CONF_FOR_ALARM + debounce only.
                        msg = json.dumps({
                            "cam_id":     cam_id,
                            "detections": detections,
                            "timestamp":  int(time.time() * 1000),
                        })
                        with _ws_lock:
                            dead = set()
                            for ws in _ws_clients:
                                try:    ws.send(msg)
                                except: dead.add(ws)
                            _ws_clients.difference_update(dead)

            time.sleep(CAPTURE_POLL_SEC)
        except Exception as exc:
            print(f"[{cam_id}] Error: {exc} — retry in {max(1.0, CAPTURE_POLL_SEC)} s")
            time.sleep(max(1.0, CAPTURE_POLL_SEC))


# ── MJPEG generator ───────────────────────────────────────────────────────────
def _mjpeg_gen(cam_id):
    lock = _frame_locks.get(cam_id, threading.Lock())
    while True:
        with lock:
            frame = _latest_frames.get(cam_id)
        if frame:
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
        time.sleep(0.02)


# ── Routes ────────────────────────────────────────────────────────────────────
def _stream_response(resolved_id):
    r = Response(_mjpeg_gen(resolved_id), mimetype="multipart/x-mixed-replace; boundary=frame")
    r.headers["Cache-Control"] = "no-cache"
    return r


@app.route("/stream/<cam_id>")
def stream(cam_id):
    rid = _resolve_cam_id(cam_id)
    if rid is None:
        return jsonify(error="no cameras configured"), 503
    return _stream_response(rid)


@app.route("/stream")
def stream_default():
    rid = _resolve_cam_id("cam1")
    if rid is None:
        return jsonify(error="no cameras configured"), 503
    return _stream_response(rid)


def _frame_jpeg_response(cam_id):
    rid = _resolve_cam_id(cam_id)
    if rid is None:
        jpg = _placeholder_jpeg()
    else:
        lock = _frame_locks.get(rid, threading.Lock())
        with lock:
            jpg = _latest_frames.get(rid)
        if not jpg:
            jpg = _placeholder_jpeg()
    r = Response(jpg, mimetype="image/jpeg")
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    return r


@app.route("/frame/<cam_id>")
def frame(cam_id):
    return _frame_jpeg_response(cam_id)


@app.route("/frame")
def frame_default():
    return _frame_jpeg_response("cam1")


@app.route("/snapshot/<cam_id>")
def snapshot_frame(cam_id):
    """Alias for /frame — some proxies or old builds block /frame; use this path in tests."""
    return _frame_jpeg_response(cam_id)


@app.route("/snapshot")
def snapshot_default():
    return _frame_jpeg_response("cam1")


@app.route("/detections")
def detections():
    return jsonify({k: _latest_detections.get(k, []) for k in CAMERAS})

@app.route("/health")
def health():
    return jsonify(
        status="ok",
        api_version=2,
        cameras=list(CAMERAS.keys()),
        trigger_active=_trigger_active,
        min_conf_alarm_pct=round(MIN_CONF_FOR_ALARM * 100, 1),
        conf_threshold_pct=round(CONF_THRESHOLD * 100, 1),
        capture_poll_sec=CAPTURE_POLL_SEC,
        frame_paths=["/frame/<cam_id>", "/frame", "/snapshot/<cam_id>", "/snapshot"],
    )

@app.route("/trigger", methods=["POST", "OPTIONS"])
def trigger():
    if request.method == "OPTIONS":
        return "", 204
    threading.Thread(target=_fire_trigger, daemon=True).start()
    return jsonify(status="triggered")

@app.route("/light")
def light_control():
    state = request.args.get("state", "off")
    try:
        requests.get(f"{SENSOR_ESP_IP}/light?state={state}", timeout=2)
        return jsonify(status=f"light {state}")
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route("/buzzer")
def buzzer_control():
    state = request.args.get("state", "off")
    try:
        requests.get(f"{SENSOR_ESP_IP}/buzzer?state={state}", timeout=2)
        return jsonify(status=f"buzzer {state}")
    except Exception as e:
        return jsonify(error=str(e)), 500

@sock.route("/ws")
def websocket(ws):
    with _ws_lock:
        _ws_clients.add(ws)
    try:
        while True:
            ws.receive(timeout=60)
    except Exception:
        pass
    finally:
        with _ws_lock:
            _ws_clients.discard(ws)


# ── Startup ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n[backend] Loading YOLO model …")
    model = YOLO(YOLO_MODEL)
    print("[backend] Model ready.\n")

    for cam_id, url in CAMERAS.items():
        t = threading.Thread(target=_cam_reader, args=(cam_id, url, model), daemon=True)
        t.start()

    w = 60
    print("=" * w)
    print("  AgriSense Vision Backend  (project-integrated)")
    print("=" * w)
    print(f"  Port          :  {BACKEND_PORT}")
    for cam_id in CAMERAS:
        print(f"  Stream [{cam_id}]  :  http://<PC-IP>:{BACKEND_PORT}/stream/{cam_id}")
    print(f"  Frame (JPEG)  :  http://<PC-IP>:{BACKEND_PORT}/frame/{{cam_id}}  (alias: /snapshot/{{cam_id}})")
    print(f"  WebSocket     :  ws://<PC-IP>:{BACKEND_PORT}/ws")
    print(f"  Detections    :  http://<PC-IP>:{BACKEND_PORT}/detections")
    print(f"  Health-check  :  http://<PC-IP>:{BACKEND_PORT}/health")
    print(f"  Manual trigger:  POST http://<PC-IP>:{BACKEND_PORT}/trigger")
    print(f"  Sensor ESP    :  {SENSOR_ESP_IP}  (buzzer + LED)")
    print(f"  YOLO classes  :  {len(YOLO_CLASSES)} COCO ids (person + animals)")
    print(f"  Capture poll  :  {CAPTURE_POLL_SEC}s  (env AGRISENSE_CAPTURE_POLL)")
    print("=" * w)
    print(f"\n  ⚡ Hardware alarm uses conf≥{MIN_CONF_FOR_ALARM} + {ALARM_DEBOUNCE_POLLS} consecutive polls")
    print(f"  📡 Connect PC to AgriSense_IoT AP, note your 192.168.4.x IP")
    print(f"  🖥️  Set BACKEND_IP in VisualMonitor.jsx to that IP")
    print(f"  🌐  For browser test: npm run dev -- --host  (in project root)\n")

    app.run(host="0.0.0.0", port=BACKEND_PORT, threaded=True)
