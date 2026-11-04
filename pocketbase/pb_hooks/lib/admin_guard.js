// Counters for admin_guard.pb.js, kept in the app's shared in-memory store
// (hook handlers run in separate JS engines, so plain variables aren't shared).

const MIN = 60 * 1000;
const WINDOW = 15 * MIN; // misses older than this are forgotten
const PER_IP = 5; // misses from one address before it's locked out
const FIRST_LOCK = 15 * MIN; // doubles with each lockout after the first
const MAX_LOCK = 24 * 60 * MIN;
const GLOBAL = 30; // misses from all addresses together before everyone pauses
const GLOBAL_LOCK = 15 * MIN;

const IP_KEY = "giftlist_admin_guard_ip:";
const ALL_KEY = "giftlist_admin_guard_all";

function read(app, key) {
  const raw = app.store().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function write(app, key, value) {
  app.store().set(key, JSON.stringify(value));
}

// milliseconds this address (or everyone) still has to wait, 0 if none
function lockedFor(app, ip, now) {
  const s = read(app, IP_KEY + ip);
  const all = read(app, ALL_KEY);
  const until = Math.max((s && s.until) || 0, (all && all.until) || 0);
  return until > now ? until - now : 0;
}

function recordMiss(app, ip, now, identity) {
  const s = read(app, IP_KEY + ip) || { misses: [], locks: 0, until: 0 };
  s.misses = s.misses.filter((t) => now - t < WINDOW);
  s.misses.push(now);
  if (s.misses.length >= PER_IP) {
    s.locks += 1;
    const lock = Math.min(MAX_LOCK, FIRST_LOCK * Math.pow(2, s.locks - 1));
    s.until = now + lock;
    s.misses = [];
    console.log(`[giftlist] admin sign-in locked for ${ip} (${humanWait(lock)}) after ${PER_IP} wrong passwords, last tried "${String(identity || "").slice(0, 80)}"`);
  }
  write(app, IP_KEY + ip, s);

  const all = read(app, ALL_KEY) || { misses: [], until: 0 };
  all.misses = all.misses.filter((t) => now - t < WINDOW);
  all.misses.push(now);
  if (all.misses.length >= GLOBAL && !(all.until > now)) {
    all.until = now + GLOBAL_LOCK;
    all.misses = [];
    console.log(`[giftlist] admin sign-in paused for everyone for ${humanWait(GLOBAL_LOCK)}: ${GLOBAL} wrong passwords in ${humanWait(WINDOW)}`);
  }
  write(app, ALL_KEY, all);
}

// a correct password clears this address's misses (earlier lockouts still count
// toward the next one's length, until the server restarts)
function recordSuccess(app, ip) {
  const s = read(app, IP_KEY + ip);
  if (s) write(app, IP_KEY + ip, { misses: [], locks: s.locks || 0, until: 0 });
}

function humanWait(ms) {
  const m = Math.ceil(ms / MIN);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.ceil(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

module.exports = { lockedFor, recordMiss, recordSuccess, humanWait };
