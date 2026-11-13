// A small confetti burst, for happy moments (reserving a gift, chipping in, marking
// it bought). Plain DOM + the Web Animations API: no library, cleans up after itself,
// and does nothing when the person asked their system for less motion.

const COLORS = ["#e0576c", "#f2b33d", "#5bbf8a", "#5b8def", "#a874e8", "#ff8f5c"];

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// from: an element (bursts from its center) or { x, y } in viewport pixels
export function celebrate(from, { count = 36 } = {}) {
  if (typeof document === "undefined" || reducedMotion()) return;
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 3;
  if (from && typeof from.getBoundingClientRect === "function") {
    const r = from.getBoundingClientRect();
    if (r.width || r.height) {
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
  } else if (from && typeof from.x === "number") {
    ({ x, y } = from);
  }

  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);

  let longest = 0;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    if (i % 3 === 0) p.className = "round";
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = COLORS[i % COLORS.length];
    layer.appendChild(p);

    // fly up and out, then fall with a little drift and spin
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 90 + Math.random() * 120;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;
    const fall = 160 + Math.random() * 140;
    const spin = (Math.random() - 0.5) * 900;
    const duration = 900 + Math.random() * 500;
    longest = Math.max(longest, duration);
    p.animate(
      [
        { transform: "translate(-50%, -50%) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${spin / 2}deg) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${dx * 1.3}px), calc(-50% + ${dy + fall}px)) rotate(${spin}deg) scale(0.7)`, opacity: 0 },
      ],
      { duration, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)", fill: "forwards" }
    );
  }
  setTimeout(() => layer.remove(), longest + 100);
}

// bursts from a gift's card (its buttons area if there is one)
export function celebrateGift(itemId) {
  const card = typeof document !== "undefined" && document.getElementById(`gift-${itemId}`);
  celebrate(card ? card.querySelector(".item-actions") || card : null);
}
