import { useLayoutEffect, useRef } from "react";

const ROW = 4; // px: the board's grid row height (matches .items-board grid-auto-rows)

// The container for gift cards. In the board layout each card spans as many small
// grid rows as its height needs, so cards of different heights pack together while
// still reading left to right in the list's order.
export default function ItemsGrid({ view, children }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (view !== "board") {
      for (const c of el.children) c.style.gridRowEnd = "";
      return;
    }
    const gap = () => parseFloat(getComputedStyle(el).rowGap) || 0;
    const layout = () => {
      const g = gap();
      for (const c of el.children) {
        const h = c.getBoundingClientRect().height;
        c.style.gridRowEnd = `span ${Math.max(1, Math.ceil((h + g) / (ROW + g)))}`;
      }
    };
    layout();
    // re-pack when the width changes or a picture finishes loading
    const ro = new ResizeObserver(layout);
    for (const c of el.children) ro.observe(c);
    el.addEventListener("load", layout, true);
    return () => {
      ro.disconnect();
      el.removeEventListener("load", layout, true);
    };
  });

  return (
    <div ref={ref} className={`items items-${view}`}>
      {children}
    </div>
  );
}
