#!/usr/bin/env python3
"""Allow-listed Linux desktop tools for PARALLAX (stdio MCP + loopback HTTP)."""
from __future__ import annotations

import argparse
import configparser
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode, urlsplit

HOME = Path.home()
DESKTOP_DIRS = [
    HOME / ".local/share/applications",
    HOME / ".local/share/flatpak/exports/share/applications",
    Path("/var/lib/flatpak/exports/share/applications"),
    Path("/usr/local/share/applications"),
    Path("/usr/share/applications"),
]
ALLOWED_ORIGINS = {"http://127.0.0.1:4174", "http://localhost:4174"}
SKIP_DIRS = {".cache", ".local", ".config", ".git", "node_modules", ".venv", "__pycache__", ".thumbnails"}

def normal(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()

def truth(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes"}

def parse_desktop(path: Path, root: Path) -> dict | None:
    parser = configparser.ConfigParser(interpolation=None, strict=False)
    parser.optionxform = str
    try:
        parser.read(path, encoding="utf-8")
        entry = parser["Desktop Entry"]
    except (OSError, KeyError, configparser.Error):
        return None
    if entry.get("Type", "Application") != "Application":
        return None
    if truth(entry.get("Hidden", "false")) or truth(entry.get("NoDisplay", "false")):
        return None
    name, command = entry.get("Name", "").strip(), entry.get("Exec", "").strip()
    if not name or not command:
        return None
    try_exec = entry.get("TryExec", "").strip()
    if try_exec and not (Path(try_exec).is_file() or shutil.which(try_exec)):
        return None
    try:
        relative = path.relative_to(root).as_posix()
    except ValueError:
        relative = path.name
    return {
        "id": f"{root}:{relative}", "name": name, "kind": "desktop",
        "categories": [x for x in entry.get("Categories", "").split(";") if x],
        "_path": str(path), "_exec": command,
    }

def steam_games() -> list[dict]:
    roots = [HOME / ".steam/steam", HOME / ".local/share/Steam",
             HOME / ".var/app/com.valvesoftware.Steam/.local/share/Steam"]
    games, seen = [], set()
    for root in roots:
        if not root.exists():
            continue
        libraries = [root]
        vdf = root / "steamapps/libraryfolders.vdf"
        if vdf.is_file():
            try:
                raw = vdf.read_text(encoding="utf-8", errors="replace")
                for value in re.findall(r'"path"\s*"([^"]+)"', raw):
                    candidate = Path(value.replace("\\\\", "\\"))
                    if candidate not in libraries:
                        libraries.append(candidate)
            except OSError:
                pass
        for library in libraries:
            try:
                manifests = list((library / "steamapps").glob("appmanifest_*.acf"))[:1500]
            except OSError:
                continue
            for manifest in manifests:
                try:
                    raw = manifest.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                app_id = re.search(r'"appid"\s*"(\d+)"', raw)
                name = re.search(r'"name"\s*"([^"]+)"', raw)
                if not app_id or not name or app_id.group(1) in seen:
                    continue
                seen.add(app_id.group(1))
                games.append({"id": "steam:" + app_id.group(1), "name": name.group(1),
                              "kind": "steam", "categories": ["Game", "Steam"], "_appid": app_id.group(1)})
    return games

def heroic_games() -> list[dict]:
    """Read installed Epic game metadata used by Heroic/Legendary; never reads credentials."""
    installed_files = [
        HOME / ".config/legendary/installed.json",
        HOME / ".var/app/com.heroicgameslauncher.hgl/config/legendary/installed.json",
        HOME / ".config/heroic/legendaryConfig/legendary/manifests/installed.json",
        HOME / ".var/app/com.heroicgameslauncher.hgl/config/heroic/legendaryConfig/legendary/manifests/installed.json",
    ]
    games, seen = [], set()
    for installed_file in installed_files:
        if not installed_file.is_file():
            continue
        try:
            data = json.loads(installed_file.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        for app_name, entry in data.items():
            if not isinstance(entry, dict):
                continue
            install_path = entry.get("install_path")
            if not install_path or not Path(str(install_path)).is_dir():
                continue
            epic_app_name = str(entry.get("app_name") or app_name)
            title = str(entry.get("title") or entry.get("app_title") or epic_app_name).strip()
            key = normal(title)
            if not title or not key or key in seen:
                continue
            seen.add(key)
            games.append({
                "id": "heroic:" + epic_app_name,
                "name": title,
                "kind": "heroic",
                "categories": ["Game", "Heroic", "Epic"],
                "_app_name": epic_app_name,
                "_install_path": str(install_path),
            })
    return games

def application_entries() -> list[dict]:
    items, seen = [], set()
    for root in DESKTOP_DIRS:
        if not root.is_dir():
            continue
        count = 0
        for directory, subdirs, filenames in os.walk(root):
            subdirs[:] = [name for name in subdirs if not name.startswith(".")]
            for filename in filenames:
                if not filename.endswith(".desktop"):
                    continue
                count += 1
                if count > 2500:
                    break
                item = parse_desktop(Path(directory) / filename, root)
                if item:
                    key = normal(item["name"])
                    if key and key not in seen:
                        seen.add(key)
                        items.append(item)
            if count > 2500:
                break
    for game in steam_games() + heroic_games():
        key = normal(game["name"])
        if key and key not in seen:
            seen.add(key)
            items.append(game)
    return items

def list_applications() -> dict:
    public = [{"id": x["id"], "name": x["name"], "kind": x["kind"], "categories": x["categories"]}
              for x in application_entries()]
    public.sort(key=lambda x: x["name"].casefold())
    return {"ok": True, "items": public}

def desktop_argv(item: dict) -> list[str]:
    parts = shlex.split(item["_exec"], posix=True)
    argv = []
    for token in parts:
        if token in {"%f", "%F", "%u", "%U", "%i"}:
            continue
        token = token.replace("%%", "\x00")
        token = token.replace("%c", item["name"]).replace("%k", item["_path"])
        token = re.sub(r"%[fFuUdDnNickvm]", "", token).replace("\x00", "%")
        if re.search(r"%[A-Za-z]", token):
            raise ValueError("This launcher uses an unsupported desktop-entry field code.")
        if token:
            argv.append(token)
    if not argv:
        raise ValueError("The desktop launcher has no usable executable.")
    executable = argv[0]
    if Path(executable).name == "env":
        raise ValueError("Environment-wrapper launchers are not supported by the safe launcher.")
    if not ((Path(executable).is_file() and os.access(executable, os.X_OK)) or shutil.which(executable)):
        raise ValueError(f"Required executable is not installed: {executable}")
    return argv

def launch_application(application: str) -> dict:
    query = normal(application)
    if not query or len(query) > 100:
        return {"ok": False, "error": "Enter the name of an installed application."}
    items = application_entries()
    exact = [x for x in items if normal(x["name"]) == query]
    matches = exact or [x for x in items if query in normal(x["name"])]
    if not matches:
        return {"ok": False, "error": f"No installed desktop launcher matched '{application}'. Check that it is installed."}
    if len(matches) > 1:
        return {"ok": False, "error": "More than one application matched. Choose an exact name.",
                "matches": [x["name"] for x in matches[:12]]}
    item = matches[0]
    try:
        if item["kind"] == "steam":
            steam = shutil.which("steam")
            if not steam:
                return {"ok": False, "error": "The Steam game is installed, but the steam launcher is not on PATH."}
            argv = [steam, "steam://rungameid/" + item["_appid"]]
        elif item["kind"] == "heroic":
            opener = shutil.which("xdg-open")
            if not opener:
                return {"ok": False, "error": "xdg-open was not found; cannot send the Heroic game-launch link."}
            launch_uri = "heroic://launch?" + urlencode({"appName": item["_app_name"], "runner": "legendary"})
            argv = [opener, launch_uri]
        else:
            argv = desktop_argv(item)
        process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True)
        return {"ok": True, "message": f"Sent the launch request for {item['name']}.",
                "application": item["name"], "pid": process.pid}
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        return {"ok": False, "error": f"Could not launch {item['name']}: {exc}"}

def list_windows() -> dict:
    hyprctl = shutil.which("hyprctl")
    if not hyprctl or not os.environ.get("HYPRLAND_INSTANCE_SIGNATURE"):
        return {"ok": True, "supported": False,
                "reason": "Window listing is available when PARALLAX runs inside a Hyprland session.", "items": []}
    try:
        result = subprocess.run([hyprctl, "-j", "clients"], capture_output=True, text=True, timeout=3, check=True)
        clients = json.loads(result.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        return {"ok": False, "supported": True, "error": f"Could not query Hyprland: {exc}", "items": []}
    return {"ok": True, "supported": True, "items": [{
        "address": str(x.get("address", "")), "title": str(x.get("title", ""))[:240],
        "class": str(x.get("class", ""))[:120], "workspace": x.get("workspace", {}).get("name", ""),
        "monitor": x.get("monitor"), "focused": bool(x.get("focused", False)),
        "mapped": bool(x.get("mapped", True)),
    } for x in clients]}

def focus_window(address: str) -> dict:
    if not re.fullmatch(r"0x[0-9a-fA-F]+", str(address)):
        return {"ok": False, "error": "Invalid window address."}
    windows = list_windows()
    if not windows.get("supported"):
        return {"ok": False, "error": windows.get("reason", "Hyprland is unavailable.")}
    if not any(x["address"].lower() == address.lower() for x in windows.get("items", [])):
        return {"ok": False, "error": "That window is no longer open. Refresh the window list."}
    try:
        result = subprocess.run([shutil.which("hyprctl"), "dispatch", "focuswindow", "address:" + address],
                                capture_output=True, text=True, timeout=3)
        if result.returncode:
            return {"ok": False, "error": result.stderr.strip() or "Hyprland could not focus the window."}
        return {"ok": True, "message": "Focused the selected window."}
    except (OSError, subprocess.SubprocessError) as exc:
        return {"ok": False, "error": str(exc)}

def adjust_volume(action: str) -> dict:
    if action not in {"up", "down", "mute", "unmute"}:
        return {"ok": False, "error": "Choose up, down, mute, or unmute."}
    wpctl = shutil.which("wpctl")
    if not wpctl:
        return {"ok": False, "error": "wpctl was not found; this needs PipeWire/WirePlumber."}
    args = {"up": ["set-volume", "@DEFAULT_AUDIO_SINK@", "5%+"],
            "down": ["set-volume", "@DEFAULT_AUDIO_SINK@", "5%-"],
            "mute": ["set-mute", "@DEFAULT_AUDIO_SINK@", "1"],
            "unmute": ["set-mute", "@DEFAULT_AUDIO_SINK@", "0"]}[action]
    try:
        result = subprocess.run([wpctl, *args], capture_output=True, text=True, timeout=3)
        if result.returncode:
            return {"ok": False, "error": result.stderr.strip() or "WirePlumber rejected the change."}
        current = subprocess.run([wpctl, "get-volume", "@DEFAULT_AUDIO_SINK@"],
                                 capture_output=True, text=True, timeout=3)
        return {"ok": True, "message": f"Volume action '{action}' completed.", "current": current.stdout.strip()}
    except (OSError, subprocess.SubprocessError) as exc:
        return {"ok": False, "error": str(exc)}

def get_system_status() -> dict:
    memory = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, value = line.split(":", 1)
            memory[key] = int(value.strip().split()[0])
    except (OSError, ValueError):
        pass
    total, available = memory.get("MemTotal", 0), memory.get("MemAvailable", 0)
    try:
        disk = shutil.disk_usage("/")
    except OSError:
        disk = None
    distro = "Linux"
    try:
        release = Path("/etc/os-release").read_text(encoding="utf-8", errors="replace")
        match = re.search(r'^PRETTY_NAME="?(.*?)"?$', release, re.MULTILINE)
        if match:
            distro = match.group(1)
    except OSError:
        pass
    try:
        load = [float(x) for x in Path("/proc/loadavg").read_text().split()[:3]]
    except (OSError, ValueError):
        load = []
    return {"ok": True, "platform": distro, "kernel": os.uname().release,
            "cpu_cores": os.cpu_count() or 0, "memory_total_mb": round(total / 1024),
            "memory_available_mb": round(available / 1024),
            "memory_used_percent": round((1 - available / total) * 100, 1) if total else None,
            "root_disk_total_gb": round(disk.total / (1024**3), 1) if disk else None,
            "root_disk_free_gb": round(disk.free / (1024**3), 1) if disk else None, "load_average": load}

def open_url(url: str) -> dict:
    parsed = urlsplit(str(url).strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        return {"ok": False, "error": "Only ordinary http:// and https:// URLs can be opened."}
    opener = shutil.which("xdg-open")
    if not opener:
        return {"ok": False, "error": "xdg-open was not found."}
    try:
        process = subprocess.Popen([opener, str(url)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True)
        return {"ok": True, "message": "Asked the default browser to open the URL.", "pid": process.pid}
    except OSError as exc:
        return {"ok": False, "error": str(exc)}

def search_files(query: str, scope: str = "home") -> dict:
    query = str(query).strip()
    if not query or len(query) > 120:
        return {"ok": False, "error": "Enter a file or folder name."}
    roots_by_scope = {
        "home": [HOME / "Documents", HOME / "Downloads", HOME / "Desktop", HOME / "Projects"],
        "projects": [HOME / "Projects", HOME / "Documents/Unreal Projects", HOME / "Documents/GitHub"],
        "documents": [HOME / "Documents"], "downloads": [HOME / "Downloads"],
    }
    if scope not in roots_by_scope:
        return {"ok": False, "error": "Scope must be home, projects, documents, or downloads."}
    needle, found, visited = normal(query), [], 0
    started = time.monotonic()
    for root in roots_by_scope[scope]:
        if not root.is_dir():
            continue
        for directory, subdirs, filenames in os.walk(root, followlinks=False):
            subdirs[:] = [x for x in subdirs if not x.startswith(".") and x not in SKIP_DIRS
                          and not (Path(directory) / x).is_symlink()]
            for name in subdirs + filenames:
                visited += 1
                if needle in normal(name):
                    path = Path(directory) / name
                    found.append({"name": name, "path": str(path), "directory": path.is_dir()})
                    if len(found) >= 30:
                        return {"ok": True, "items": found, "visited": visited, "limited": True}
                if visited >= 12000 or time.monotonic() - started >= 2.5:
                    return {"ok": True, "items": found, "visited": visited, "limited": True}
    return {"ok": True, "items": found, "visited": visited, "limited": False}

TOOLS = [
    {"name": "parallax_list_applications", "description": "List installed desktop applications, Steam games, and Heroic-managed Epic games. Read-only; use this before ambiguous app launches.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}, "annotations": {"readOnlyHint": True}},
    {"name": "parallax_launch_application", "description": "Launch one already-installed desktop application, Steam game, or Heroic-managed Epic game by name. Does not install anything. Ask the user to choose if multiple matches exist.", "inputSchema": {"type": "object", "properties": {"application": {"type": "string", "maxLength": 100}}, "required": ["application"], "additionalProperties": False}},
    {"name": "parallax_list_windows", "description": "List open Hyprland windows with title, class, workspace and opaque address. Read-only.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}, "annotations": {"readOnlyHint": True}},
    {"name": "parallax_focus_window", "description": "Focus an open Hyprland window. Address must come from parallax_list_windows.", "inputSchema": {"type": "object", "properties": {"address": {"type": "string"}}, "required": ["address"], "additionalProperties": False}},
    {"name": "parallax_get_system_status", "description": "Read local Linux distro, kernel, CPU core count, memory use, root disk free space and load average. Read-only.", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}, "annotations": {"readOnlyHint": True}},
    {"name": "parallax_adjust_volume", "description": "Adjust default PipeWire output volume in 5 percent steps or mute/unmute. Use only for a direct user request.", "inputSchema": {"type": "object", "properties": {"action": {"type": "string", "enum": ["up", "down", "mute", "unmute"]}}, "required": ["action"], "additionalProperties": False}},
    {"name": "parallax_open_url", "description": "Open an explicitly user-requested HTTP or HTTPS URL in the default browser. Never invent a destination.", "inputSchema": {"type": "object", "properties": {"url": {"type": "string", "maxLength": 2048}}, "required": ["url"], "additionalProperties": False}},
    {"name": "parallax_search_files", "description": "Search file and folder names only (not file contents) in Documents, Downloads, Desktop and Projects. Supports home, projects, documents and downloads scopes.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string", "maxLength": 120}, "scope": {"type": "string", "enum": ["home", "projects", "documents", "downloads"]}}, "required": ["query"], "additionalProperties": False}, "annotations": {"readOnlyHint": True}},
]

def call_tool(name: str, arguments: dict | None = None) -> dict:
    arguments = arguments or {}
    handlers = {
        "parallax_list_applications": lambda: list_applications(),
        "parallax_launch_application": lambda: launch_application(str(arguments.get("application", ""))),
        "parallax_list_windows": lambda: list_windows(),
        "parallax_focus_window": lambda: focus_window(str(arguments.get("address", ""))),
        "parallax_get_system_status": lambda: get_system_status(),
        "parallax_adjust_volume": lambda: adjust_volume(str(arguments.get("action", ""))),
        "parallax_open_url": lambda: open_url(str(arguments.get("url", ""))),
        "parallax_search_files": lambda: search_files(str(arguments.get("query", "")), str(arguments.get("scope", "home"))),
    }
    if name not in handlers:
        return {"ok": False, "error": "Unknown desktop tool."}
    return handlers[name]()

def run_stdio() -> None:
    def respond(request_id, result):
        sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result}, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    for line in sys.stdin:
        try:
            message = json.loads(line)
            method, request_id = message.get("method"), message.get("id")
            if request_id is None:
                continue
            if method == "initialize":
                respond(request_id, {"protocolVersion": "2025-11-25",
                         "capabilities": {"tools": {"listChanged": False}},
                         "serverInfo": {"name": "parallax-desktop", "version": "0.1.0"}})
            elif method == "tools/list":
                respond(request_id, {"tools": TOOLS})
            elif method == "tools/call":
                params = message.get("params", {})
                result = call_tool(str(params.get("name", "")), params.get("arguments", {}))
                respond(request_id, {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}],
                                     "isError": not result.get("ok", False)})
            elif method == "ping":
                respond(request_id, {})
            else:
                sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": request_id,
                                  "error": {"code": -32601, "message": "Unsupported method"}}) + "\n")
                sys.stdout.flush()
        except Exception as exc:
            print(f"PARALLAX MCP error: {exc}", file=sys.stderr, flush=True)

