// 0x Gofer-style app shell for the SDM Trade Studio.
// Provides: left sidebar with nav + theme toggle + workspace chip,
// main content area with rise-in animation, and base primitives (Card, Pill, Ic)
// that read the CSS-variable token layer defined in index.css.
//
// Spec source: 0x Gofer CRM handoff (handoff/00-README.md, 01-design-tokens.md,
// 02-components.md). Components are 1:1 with the reference except routes are
// adapted to the trade studio's actual phases.

import { useEffect, useState, useCallback } from "react";

// ── Icon paths (24-grid, fill=none, stroke=currentColor, width=1.8) ─────────
export const GF_ICONS = {
  home:     "M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9",
  chart:    "M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6",        // trade builder
  brief:    "M5 5h14v15H5zM5 9h14M9 13h6M9 17h4",              // market brief
  lending:  "M4 7h16v10H4zM4 11h16M8 15h3",                    // lending
  library:  "M4 4h16v16H4zM4 9h16M9 4v16",                     // sales library
  pricer:   "M9 4v16M15 4v16M4 9h16M4 15h16",                  // options pricer
  sun:      "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
  moon:     "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  arrow:    "M5 12h14M13 6l6 6-6 6",
  check:    "M5 12l5 5 9-11",
  x:        "M6 6l12 12M18 6 6 18",
  chev:     "M9 6l6 6-6 6",
  search:   "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14ZM21 21l-4-4",
};

// ── Inline-SVG icon component (s = px, c = stroke color, w = stroke width) ──
export function Ic({ d, s = 20, c = "currentColor", w = 1.8, style }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
         strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
         style={style}>
      <path d={d} />
    </svg>
  );
}

// ── Theme hook — persists to localStorage and toggles <html data-theme> ────
export function useGoferTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem("gfc_theme") || "light";
  });

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("gf-shell-active");
    html.setAttribute("data-theme", theme);
    // Brief 'theming' window so colors crossfade smoothly during switch
    html.classList.add("theming");
    const t = setTimeout(() => html.classList.remove("theming"), 440);
    try { localStorage.setItem("gfc_theme", theme); } catch (_) {}
    return () => clearTimeout(t);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(t => (t === "light" ? "dark" : "light"));
  }, []);

  return [theme, toggle];
}

// ── Card primitive — soft 28px-radius surface with optional hover lift ─────
export function GfCard({ pad = 24, hover = false, delay = 0, style, children, onClick, className = "" }) {
  const [lifted, setLifted] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={hover ? () => setLifted(true) : undefined}
      onMouseLeave={hover ? () => setLifted(false) : undefined}
      className={`gf-rise ${className}`}
      style={{
        background: "var(--gf-card)",
        borderRadius: 28,
        border: "1px solid var(--gf-line)",
        boxShadow: lifted ? "var(--gf-shadow-lg)" : "var(--gf-shadow)",
        padding: pad,
        position: "relative",
        overflow: "hidden",
        cursor: onClick ? "pointer" : undefined,
        transform: lifted ? "translateY(-4px)" : "none",
        transition: "transform .3s var(--gf-ease), box-shadow .3s var(--gf-ease)",
        animationDelay: `${delay}ms`,
        color: "var(--gf-fg)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Pill button — primary | soft | ghost | card ────────────────────────────
export function GfPill({ kind = "soft", icon, iconRight, onClick, children, style, disabled }) {
  const styles = {
    primary: { background: "var(--gf-accent)", color: "var(--gf-ink)", boxShadow: "var(--gf-shadow)" },
    soft:    { background: "var(--gf-card-2)", color: "var(--gf-fg)" },
    ghost:   { background: "transparent", color: "var(--gf-fg)" },
    card:    { background: "var(--gf-card)", color: "var(--gf-fg)", boxShadow: "var(--gf-shadow)", border: "1px solid var(--gf-line)" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "9px 16px", borderRadius: 999,
        fontFamily: "var(--gf-font)", fontSize: 13.5, fontWeight: 600,
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "transform .15s var(--gf-ease), background .2s var(--gf-ease)",
        ...styles[kind],
        ...style,
      }}
    >
      {icon && <Ic d={icon} s={16} />}
      {children}
      {iconRight && <Ic d={iconRight} s={16} />}
    </button>
  );
}

// ── Sidebar nav item ───────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 13,
        padding: "11px 14px", borderRadius: 14,
        background: active ? "var(--gf-card)" : "transparent",
        boxShadow: active ? "var(--gf-shadow)" : "none",
        color: active ? "var(--gf-fg)" : "var(--gf-fg2)",
        fontFamily: "var(--gf-font)", fontSize: 14.5,
        fontWeight: active ? 600 : 500,
        border: "none", cursor: "pointer", width: "100%",
        textAlign: "left",
        transition: "background .2s var(--gf-ease), color .2s var(--gf-ease), box-shadow .2s var(--gf-ease)",
      }}
    >
      <Ic d={icon} s={18} c={active ? "var(--gf-accent-deep)" : "currentColor"} />
      <span>{label}</span>
    </button>
  );
}

