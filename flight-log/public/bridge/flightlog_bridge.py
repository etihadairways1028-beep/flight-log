#!/usr/bin/env python3
"""
Flight Log sim bridge
=====================

Connects Microsoft Flight Simulator 2020 / 2024 (SimConnect) or X-Plane 11 / 12
(built-in UDP data output, no plugin needed) to the Flight Log web app.

It runs on the same PC as the simulator and serves live aircraft data on a local
WebSocket (ws://127.0.0.1:8765). Flight Log in your browser connects to it, shows
your aircraft live and records the flight automatically. The bridge can also save
flight plans from Flight Log straight into the simulator's flight-plan folder.

Only this computer can connect (it listens on 127.0.0.1). Nothing is sent anywhere else.

Usage
-----
    pip install -r requirements.txt
    python flightlog_bridge.py                 # auto-detect: tries MSFS, then X-Plane
    python flightlog_bridge.py --sim msfs
    python flightlog_bridge.py --sim xplane --xplane-dir "C:/X-Plane 12"
    python flightlog_bridge.py --test          # replay a short demo circuit (connection test only)
"""
from __future__ import annotations

import argparse
import urllib.request
import asyncio
import json
import math
import os
import re
import socket
import struct
import sys
import time
from pathlib import Path

VERSION = "1.0.0"
DEFAULT_PORT = 8765

try:
    import websockets  # type: ignore
except ImportError:  # pragma: no cover
    print("Missing dependency: run  pip install -r requirements.txt  (needs 'websockets').")
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# X-Plane 11 / 12 — UDP "RREF" dataref subscriptions (X-Plane listens on 49000)
# ─────────────────────────────────────────────────────────────────────────────
class XPlaneSource:
    name = "X-Plane"
    DATAREFS = [
        ("sim/flightmodel/position/latitude", "lat"),
        ("sim/flightmodel/position/longitude", "lon"),
        ("sim/flightmodel/position/elevation", "alt_m"),
        ("sim/flightmodel/position/y_agl", "agl_m"),
        ("sim/flightmodel/position/groundspeed", "gs_ms"),
        ("sim/flightmodel/position/indicated_airspeed", "ias"),
        ("sim/flightmodel/position/psi", "hdg"),
        ("sim/flightmodel/position/vh_ind_fpm", "vs"),
        ("sim/flightmodel/failures/onground_any", "ground"),
        ("sim/cockpit2/controls/parking_brake_ratio", "pbrake"),
        ("sim/flightmodel/engine/ENGN_running[0]", "eng0"),
        ("sim/flightmodel/engine/ENGN_running[1]", "eng1"),
        ("sim/flightmodel/engine/ENGN_running[2]", "eng2"),
        ("sim/flightmodel/engine/ENGN_running[3]", "eng3"),
        ("sim/time/paused", "paused"),
        ("sim/version/xplane_internal_version", "version"),
    ] + [(f"sim/aircraft/view/acf_ICAO[{i}]", f"icao{i}") for i in range(8)]

    def __init__(self, host: str = "127.0.0.1", port: int = 49000, freq: int = 5, xplane_dir: str | None = None):
        self.addr = (host, port)
        self.freq = freq
        self.xplane_dir = xplane_dir
        self.values: dict[str, float] = {}
        self.last_rx = 0.0
        self.last_sub = 0.0
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("0.0.0.0", 0))
        self.sock.setblocking(False)

    def _subscribe(self, freq: int) -> None:
        for i, (ref, _) in enumerate(self.DATAREFS):
            msg = b"RREF\x00" + struct.pack("<ii400s", freq, i, ref.encode("ascii"))
            try:
                self.sock.sendto(msg, self.addr)
            except OSError:
                pass
        self.last_sub = time.time()

    def poll(self) -> None:
        now = time.time()
        # (re)subscribe at start and whenever X-Plane goes quiet (restarted, not running yet)
        if now - self.last_rx > 3 and now - self.last_sub > 3:
            self._subscribe(self.freq)
        while True:
            try:
                data, _ = self.sock.recvfrom(4096)
            except (BlockingIOError, OSError):
                break
            if len(data) < 5 or data[:4] != b"RREF":
                continue
            body = data[5:]
            for off in range(0, len(body) - 7, 8):
                idx, val = struct.unpack_from("<if", body, off)
                if 0 <= idx < len(self.DATAREFS):
                    self.values[self.DATAREFS[idx][1]] = val
            self.last_rx = now

    @property
    def connected(self) -> bool:
        return time.time() - self.last_rx < 3 and "lat" in self.values

    def label(self) -> str:
        v = int(self.values.get("version", 0))
        major = v // 10000 if v else 0
        return f"X-Plane {major}" if major in (10, 11, 12, 13) else "X-Plane"

    def snapshot(self) -> dict | None:
        self.poll()
        if not self.connected:
            return None
        v = self.values
        icao = "".join(chr(int(v.get(f"icao{i}", 0))) for i in range(8) if 32 < int(v.get(f"icao{i}", 0)) < 127)
        return {
            "lat": v.get("lat"), "lon": v.get("lon"),
            "altFt": v.get("alt_m", 0) * 3.28084, "aglFt": v.get("agl_m", 0) * 3.28084,
            "gsKt": v.get("gs_ms", 0) * 1.943844, "iasKt": v.get("ias", 0), "hdg": v.get("hdg", 0) % 360,
            "vsFpm": v.get("vs", 0), "onGround": v.get("ground", 0) >= 0.5,
            "parkingBrake": v.get("pbrake", 0) > 0.5,
            "engines": sum(1 for k in ("eng0", "eng1", "eng2", "eng3") if v.get(k, 0) >= 0.5),
            "paused": v.get("paused", 0) >= 0.5, "aircraft": icao, "sim": self.label(),
        }

    def plans_dir(self) -> Path | None:
        if not self.xplane_dir:
            return None
        return Path(self.xplane_dir) / "Output" / "FMS plans"

    def close(self) -> None:
        try:
            self._subscribe(0)  # unsubscribe
        finally:
            self.sock.close()


