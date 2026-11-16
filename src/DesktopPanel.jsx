import { useEffect, useMemo, useState } from "react";
import {
  Activity, AppWindow, ArrowDown, ArrowUp, HardDrive, RefreshCw,
  Search, Volume2, VolumeX, X,
} from "lucide-react";

async function getJSON(path) {
  const response = await fetch("/api/desktop" + path, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || "Desktop bridge is unavailable.");
  return body;
}

async function postJSON(path, payload) {
  const response = await fetch("/api/desktop" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || "Desktop action failed.");
  return body;
}

export default function DesktopPanel({ onClose }) {
  const [apps, setApps] = useState([]);
  const [windows, setWindows] = useState([]);
  const [system, setSystem] = useState(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [supportedWindows, setSupportedWindows] = useState(true);

  const refresh = async () => {
    setError("");
    try {
      const [appData, windowData, systemData] = await Promise.all([
        getJSON("/apps"), getJSON("/windows"), getJSON("/system"),
      ]);
      setApps(appData.items || []);
      setWindows(windowData.items || []);
      setSupportedWindows(windowData.supported !== false);
      setSystem(systemData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reach the desktop bridge.");
    }
  };

  useEffect(() => { void refresh(); }, []);

  const filteredApps = useMemo(() => {
    const value = search.trim().toLowerCase();
    return (value ? apps.filter((app) => app.name.toLowerCase().includes(value)) : apps).slice(0, 80);
  }, [apps, search]);

  const runAction = async (key, path, payload) => {
    setBusy(key);
    setNotice("");
    setError("");
    try {
      const result = await postJSON(path, payload);
      setNotice(result.message || "Desktop action completed.");
      if (path === "/launch" || path === "/focus") window.setTimeout(() => { void refresh(); }, 900);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Desktop action failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="desktop-overlay" role="dialog" aria-modal="true" aria-label="Desktop controls">
      <section className="desktop-window">
        <header className="desktop-heading">
          <div className="desktop-heading-copy">
            <span className="desktop-kicker">PARALLAX / LOCAL MACHINE</span>
            <strong>DESKTOP CONTROL</strong>
          </div>
          <div className="desktop-heading-actions">
            <button type="button" className="desktop-icon-button" onClick={() => void refresh()} title="Refresh desktop state" aria-label="Refresh desktop state"><RefreshCw size={16} /></button>
            <button type="button" className="desktop-icon-button" onClick={onClose} title="Close desktop controls" aria-label="Close desktop controls"><X size={18} /></button>
          </div>
        </header>

        <div className="desktop-notice-area" aria-live="polite">
          {notice && <p className="desktop-notice">{notice}</p>}
          {error && <p className="desktop-error">{error}</p>}
        </div>

        <div className="desktop-grid">
          <section className="desktop-card desktop-apps">
            <div className="desktop-card-heading">
              <div><AppWindow size={15} /><strong>APPLICATIONS & GAMES</strong></div>
              <span>{apps.length} FOUND</span>
            </div>
            <label className="desktop-search">
              <Search size={14} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an installed app or game..." aria-label="Find an installed app or game" />
            </label>
            <div className="desktop-app-list">
              {filteredApps.length ? filteredApps.map((app) => (
                <button type="button" className="desktop-app-row" key={app.id} disabled={!!busy} onClick={() => void runAction(app.id, "/launch", { name: app.name })}>
                  <span className="desktop-app-name">{app.name}</span>
                  <span className="desktop-app-kind">{app.kind === "steam" ? "STEAM" : app.kind === "heroic" ? "HEROIC" : "APP"}</span>
                </button>
              )) : <p className="desktop-empty">No matching installed applications.</p>}
            </div>
            <p className="desktop-card-foot">Uses existing desktop launchers or detected Steam library games. Nothing is installed.</p>
          </section>

          <div className="desktop-side-column">
            <section className="desktop-card">
              <div className="desktop-card-heading"><div><Activity size={15} /><strong>SYSTEM STATUS</strong></div></div>
              {system ? (
                <div className="desktop-stats">
                  <div><span>PLATFORM</span><strong>{system.platform}</strong></div>
                  <div><span>MEMORY</span><strong>{system.memory_used_percent}% used · {system.memory_available_mb} MB free</strong></div>
                  <div><span>ROOT DISK</span><strong>{system.root_disk_free_gb} GB free / {system.root_disk_total_gb} GB</strong></div>
                  <div><span>CPU</span><strong>{system.cpu_cores} logical cores</strong></div>
                  <div><span>KERNEL</span><strong>{system.kernel}</strong></div>
                </div>
              ) : <p className="desktop-empty">Waiting for system information…</p>}
            </section>

            <section className="desktop-card">
              <div className="desktop-card-heading"><div><Volume2 size={15} /><strong>AUDIO</strong></div></div>
              <div className="desktop-volume-actions">
                <button type="button" onClick={() => void runAction("down", "/volume", { action: "down" })} disabled={!!busy}><ArrowDown size={15} /> DOWN</button>
                <button type="button" onClick={() => void runAction("up", "/volume", { action: "up" })} disabled={!!busy}><ArrowUp size={15} /> UP</button>
                <button type="button" onClick={() => void runAction("mute", "/volume", { action: "mute" })} disabled={!!busy}><VolumeX size={15} /> MUTE</button>
                <button type="button" onClick={() => void runAction("unmute", "/volume", { action: "unmute" })} disabled={!!busy}><Volume2 size={15} /> UNMUTE</button>
              </div>
            </section>
          </div>

          <section className="desktop-card desktop-windows">
            <div className="desktop-card-heading"><div><HardDrive size={15} /><strong>OPEN WINDOWS</strong></div><span>{windows.length} OPEN</span></div>
            {!supportedWindows ? <p className="desktop-empty">Window controls are available in a Hyprland session.</p> : (
              <div className="desktop-window-list">
                {windows.map((item) => (
                  <button type="button" className={"desktop-window-row" + (item.focused ? " focused" : "")} key={item.address} onClick={() => void runAction(item.address, "/focus", { address: item.address })} disabled={!!busy}>
                    <span><strong>{item.title || item.class || "Untitled window"}</strong><small>{item.class} · {item.workspace || "workspace"}</small></span>
                    {item.focused && <em>FOCUSED</em>}
                  </button>
                ))}
                {!windows.length && <p className="desktop-empty">No mapped windows found.</p>}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