// ── Theme toggle button (sidebar footer) ───────────────────────────────────
function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 14,
        background: "transparent", color: "var(--gf-fg2)",
        fontFamily: "var(--gf-font)", fontSize: 13.5, fontWeight: 500,
        border: "none", cursor: "pointer", width: "100%", textAlign: "left",
      }}
      aria-label={theme === "light" ? "Switch to dark" : "Switch to light"}
    >
      <Ic d={theme === "light" ? GF_ICONS.moon : GF_ICONS.sun} s={16} />
      <span>{theme === "light" ? "Dark" : "Light"}</span>
    </button>
  );
}

// ── Workspace chip (sidebar footer) ────────────────────────────────────────
function WorkspaceChip({ logoSrc }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "var(--gf-card)", borderRadius: 12,
      padding: "8px 12px", boxShadow: "var(--gf-shadow)",
      border: "1px solid var(--gf-line)",
    }}>
      {logoSrc && <img src={logoSrc} alt="" style={{ height: 20, width: "auto" }} />}
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <span style={{ fontFamily: "var(--gf-font)", fontSize: 12.5, fontWeight: 600, color: "var(--gf-fg)" }}>SDM Sales</span>
        <span style={{ fontFamily: "var(--gf-font)", fontSize: 11, color: "var(--gf-fg3)" }}>Shared workspace</span>
      </div>
    </div>
  );
}

// ── Sidebar — pure presentational; parent passes routes + active key ───────
export function GoferSidebar({ items, activeKey, onNavigate, theme, onToggleTheme, brand = "SDM Studio", logoSrc }) {
  return (
    <aside style={{
      width: 232, flexShrink: 0,
      position: "sticky", top: 0, height: "100vh",
      padding: "26px 16px",
      display: "flex", flexDirection: "column", gap: 26,
      background: "var(--gf-bg)",
      color: "var(--gf-fg)",
      borderRight: "1px solid var(--gf-line)",
    }}>
      {/* Brand row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 10px" }}>
        {logoSrc && <img src={logoSrc} alt="" style={{ height: 26, width: "auto" }} />}
        <span style={{
          fontFamily: "var(--gf-font)", fontSize: 17, fontWeight: 700,
          letterSpacing: "-0.01em", color: "var(--gf-fg)",
        }}>{brand}</span>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map(item => (
          <NavItem
            key={item.key}
            icon={item.icon}
            label={item.label}
            active={activeKey === item.key}
            onClick={() => onNavigate(item.key)}
          />
        ))}
      </nav>

      {/* Bottom block — theme toggle + workspace chip */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <WorkspaceChip logoSrc={logoSrc} />
      </div>
    </aside>
  );
}

// ── Full app shell — sidebar + main column ─────────────────────────────────
// Wraps the existing app's render output. The `routeKey` is whatever key your
// caller uses to identify the current page — when it changes, the main column
// replays its rise-in animation.
export function GoferShell({ sidebarItems, activeKey, onNavigate, brand, logoSrc, routeKey, children }) {
  const [theme, toggleTheme] = useGoferTheme();
  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: "var(--gf-bg)",
      color: "var(--gf-fg)",
      fontFamily: "var(--gf-font)",
    }}>
      <GoferSidebar
        items={sidebarItems}
        activeKey={activeKey}
        onNavigate={onNavigate}
        theme={theme}
        onToggleTheme={toggleTheme}
        brand={brand}
        logoSrc={logoSrc}
      />
      <main style={{
        flex: 1, minWidth: 0,
        padding: "40px 48px 64px",
        maxWidth: 1320,
        position: "relative",
      }}>
        <div key={routeKey} className="gf-rise">
          {children}
        </div>
      </main>
    </div>
  );
}
