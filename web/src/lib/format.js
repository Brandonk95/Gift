export const OCCASIONS = {
  christmas: { label: "Christmas", icon: "🎄" },
  birthday: { label: "Birthday", icon: "🎂" },
  wedding: { label: "Wedding", icon: "💍" },
  baby: { label: "Baby shower", icon: "🍼" },
  graduation: { label: "Graduation", icon: "🎓" },
  anniversary: { label: "Anniversary", icon: "💞" },
  other: { label: "Other", icon: "🎁" },
};

export const PRIORITIES = {
  high: { label: "Really want", rank: 0 },
  medium: { label: "Would like", rank: 1 },
  low: { label: "Nice to have", rank: 2 },
};

export function occasion(key) {
  return OCCASIONS[key] || OCCASIONS.other;
}

export function formatPrice(value, currency = "USD", { showZero = false } = {}) {
  if (value === null || value === undefined || value === "") return "";
  if (Number(value) === 0 && !showZero) return "";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
}

// PocketBase stores dates as "YYYY-MM-DD HH:MM:SS.sssZ".
export function dateOnly(pbDate) {
  return pbDate ? pbDate.slice(0, 10) : "";
}

export function formatDate(pbDate) {
  if (!pbDate) return "";
  const d = new Date(dateOnly(pbDate) + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function daysUntil(pbDate) {
  if (!pbDate) return null;
  const target = new Date(dateOnly(pbDate) + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// Reservations are held for config.reservationDays unless renewed; gifts marked bought don't expire.
export function holdPeriod(days = 7) {
  return days === 7 ? "a week" : days === 1 ? "a day" : `${days} days`;
}

function expiresAt(r) {
  return r?.expires ? new Date(r.expires.replace(" ", "T")).getTime() : null;
}

export function reservationExpired(r) {
  const t = expiresAt(r);
  return !r.purchased && t !== null && t <= Date.now();
}

// true when the hold ends within 2 days, so the Renew button is worth showing up front
export function holdEndsSoon(r) {
  const t = expiresAt(r);
  return !r.purchased && t !== null && t - Date.now() < 2 * 864e5;
}

// "Held 5 more days", "Held until tomorrow", "Ends in 3 hours"
export function holdLabel(r) {
  const t = expiresAt(r);
  if (r.purchased || t === null) return "";
  const hours = Math.max(0, Math.ceil((t - Date.now()) / 36e5));
  if (hours < 24) return hours <= 1 ? "Ends within the hour" : `Ends in ${hours} hours`;
  const days = Math.round(hours / 24);
  return days <= 1 ? "Held until tomorrow" : `Held ${days} more days`;
}

export function renewReservation(pb, r) {
  return pb.send(`/api/giftlist/reservations/${r.id}/renew`, { method: "POST" });
}

export function countdown(pbDate) {
  const d = daysUntil(pbDate);
  if (d === null) return "";
  if (d === 0) return "Today!";
  if (d === 1) return "Tomorrow";
  if (d > 1) return `${d} days to go`;
  return "Past";
}

export function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// First web address in a piece of text, e.g. what a store app's "Share" button copies:
// "Check out this Sony headset https://amzn.to/3xyz" → "https://amzn.to/3xyz"
export function findUrl(text) {
  const m = /\bhttps?:\/\/[^\s<>"']+/i.exec(text || "") || /(?:^|\s)(www\.[^\s<>"']+\.[^\s<>"']+)/i.exec(text || "");
  if (!m) return "";
  const url = (m[1] || m[0]).replace(/[),.!?]+$/, "");
  return /^https?:/i.test(url) ? url : `https://${url}`;
}
