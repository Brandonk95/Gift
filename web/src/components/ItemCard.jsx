import { useState } from "react";
import { Check, ExternalLink, GripVertical, Star } from "lucide-react";
import Emoji from "./Emoji.jsx";
import { itemImage } from "../lib/pb.js";
import { PRIORITIES, formatPrice, hostname } from "../lib/format.js";

// One gift. `view` is grid | list | board. Drag props are passed when reordering is on.
// status: { kind: "mine" | "taken" | "group", label }
export default function ItemCard({ item, category, currency, status, hidePrice, view = "grid", onToggleStar, dragProps, badge, children }) {
  // board shows whole pictures at their own shape; cards crop to the same 4:3 frame
  const src = itemImage(item, view === "board" ? "600x0" : view === "grid" ? "400x400f" : "100x100f");
  const [broken, setBroken] = useState(""); // a picture that failed to load shows the placeholder instead
  const img = src && src !== broken ? src : "";
  const price = hidePrice ? "" : formatPrice(item.price, currency);
  const high = item.priority === "high";
  const details = [item.size && `Size ${item.size}`, item.color, item.quantity > 1 && `× ${item.quantity}`].filter(Boolean);
  const host = item.url ? hostname(item.url) : "";

  return (
    <article
      className={`item item-${view === "board" ? "grid item-board" : view} ${status ? `is-${status.kind}` : ""} ${item.received ? "is-received" : ""} ${dragProps ? "is-draggable" : ""}`}
      {...(dragProps || {})}
    >
      <div className="item-media">
        {dragProps && (
          <span className="drag-handle" title="Drag to reorder">
            <GripVertical size={16} />
          </span>
        )}
        {img ? (
          <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(src)} />
        ) : (
          <div className="item-placeholder">
            <Emoji e={category?.icon || "🎁"} />
          </div>
        )}
        {status && (
          <span className={`status-pill status-${status.kind}`}>
            {status.kind === "mine" && <Check size={13} strokeWidth={3} />}
            {status.label}
          </span>
        )}
        {item.received && <span className="status-pill status-received">Received</span>}
      </div>

      <div className="item-body">
        <div className="item-head">
          <h3 className="item-name">{item.name}</h3>
          {onToggleStar && (
            <button
              type="button"
              className={`star-btn ${high ? "on" : ""}`}
              onClick={onToggleStar}
              title={high ? "Most wanted (click to unmark)" : "Mark as most wanted"}
              aria-label={high ? "Most wanted. Click to unmark" : "Mark as most wanted"}
              aria-pressed={high}
            >
              <Star size={17} fill={high ? "currentColor" : "none"} />
            </button>
          )}
        </div>

        <div className="item-meta">
          {price &&
            (item.current_price > 0 && item.current_price < item.price ? (
              <span className="item-price" title="The store's price when we last checked">
                <s className="muted">{price}</s> <span className="price-drop">{formatPrice(item.current_price, currency)}</span>
              </span>
            ) : (
              <span className="item-price">{price}</span>
            ))}
          {high && !onToggleStar && (
            <span className="chip-static most-wanted">
              <Star size={12} fill="currentColor" /> Most wanted
            </span>
          )}
          {badge}
          {category && (
            <span className="chip-static">
              <Emoji e={category.icon} /> {category.name}
            </span>
          )}
          {item.priority === "low" && <span className="chip-static subtle">{PRIORITIES.low.label}</span>}
          {details.map((d) => (
            <span key={d} className="chip-static subtle">
              {d}
            </span>
          ))}
        </div>

        {item.description && <p className="item-desc">{item.description}</p>}

        <div className="item-foot">
          {item.url ? (
            <a className="item-link" href={item.url} target="_blank" rel="noopener noreferrer nofollow" title={`Open on ${host || "the store's site"}`} aria-label={`Open on ${host || "the store's site"}`}>
              <ExternalLink size={14} /> <span className="item-link-text">{host || "View"}</span>
            </a>
          ) : (
            <span />
          )}
          {children && <div className="item-actions">{children}</div>}
        </div>
      </div>
    </article>
  );
}
