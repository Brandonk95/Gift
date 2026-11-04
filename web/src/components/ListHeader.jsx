import { CalendarDays } from "lucide-react";
import { countdown, formatDate, occasion } from "../lib/format.js";
import { listColor } from "../lib/theme.js";
import { coverProps, listCover } from "../lib/themes.js";

export function ListIcon({ list, size = "md" }) {
  const color = listColor(list);
  return (
    <span className={`list-icon list-icon-${size}`} style={color ? { "--list-color": color } : undefined}>
      {list.emoji || occasion(list.occasion).icon}
    </span>
  );
}

export default function ListHeader({ list, eyebrow, meta, actions }) {
  const o = occasion(list.occasion);
  const cd = countdown(list.event_date);
  const color = listColor(list);
  const cover = coverProps(listCover(list), "list-cover");
  return (
    <section className={`list-header ${cover ? "has-cover" : ""}`} style={color ? { "--list-color": color } : undefined}>
      {cover && <div {...cover} aria-hidden="true" />}
      <ListIcon list={list} size="lg" />
      <div className="list-header-body">
        <p className="eyebrow">{eyebrow || o.label}</p>
        <h1>{list.title}</h1>
        <div className="list-header-meta">
          {list.event_date && (
            <span className="meta-item">
              <CalendarDays size={15} /> {formatDate(list.event_date)}
              {cd && cd !== "Past" && <span className="countdown">{cd}</span>}
            </span>
          )}
          {meta}
        </div>
        {list.description && <p className="list-desc">{list.description}</p>}
      </div>
      {actions && <div className="list-header-actions">{actions}</div>}
    </section>
  );
}