# ─────────────────────────────────────────────────────────────────────────────
# MSFS 2020 / 2024 — SimConnect (Windows), via the "SimConnect" Python package
# ─────────────────────────────────────────────────────────────────────────────
class MsfsSource:
    name = "MSFS"
    VARS = [
        ("lat", b"PLANE LATITUDE", b"degrees"),
        ("lon", b"PLANE LONGITUDE", b"degrees"),
        ("altFt", b"PLANE ALTITUDE", b"feet"),
        ("aglFt", b"PLANE ALT ABOVE GROUND", b"feet"),
        ("gsKt", b"GROUND VELOCITY", b"knots"),
        ("iasKt", b"AIRSPEED INDICATED", b"knots"),
        ("hdg", b"PLANE HEADING DEGREES TRUE", b"degrees"),
        ("vsFpm", b"VERTICAL SPEED", b"feet per minute"),
        ("onGround", b"SIM ON GROUND", b"bool"),
        ("parkingBrake", b"BRAKE PARKING POSITION", b"bool"),
        ("eng1", b"GENERAL ENG COMBUSTION:1", b"bool"),
        ("eng2", b"GENERAL ENG COMBUSTION:2", b"bool"),
        ("eng3", b"GENERAL ENG COMBUSTION:3", b"bool"),
        ("eng4", b"GENERAL ENG COMBUSTION:4", b"bool"),
    ]

    def __init__(self, plans_dir: str | None = None):
        from SimConnect import SimConnect  # type: ignore
        from SimConnect.RequestList import Request  # type: ignore
        self.sm = SimConnect()
        self.reqs = {key: Request((name, unit), self.sm, _time=200) for key, name, unit in self.VARS}
        self.title_req = Request((b"TITLE", None), self.sm, _time=5000)
        self.model_req = Request((b"ATC MODEL", None), self.sm, _time=5000)
        self._plans_dir = Path(plans_dir) if plans_dir else Path.home() / "Documents" / "Flight Log Plans"

    @property
    def connected(self) -> bool:
        return getattr(self.sm, "ok", True) and not getattr(self.sm, "quit", 0)

    def snapshot(self) -> dict | None:
        try:
            v = {k: r.value for k, r in self.reqs.items()}
        except Exception:
            return None
        if v.get("lat") is None or v.get("lon") is None:
            return None
        def txt(r):
            try:
                x = r.value
                return x.decode("utf-8", "ignore").strip("\x00 ") if isinstance(x, (bytes, bytearray)) else str(x or "")
            except Exception:
                return ""
        model = txt(self.model_req)
        m = re.search(r"([A-Z][A-Z0-9]{2,3})", model)
        return {
            "lat": float(v["lat"]), "lon": float(v["lon"]), "altFt": float(v.get("altFt") or 0), "aglFt": float(v.get("aglFt") or 0),
            "gsKt": float(v.get("gsKt") or 0), "iasKt": float(v.get("iasKt") or 0), "hdg": float(v.get("hdg") or 0) % 360,
            "vsFpm": float(v.get("vsFpm") or 0), "onGround": bool(v.get("onGround")), "parkingBrake": bool(v.get("parkingBrake")),
            "engines": sum(1 for k in ("eng1", "eng2", "eng3", "eng4") if v.get(k)), "paused": False,
            "aircraft": (m.group(1) if m else "") or txt(self.title_req)[:40], "title": txt(self.title_req), "sim": "MSFS",
        }

    def plans_dir(self) -> Path | None:
        return self._plans_dir

    def load_plan(self, path: Path) -> bool:
        fn = getattr(self.sm, "load_flight_plan", None)
        if callable(fn):
            try:
                return bool(fn(str(path)))
            except Exception:
                return False
        return False

    def close(self) -> None:
        try:
            self.sm.exit()
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# Test source — clearly flagged; only for checking the browser connection works
# ─────────────────────────────────────────────────────────────────────────────
class TestSource:
    name = "TEST"

    def __init__(self, speedup: float = 10.0):
        self.t0 = time.time()
        self.speed = speedup
        self.lat0, self.lon0 = 24.4330, 54.6511  # Abu Dhabi (OMAA) – start of a short circuit

    connected = True

    def snapshot(self) -> dict:
        t = ((time.time() - self.t0) * self.speed) % 1500  # seconds of "flight"; the circuit repeats
        def phase():
            if t < 60: return "parked"
            if t < 240: return "taxi"
            if t < 1200: return "air"
            if t < 1380: return "taxi"
            return "parked"
        ph = phase()
        r = 0.25 * min(1.0, max(0.0, (t - 240) / 960))
        ang = (t - 240) / 960 * 2 * math.pi if ph == "air" else 0
        lat = self.lat0 + (r * math.sin(ang) if ph == "air" else 0.002 * min(t, 240) / 240)
        lon = self.lon0 + (r * (1 - math.cos(ang)) if ph == "air" else 0)
        air_frac = (t - 240) / 960
        alt = 88 + (4000 * math.sin(math.pi * air_frac) if ph == "air" else 0)
        return {
            "lat": lat, "lon": lon, "altFt": alt, "aglFt": alt - 88, "gsKt": 0 if ph == "parked" else 15 if ph == "taxi" else 140,
            "iasKt": 0 if ph != "air" else 130, "hdg": (math.degrees(ang) + 90) % 360, "vsFpm": (4000 * math.pi / 96 * math.cos(math.pi * air_frac) * 0.6) if ph == "air" else 0,
            "onGround": ph != "air", "parkingBrake": ph == "parked", "engines": 0 if (ph == "parked" and t > 1380) or t < 30 else 1,
            "paused": False, "aircraft": "C172", "sim": "TEST",
        }

    def plans_dir(self) -> Path | None:
        return None

    def close(self) -> None:
        pass


