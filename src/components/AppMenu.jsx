import { useState, useEffect, useRef } from "react";

const H_WORLD_APPS = [
  { id: "launcher",  label: "h's world",      sub: "Launcher",           href: "https://alfred-launcher.vercel.app",     color: "#111111" },
  { id: "alfred",    label: "Alfred Agent",    sub: "Problem to Product", href: "https://alfred-agent-nine.vercel.app",   color: "#2255cc" },
  { id: "storybook", label: "h's Storybook",   sub: "Design System",      href: "https://storybook-livid-chi.vercel.app", color: "#5028c8" },
  { id: "lottie",    label: "Lottie Studio",   sub: "Animation",          href: "https://lottie-studio.vercel.app",       color: "#cc7700" },
];

export default function AppMenu({ current }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "28px", height: "28px", borderRadius: "8px", background: open ? "#f0f0f0" : "transparent", border: "1px solid " + (open ? "#cccccc" : "#e5e5e5"), color: open ? "#555555" : "#aaaaaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#cccccc"; e.currentTarget.style.color = "#555555"; }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#aaaaaa"; } }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <rect x="0" y="0" width="5" height="5" rx="1" /><rect x="7" y="0" width="5" height="5" rx="1" />
          <rect x="0" y="7" width="5" height="5" rx="1" /><rect x="7" y="7" width="5" height="5" rx="1" />
        </svg>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, background: "#ffffff", border: "1px solid #e5e5e5", borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "6px", minWidth: "210px", zIndex: 1000 }}>
          {H_WORLD_APPS.map(app => {
            const isCurrent = app.id === current;
            return isCurrent ? (
              <div key={app.id} style={{ padding: "8px 10px", borderRadius: "8px", background: "#f5f5f5", marginBottom: "2px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: app.color, opacity: 0.5 }}>{app.label}</div>
                <div style={{ fontSize: "10px", color: "#bbbbbb" }}>{app.sub} · 현재</div>
              </div>
            ) : (
              <a key={app.id} href={app.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
                style={{ display: "block", padding: "8px 10px", borderRadius: "8px", textDecoration: "none", marginBottom: "2px", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: app.color }}>{app.label}</div>
                <div style={{ fontSize: "10px", color: "#aaaaaa" }}>{app.sub} ↗</div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
