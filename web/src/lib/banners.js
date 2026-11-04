// Banner art for list themes: pieces scattered at random (seeded, so a list always
// gets the same picture) over one wide image, so there's no visible repeating tile.
// Drawn for a 1600×200 frame (8:1); it's cropped to fit, never repeated.

// small, fast, seeded random numbers (mulberry32)
function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;

// Spots spread evenly but unevenly: one per grid cell, jittered inside it
function spots(r, w, h, cell) {
  const out = [];
  for (let y = -cell / 2; y < h + cell / 2; y += cell)
    for (let x = -cell / 2; x < w + cell / 2; x += cell) out.push([x + r() * cell, y + r() * cell]);
  return out;
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const between = (r, a, b) => a + r() * (b - a);

const HEART = "M0 -3c-2.6-5.2-10.4-3.5-9.6 2.6.9 4.3 9.6 9.6 9.6 9.6s8.7-5.3 9.6-9.6C10.4-6.5 2.6-8.2 0-3z";
const LEAF = "M-14 8C-14-8 2-16 14-16c0 13-12 24-28 24zM-14 8L14-16";
const SPARK = "M0-9l2 7 7 2-7 2-2 7-2-7-7-2 7-2z";

export const BANNERS = {
  snow: {
    stops: ["#1e3a8a", "#2563eb", "#93c5fd"],
    angle: 160,
    draw: (r, w, h) =>
      spots(r, w, h, 26)
        .map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(between(r, 1, 3.6))}" fill="#fff" fill-opacity="${f(between(r, 0.4, 0.95))}"/>`)
        .join(""),
  },
  confetti: {
    stops: ["#fff7ed", "#fde68a", "#fbcfe8"],
    angle: 135,
    draw: (r, w, h) => {
      const colors = ["#f43f5e", "#f59e0b", "#10b981", "#6366f1", "#ec4899", "#0ea5e9"];
      return spots(r, w, h, 34)
        .map(([x, y]) => {
          const c = pick(r, colors);
          if (r() < 0.35) return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(between(r, 1.8, 3.2))}" fill="${c}"/>`;
          const len = between(r, 7, 13);
          return `<rect x="${f(x - len / 2)}" y="${f(y - 2)}" width="${f(len)}" height="4" rx="2" fill="${c}" transform="rotate(${Math.round(between(r, -80, 80))} ${f(x)} ${f(y)})"/>`;
        })
        .join("");
    },
  },
  baby: {
    stops: ["#bae6fd", "#fbcfe8", "#fef3c7"],
    angle: 120,
    draw: (r, w, h) => {
      const clouds = spots(r, w, h, 120).map(([x, y]) => {
        const s = between(r, 0.6, 1.3);
        return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})" fill="#fff" fill-opacity="${f(between(r, 0.55, 0.85))}"><ellipse rx="26" ry="11"/><ellipse cx="-8" cy="-7" rx="13" ry="10"/><ellipse cx="9" cy="-9" rx="11" ry="9"/></g>`;
      });
      const dots = spots(r, w, h, 38).map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(between(r, 1, 2.2))}" fill="#fff" fill-opacity=".8"/>`);
      return clouds.join("") + dots.join("");
    },
  },
  hearts: {
    stops: ["#e11d48", "#fb7185", "#fbcfe8"],
    angle: 135,
    draw: (r, w, h) =>
      spots(r, w, h, 44)
        .map(
          ([x, y]) =>
            `<path d="${HEART}" fill="#fff" fill-opacity="${f(between(r, 0.16, 0.42))}" transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(between(r, -25, 25))}) scale(${f(between(r, 0.5, 1.3))})"/>`
        )
        .join(""),
  },
  garden: {
    stops: ["#14532d", "#16a34a", "#bbf7d0"],
    angle: 150,
    draw: (r, w, h) =>
      spots(r, w, h, 46)
        .map(
          ([x, y]) =>
            `<path d="${LEAF}" fill="#fff" fill-opacity="${f(between(r, 0.12, 0.26))}" stroke="#fff" stroke-opacity=".3" stroke-width="1.2" transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(between(r, 0, 360))}) scale(${f(between(r, 0.5, 1.1))})"/>`
        )
        .join(""),
  },
  stars: {
    stops: ["#0f172a", "#312e81", "#6d28d9"],
    angle: 160,
    draw: (r, w, h) => {
      const big = spots(r, w, h, 70).map(
        ([x, y]) => `<path d="${SPARK}" fill="${r() < 0.6 ? "#fde68a" : "#fff"}" fill-opacity="${f(between(r, 0.7, 1))}" transform="translate(${f(x)} ${f(y)}) scale(${f(between(r, 0.45, 1.15))})"/>`
      );
      const dots = spots(r, w, h, 24).map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(between(r, 0.6, 1.5))}" fill="#fff" fill-opacity="${f(between(r, 0.4, 0.9))}"/>`);
      return dots.join("") + big.join("");
    },
  },
};

const cache = new Map();

// The banner as an SVG document. `w`×`h` is the drawing's frame.
export function bannerSvg(theme, seed = theme, w = 1600, h = 200) {
  const b = BANNERS[theme];
  if (!b) return "";
  const r = rng(`${theme}:${seed}`);
  const a = (b.angle - 90) * (Math.PI / 180);
  const [x1, y1, x2, y2] = [0.5 - Math.cos(a) / 2, 0.5 - Math.sin(a) / 2, 0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2].map((n) => f(n * 100));
  const stops = b.stops.map((c, i) => `<stop offset="${Math.round((i / (b.stops.length - 1)) * 100)}%" stop-color="${c}"/>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>${b.draw(r, w, h)}</svg>`
  );
}

// CSS background-image value, cached per theme and seed
export function bannerImage(theme, seed) {
  const key = `${theme}:${seed}`;
  if (!cache.has(key)) cache.set(key, `url("data:image/svg+xml,${encodeURIComponent(bannerSvg(theme, seed))}")`);
  return cache.get(key);
}