# ─────────────────────────────────────────────────────────────────────────────
SAFE_NAME = re.compile(r"^[A-Za-z0-9 _.\-]{1,64}\.(pln|fms)$", re.I)
# Only Flight Log pages may connect: GitHub Pages sites and local development by default.
DEFAULT_ORIGINS = re.compile(r"^(https://[a-z0-9-]+\.github\.io|https?://(localhost|127\.0\.0\.1)(:\d+)?)$", re.I)


def origin_of(ws) -> str:
    req = getattr(ws, "request", None)
    headers = getattr(req, "headers", None) or getattr(ws, "request_headers", None) or {}
    try:
        return headers.get("Origin", "") or ""
    except Exception:
        return ""


def make_source(args):
    if args.test:
        return TestSource(args.test_speed)
    if args.sim in ("msfs", "auto"):
        try:
            src = MsfsSource(args.plans_dir)
            print("Connected to Microsoft Flight Simulator (SimConnect).")
            return src
        except Exception as e:  # SimConnect not available / MSFS not running
            if args.sim == "msfs":
                print(f"Could not connect to MSFS via SimConnect: {e}\nStart MSFS first, and install the SimConnect package (pip install SimConnect).")
                sys.exit(2)
    print(f"Listening for X-Plane on {args.xplane_host}:{args.xplane_port} (UDP). Start X-Plane and load a flight.")
    return XPlaneSource(args.xplane_host, args.xplane_port, xplane_dir=args.xplane_dir)


