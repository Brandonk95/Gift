import { Link2 } from "lucide-react";

// Gifts linked by "goes with", in either direction, that are still wanted.
export function linkedGifts(item, items) {
  return items.filter((o) => o.id !== item.id && !o.received && (o.id === item.goes_with || o.goes_with === item.id));
}

// Scrolls to a gift's card and flashes it.
export function showGift(id) {
  const el = document.getElementById(`gift-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("flash");
  void el.offsetWidth; // restart the animation
  el.classList.add("flash");
}

// "Goes with Wireless earbuds · still available" under a gift.
// statusOf(gift) gives friends a short note like "still available" (optional).
export default function GoesWith({ item, items, statusOf }) {
  const links = linkedGifts(item, items);
  if (!links.length) return null;
  return (
    <p className="item-goes-with">
      <Link2 size={14} aria-hidden="true" />
      <span>
        Goes with{" "}
        {links.map((o, i) => {
          const note = statusOf?.(o);
          return (
            <span key={o.id}>
              {i > 0 && ", "}
              <button type="button" className="link-btn" onClick={() => showGift(o.id)}>
                {o.name}
              </button>
              {note && <span className={`goes-with-note ${note.kind}`}> · {note.label}</span>}
            </span>
          );
        })}
      </span>
    </p>
  );
}
