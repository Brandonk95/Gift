// Appearance preferences. Stored on the user record (users.prefs) so they follow
// you across devices, and cached in localStorage for instant first paint.

export const ACCENTS = {
  cranberry: { label: "Cranberry", value: "#c8364f" },
  indigo: { label: "Indigo", value: "#4f46e5" },
  blue: { label: "Blue", value: "#2563eb" },
  teal: { label: "Teal", value: "#0d9488" },
  green: { label: "Green", value: "#16a34a" },
  amber: { label: "Amber", value: "#d97706" },
  orange: { label: "Orange", value: "#ea580c" },
  rose: { label: "Rose", value: "#e11d48" },
  pink: { label: "Pink", value: "#db2777" },
  violet: { label: "Violet", value: "#7c3aed" },
  slate: { label: "Graphite", value: "#3f3f46" },
};

export const FONTS = {
  inter: { label: "Modern", stack: '"Inter Variable", system-ui, sans-serif' },
  nunito: { label: "Friendly", stack: '"Nunito Variable", system-ui, sans-serif' },
  fraunces: { label: "Classic", stack: '"Fraunces Variable", Georgia, serif' },
  system: { label: "System", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
};

export const RADII = {
  sharp: { label: "Sharp", value: "6px" },
  soft: { label: "Soft", value: "14px" },
  round: { label: "Round", value: "22px" },
};

export const MODES = {
  system: { label: "System" },
  light: { label: "Light" },
  dark: { label: "Dark" },
};

export const VIEWS = {
  grid: { label: "Cards" },
  compact: { label: "Compact" },
  list: { label: "List" },
  board: { label: "Board" },
};

// Per-list color tags (lists.color)
export const LIST_COLORS = {
  slate: "#64748b",
  red: "#dc2626",
  orange: "#ea580c",
  amber: "#d97706",
  green: "#16a34a",
  teal: "#0d9488",
  blue: "#2563eb",
  indigo: "#4f46e5",
  violet: "#7c3aed",
  pink: "#db2777",
};

export const DEFAULT_PREFS = { mode: "system", accent: "cranberry", font: "inter", radius: "soft", view: "grid" };

const KEY = "giftlist.prefs";

export function normalizePrefs(p) {
  const out = { ...DEFAULT_PREFS, ...(p && typeof p === "object" ? p : {}) };
  if (!ACCENTS[out.accent]) out.accent = DEFAULT_PREFS.accent;
  if (!FONTS[out.font]) out.font = DEFAULT_PREFS.font;
  if (!RADII[out.radius]) out.radius = DEFAULT_PREFS.radius;
  if (!MODES[out.mode]) out.mode = DEFAULT_PREFS.mode;
  if (!VIEWS[out.view]) out.view = DEFAULT_PREFS.view;
  return out;
}

export function loadLocalPrefs() {
  try {
    return normalizePrefs(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveLocalPrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}

export function applyPrefs(prefs) {
  const p = normalizePrefs(prefs);
  const root = document.documentElement;
  root.style.setProperty("--accent", ACCENTS[p.accent].value);
  root.style.setProperty("--font", FONTS[p.font].stack);
  root.style.setProperty("--radius", RADII[p.radius].value);
  if (p.mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", p.mode);
  root.dataset.font = p.font;
  syncBarColor(p.mode);
}

// The phone's status bar (and the installed app's bars) use the page background.
// index.html has a light and a dark color picked by the system setting; choosing
// Light or Dark in the app overrides both.
const BAR = { light: "#f8f4ee", dark: "#151210" };
function syncBarColor(mode) {
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = /dark/.test(m.media) ? "dark" : "light";
    m.content = BAR[mode === "light" || mode === "dark" ? mode : scheme];
  }
}

export function listColor(list) {
  return LIST_COLORS[list?.color] || null;
}