async def main(args) -> None:
    source = make_source(args)
    clients: set = set()

    def hello():
        return json.dumps({"type": "hello", "bridge": VERSION, "sim": getattr(source, "name", "?"), "test": isinstance(source, TestSource),
                           "canSavePlans": source.plans_dir() is not None, "canNet": True})

    extra = {o.rstrip("/").lower() for o in (args.allow_origin or [])}

    async def handler(ws, path=None):
        origin = origin_of(ws).rstrip("/")
        if not (DEFAULT_ORIGINS.match(origin) or origin.lower() in extra):
            print(f"Refused a connection from {origin or 'an unknown page'} (use --allow-origin to permit it).")
            await ws.close(code=1008, reason="Origin not allowed")
            return
        clients.add(ws)
        try:
            await ws.send(hello())
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                if msg.get("type") == "plan":
                    await ws.send(json.dumps(save_plan(source, msg)))
                elif msg.get("type") == "net":
                    res = await asyncio.to_thread(network_lookup, str(msg.get("network", "")), str(msg.get("cid", "")))
                    res.update({"type": "netResult", "id": msg.get("id")})
                    await ws.send(json.dumps(res))
        finally:
            clients.discard(ws)

    async def broadcast():
        last_status = None
        while True:
            snap = None
            try:
                snap = source.snapshot()
            except Exception as e:  # keep running if the sim disappears
                snap = None
                if last_status != "error":
                    print(f"Sim read error: {e}")
                    last_status = "error"
            if snap:
                snap.update({"type": "telemetry", "t": time.time(), "test": isinstance(source, TestSource)})
                msg = json.dumps(snap)
                if last_status != "ok":
                    print(f"Receiving data from {snap.get('sim')}.")
                    last_status = "ok"
            else:
                msg = json.dumps({"type": "status", "connected": False, "message": f"Bridge running — waiting for {getattr(source, 'name', 'the simulator')}…"})
                if last_status != "waiting":
                    last_status = "waiting"
            if clients:
                await asyncio.gather(*(c.send(msg) for c in list(clients)), return_exceptions=True)
            await asyncio.sleep(1 / args.rate)

    async with websockets.serve(handler, "127.0.0.1", args.port, max_size=2_000_000):
        print(f"Flight Log bridge {VERSION} on ws://127.0.0.1:{args.port} — open Flight Log → Sim Live and press Connect. Ctrl+C to stop.")
        try:
            await broadcast()
        finally:
            source.close()


