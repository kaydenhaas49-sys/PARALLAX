#!/usr/bin/env python3
"""Merge PARALLAX's named desktop MCP tools into OpenJarvis without replacing user tools."""
from __future__ import annotations
import json
import os
import re
import shutil
import sys
import tomllib
from pathlib import Path

TOOL_NAMES = [
    "parallax_list_applications", "parallax_launch_application",
    "parallax_list_windows", "parallax_focus_window",
    "parallax_get_system_status", "parallax_adjust_volume",
    "parallax_open_url", "parallax_search_files",
]

def section_span(lines: list[str], name: str):
    header = f"[{name}]"
    start = next((i for i, line in enumerate(lines) if line.strip() == header), None)
    if start is None:
        return None
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if re.match(r"^\s*\[[^\]]+\]\s*(?:#.*)?$", lines[i]):
            end = i
            break
    return start, end

def assignment_span(lines: list[str], start: int, end: int, key: str):
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*=")
    for i in range(start + 1, end):
        if not pattern.match(lines[i]):
            continue
        first = lines[i].split("=", 1)[1].strip()
        if first.startswith("["):
            depth = first.count("[") - first.count("]")
            j = i
            while depth > 0 and j + 1 < end:
                j += 1
                depth += lines[j].count("[") - lines[j].count("]")
            return i, j
        return i, i
    return None

def replace_key(lines: list[str], table: str, key: str, block: str):
    span = section_span(lines, table)
    if span is None:
        if lines and lines[-1].strip():
            lines.append("")
        lines.extend([f"[{table}]", block])
        return
    start, end = span
    found = assignment_span(lines, start, end, key)
    replacement = block.splitlines()
    if found:
        a, b = found
        lines[a:b + 1] = replacement
    else:
        lines.insert(start + 1, block)

def existing_servers(config: dict, config_dir: Path) -> list[dict]:
    value = config.get("tools", {}).get("mcp", {}).get("servers")
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if not isinstance(value, str):
        raise ValueError("tools.mcp.servers must be a JSON string or path.")
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        server_file = Path(value).expanduser()
        if not server_file.is_absolute():
            server_file = config_dir / server_file
        if not server_file.is_file():
            raise ValueError(f"Configured MCP server file was not found: {server_file}")
        parsed = json.loads(server_file.read_text(encoding="utf-8"))
    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list):
        raise ValueError("Existing MCP servers configuration is not a JSON array.")
    return parsed

def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: merge_openjarvis_config.py CONFIG_TOML DESKTOP_MCP_SCRIPT", file=sys.stderr)
        return 2
    config_path = Path(sys.argv[1]).expanduser().resolve()
    script_path = Path(sys.argv[2]).expanduser().resolve()
    if not config_path.is_file() or not script_path.is_file():
        print("OpenJarvis config or desktop MCP script is missing.", file=sys.stderr)
        return 2
    text = config_path.read_text(encoding="utf-8")
    config = tomllib.loads(text)
    servers = existing_servers(config, config_path.parent)
    servers = [item for item in servers if item.get("name") != "parallax-desktop"]
    servers.append({"name": "parallax-desktop", "command": sys.executable, "args": [str(script_path)]})
    current = config.get("tools", {}).get("enabled", [])
    if not isinstance(current, list):
        raise ValueError("tools.enabled must be an array before desktop tools can be merged.")
    enabled = list(dict.fromkeys([*current, *TOOL_NAMES]))
    lines = text.splitlines()
    enabled_toml = "enabled = [\n" + ",\n".join("  " + json.dumps(name) for name in enabled) + "\n]"
    replace_key(lines, "tools", "enabled", enabled_toml)
    replace_key(lines, "tools.mcp", "enabled", "enabled = true")
    replace_key(lines, "tools.mcp", "servers", "servers = " + json.dumps(json.dumps(servers, separators=(",", ":"))))
    updated = "\n".join(lines).rstrip() + "\n"
    backup = config_path.with_suffix(config_path.suffix + ".before-parallax-desktop")
    if not backup.exists():
        shutil.copy2(config_path, backup)
        os.chmod(backup, 0o600)
    temp = config_path.with_suffix(config_path.suffix + ".tmp")
    temp.write_text(updated, encoding="utf-8")
    os.chmod(temp, 0o600)
    temp.replace(config_path)
    print(f"Enabled {len(TOOL_NAMES)} PARALLAX desktop MCP tools in {config_path}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