class HTTPHandler(BaseHTTPRequestHandler):
    server_version = "PARALLAX-Desktop/0.1"
    def log_message(self, fmt, *args):
        print("PARALLAX desktop bridge: " + (fmt % args), file=sys.stderr, flush=True)
    def send_json(self, status: int, payload: dict):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        route = urlsplit(self.path).path
        if route == "/health": result = {"ok": True, "service": "parallax-desktop"}
        elif route == "/apps": result = list_applications()
        elif route == "/windows": result = list_windows()
        elif route == "/system": result = get_system_status()
        else:
            self.send_json(404, {"ok": False, "error": "Not found"})
            return
        self.send_json(200, result)
    def do_POST(self):
        route = urlsplit(self.path).path
        if self.headers.get("Origin") not in ALLOWED_ORIGINS or self.headers.get("Sec-Fetch-Site") == "cross-site":
            self.send_json(403, {"ok": False, "error": "Request origin is not allowed."})
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json(415, {"ok": False, "error": "Use application/json."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 16384:
                raise ValueError("Invalid request size.")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("JSON body must be an object.")
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})
            return
        routes = {
            "/launch": lambda: launch_application(str(payload.get("name", ""))),
            "/focus": lambda: focus_window(str(payload.get("address", ""))),
            "/volume": lambda: adjust_volume(str(payload.get("action", ""))),
            "/open-url": lambda: open_url(str(payload.get("url", ""))),
            "/search-files": lambda: search_files(str(payload.get("query", "")), str(payload.get("scope", "home"))),
        }
        if route not in routes:
            self.send_json(404, {"ok": False, "error": "Not found"})
            return
        result = routes[route]()
        self.send_json(200 if result.get("ok") else 400, result)

def run_http(host: str, port: int):
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("The PARALLAX desktop bridge must bind to loopback only.")
    server = ThreadingHTTPServer((host, port), HTTPHandler)
    print(f"PARALLAX desktop bridge listening on http://{host}:{port}", file=sys.stderr, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PARALLAX desktop tools")
    parser.add_argument("--http", action="store_true", help="Run loopback HTTP instead of stdio MCP.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8130)
    args = parser.parse_args()
    if args.http: run_http(args.host, args.port)
    else: run_stdio()
