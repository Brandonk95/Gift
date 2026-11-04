import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GalleryVerticalEnd, LayoutGrid, List, MoreHorizontal, Search, X } from "lucide-react";
import { VIEWS } from "../lib/theme.js";
import Emoji from "./Emoji.jsx";

// Small dropdown menu. items: [{ label, icon: Component, onClick, danger, hidden, divider }]
// `trigger` replaces the default ⋯ icon (e.g. the account avatar), styled by `buttonClassName`
export function Menu({ items, label = "More actions", icon: Icon = MoreHorizontal, align = "right", className = "", trigger = null, buttonClassName = "icon-btn" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const inside = (t) => ref.current?.contains(t) || popRef.current?.contains(t);
    const onDoc = (e) => !inside(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    // the menu is pinned to where the button was, so close it if the page moves
    const onMove = (e) => !inside(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  // The menu renders at the page level (so cards with overflow: hidden can't cut it off),
  // placed under the button, or above it when there isn't room below.
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const btn = ref.current.getBoundingClientRect();
    const h = popRef.current?.offsetHeight || 0;
    const w = popRef.current?.offsetWidth || 210;
    const gap = 6,
      edge = 8;
    const below = btn.bottom + gap + h <= window.innerHeight - edge || btn.top - gap - h < edge;
    const top = below ? btn.bottom + gap : btn.top - gap - h;
    let left = align === "right" ? btn.right - w : btn.left;
    left = Math.max(edge, Math.min(left, window.innerWidth - w - edge));
    setPos({ top, left });
  }, [open, align]);

  return (
    <div className={`menu ${className}`} ref={ref}>
      <button
        type="button"
        className={buttonClassName}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger || <Icon size={18} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="menu-pop"
            role="menu"
            // hidden for the first frame while it's measured
            style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
          >
            {items
              .filter((i) => !i.hidden)
              .map((i, idx) =>
                i.divider ? (
                  <div key={`d${idx}`} className="menu-divider" />
                ) : (
                  <button
                    key={i.label}
                    type="button"
                    role="menuitem"
                    className={`menu-item ${i.danger ? "danger" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpen(false);
                      i.onClick();
                    }}
                  >
                    {i.icon && <i.icon size={16} />}
                    {i.label}
                  </button>
                ),
              )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function Segmented({ value, onChange, options, size, ariaLabel }) {
  return (
    <div className={`segmented ${size === "sm" ? "segmented-sm" : ""}`} role="radiogroup" aria-label={ariaLabel}>
      {Object.entries(options).map(([k, o]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          className={value === k ? "active" : ""}
          onClick={() => onChange(k)}
          title={o.label}
        >
          {o.icon && <o.icon size={15} />}
          {o.text !== false && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

const VIEW_ICONS = { grid: LayoutGrid, list: List, board: GalleryVerticalEnd };

export function ViewToggle({ value, onChange }) {
  const opts = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, { label: v.label, title: v.hint, icon: VIEW_ICONS[k] }]));
  return <Segmented value={value} onChange={onChange} options={opts} size="sm" ariaLabel="Layout" />;
}

export function SearchInput({ value, onChange, placeholder = "Search gifts…" }) {
  return (
    <div className="search">
      <Search size={16} className="search-icon" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange("")} aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }) {
  return (
    <label className="switch-row">
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        {hint && <span className="muted small">{hint}</span>}
      </span>
      <span className="switch">
        <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" />
      </span>
    </label>
  );
}

export function Swatches({ value, onChange, colors, allowNone }) {
  return (
    <div className="swatches">
      {allowNone && (
        <button type="button" className={`swatch swatch-none ${!value ? "active" : ""}`} onClick={() => onChange("")} title="None" aria-label="No color">
          <X size={14} />
        </button>
      )}
      {Object.entries(colors).map(([k, c]) => {
        const color = typeof c === "string" ? c : c.value;
        const label = typeof c === "string" ? k : c.label;
        return (
          <button
            key={k}
            type="button"
            className={`swatch ${value === k ? "active" : ""}`}
            style={{ "--swatch": color }}
            onClick={() => onChange(k)}
            title={label}
            aria-label={label}
            aria-pressed={value === k}
          />
        );
      })}
    </div>
  );
}

const EMOJIS = ["🎁", "🎄", "🎂", "🎉", "💍", "🍼", "🎓", "💞", "⭐", "❄️", "🎅", "🦌", "🧸", "🎮", "📚", "🎧", "👟", "🌸", "🏡", "✈️", "🐶", "🐱", "☕", "🍰"];

export function EmojiPicker({ value, onChange }) {
  return (
    <div className="emoji-picker">
      {EMOJIS.map((e) => (
        <button key={e} type="button" className={`emoji-opt ${value === e ? "active" : ""}`} onClick={() => onChange(value === e ? "" : e)} aria-label={e} aria-pressed={value === e}>
          <Emoji e={e} />
        </button>
      ))}
      <input
        className="emoji-custom"
        value={EMOJIS.includes(value) ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Other"
        maxLength={8}
        aria-label="Custom emoji"
      />
    </div>
  );
}