# ─── VATSIM / IVAO lookup (the website may not be allowed to read these feeds directly) ──
NET_FEEDS = {"vatsim": "https://data.vatsim.net/v3/vatsim-data.json", "ivao": "https://api.ivao.aero/v2/tracker/whazzup"}
_net_cache: dict = {}


def network_lookup(network: str, cid: str) -> dict:
    url = NET_FEEDS.get(network)
    if not url or not re.fullmatch(r"\d{3,9}", cid):
        return {"ok": False, "message": "Unknown network or invalid ID."}
    now = time.time()
    cached = _net_cache.get(network)
    if not cached or now - cached[0] > 15:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": f"FlightLogBridge/{VERSION}", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=12) as r:
                cached = (now, json.loads(r.read().decode("utf-8")))
            _net_cache[network] = cached
        except Exception as e:
            return {"ok": False, "message": f"Could not reach {network.upper()}: {e}"}
    data = cached[1]
    pilots = data.get("pilots") if network == "vatsim" else (data.get("clients") or {}).get("pilots")
    for p in pilots or []:
        pid = p.get("cid") if network == "vatsim" else p.get("userId")
        if str(pid) == cid:
            return {"ok": True, "pilot": p, "fetched": cached[0]}
    return {"ok": True, "pilot": None, "fetched": cached[0]}


def save_plan(source, msg: dict) -> dict:
    name = os.path.basename(str(msg.get("name", "")))
    content = str(msg.get("content", ""))
    if not SAFE_NAME.match(name) or len(content) > 1_000_000:
        return {"type": "planResult", "ok": False, "message": "Rejected: invalid file name or size."}
    folder = source.plans_dir()
    if folder is None:
        return {"type": "planResult", "ok": False, "message": "No flight-plan folder configured. For X-Plane start the bridge with --xplane-dir."}
    try:
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / name
        path.write_text(content, encoding="utf-8")
    except OSError as e:
        return {"type": "planResult", "ok": False, "message": f"Could not write the file: {e}"}
    loaded = isinstance(source, MsfsSource) and name.lower().endswith(".pln") and source.load_plan(path)
    return {"type": "planResult", "ok": True, "path": str(path), "loaded": bool(loaded),
            "message": f"Saved {name}" + (" and loaded it into MSFS." if loaded else f" to {folder}.")}


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Flight Log sim bridge (MSFS 2020/2024, X-Plane 11/12)")
    p.add_argument("--sim", choices=["auto", "msfs", "xplane"], default="auto")
    p.add_argument("--port", type=int, default=DEFAULT_PORT, help="WebSocket port (default 8765)")
    p.add_argument("--rate", type=float, default=4.0, help="updates per second (default 4)")
    p.add_argument("--xplane-host", default="127.0.0.1")
    p.add_argument("--xplane-port", type=int, default=49000)
    p.add_argument("--xplane-dir", default=None, help='X-Plane folder, e.g. "C:/X-Plane 12" (lets Flight Log save .fms plans)')
    p.add_argument("--plans-dir", default=None, help="folder for MSFS .pln files (default: Documents/Flight Log Plans)")
    p.add_argument("--allow-origin", action="append", help="extra website allowed to connect, e.g. https://flightlog.example.com")
    p.add_argument("--test", action="store_true", help="replay a short demo circuit to test the connection")
    p.add_argument("--test-speed", type=float, default=10.0, help=argparse.SUPPRESS)
    try:
        asyncio.run(main(p.parse_args()))
    except KeyboardInterrupt:
        print("\nBridge stopped.")
