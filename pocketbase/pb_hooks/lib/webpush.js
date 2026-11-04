// Web Push (phone and desktop notifications) without any outside software.
//
// PocketBase's script engine has no elliptic-curve crypto, so this file carries the
// small pieces Web Push needs, written for plain JS with BigInt:
//   - SHA-256 / HMAC / HKDF
//   - AES-128-GCM (encrypt only)
//   - P-256 key pairs, ECDH and ECDSA (ES256) signatures
// and uses them for RFC 8291 message encryption (aes128gcm) and RFC 8292 VAPID.
// Messages are a few hundred bytes, so speed isn't a concern.
//
// tests/unit-webpush.cjs checks every piece against Node's own crypto.

// ------------------------------------------------------------------ bytes

function randomBytes(n) {
  if (typeof $security !== "undefined") {
    const hex = $security.randomStringWithAlphabet(n * 2, "0123456789abcdef");
    return fromHex(hex);
  }
  return new Uint8Array(require("crypto").randomBytes(n)); // Node (tests)
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function concat() {
  let len = 0;
  for (let i = 0; i < arguments.length; i++) len += arguments[i].length;
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < arguments.length; i++) {
    out.set(arguments[i], o);
    o += arguments[i].length;
  }
  return out;
}

function utf8(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d < 0xe000) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) s += B64[n & 63];
  }
  return s;
}

function fromB64url(str) {
  const s = String(str || "").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const out = [];
  let buf = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    if (v < 0) throw new Error("bad base64");
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 255);
    }
  }
  return new Uint8Array(out);
}

function toBig(bytes) {
  let n = 0n;
  for (let i = 0; i < bytes.length; i++) n = (n << 8n) | BigInt(bytes[i]);
  return n;
}

function fromBig(n, len) {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(n & 255n);
    n >>= 8n;
  }
  return out;
}

// ---------------------------------------------------------------- SHA-256

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256(msg) {
  const len = msg.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[len] = 0x80;
  const bits = len * 8;
  padded[padded.length - 4] = (bits >>> 24) & 255;
  padded[padded.length - 3] = (bits >>> 16) & 255;
  padded[padded.length - 2] = (bits >>> 8) & 255;
  padded[padded.length - 1] = bits & 255;
  padded[padded.length - 5] = Math.floor(bits / 0x100000000) & 255;

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3]) | 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (k + S1 + ch + K256[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + k) | 0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (h[i] >>> 24) & 255;
    out[i * 4 + 1] = (h[i] >>> 16) & 255;
    out[i * 4 + 2] = (h[i] >>> 8) & 255;
    out[i * 4 + 3] = h[i] & 255;
  }
  return out;
}

function hmac(key, msg) {
  if (key.length > 64) key = sha256(key);
  const k = new Uint8Array(64);
  k.set(key);
  const ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }
  return sha256(concat(opad, sha256(concat(ipad, msg))));
}

// HKDF with output up to 32 bytes (one block), all Web Push needs
function hkdf(salt, ikm, info, len) {
  const prk = hmac(salt, ikm);
  return hmac(prk, concat(info, new Uint8Array([1]))).slice(0, len);
}

// ------------------------------------------------------------- AES-128-GCM

let SBOX = null;
function sbox() {
  if (SBOX) return SBOX;
  SBOX = new Uint8Array(256);
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 255) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 255;
    if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    SBOX[p] = (x ^ 0x63) & 255;
  } while (p !== 1);
  SBOX[0] = 0x63;
  return SBOX;
}

function expandKey(key) {
  const S = sbox();
  const w = new Uint8Array(176);
  w.set(key);
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
    if (i % 16 === 0) {
      const tmp = t0;
      t0 = S[t1] ^ rcon;
      t1 = S[t2];
      t2 = S[t3];
      t3 = S[tmp];
      rcon = (rcon << 1) ^ (rcon & 0x80 ? 0x11b : 0);
    }
    w[i] = w[i - 16] ^ t0;
    w[i + 1] = w[i - 15] ^ t1;
    w[i + 2] = w[i - 14] ^ t2;
    w[i + 3] = w[i - 13] ^ t3;
  }
  return w;
}

const xtime = (b) => ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 255;

function aesBlock(w, input) {
  const S = sbox();
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = input[i] ^ w[i];
  for (let round = 1; round <= 10; round++) {
    // SubBytes + ShiftRows
    const t = new Uint8Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) t[c * 4 + r] = S[s[((c + r) % 4) * 4 + r]];
    // MixColumns (not in the last round)
    if (round < 10) {
      for (let c = 0; c < 4; c++) {
        const a0 = t[c * 4], a1 = t[c * 4 + 1], a2 = t[c * 4 + 2], a3 = t[c * 4 + 3];
        const all = a0 ^ a1 ^ a2 ^ a3;
        t[c * 4] = a0 ^ all ^ xtime(a0 ^ a1);
        t[c * 4 + 1] = a1 ^ all ^ xtime(a1 ^ a2);
        t[c * 4 + 2] = a2 ^ all ^ xtime(a2 ^ a3);
        t[c * 4 + 3] = a3 ^ all ^ xtime(a3 ^ a0);
      }
    }
    for (let i = 0; i < 16; i++) s[i] = t[i] ^ w[round * 16 + i];
  }
  return s;
}

const GCM_R = 0xe1n << 120n;
function gmul(x, y) {
  let z = 0n, v = y;
  for (let i = 127; i >= 0; i--) {
    if ((x >> BigInt(i)) & 1n) z ^= v;
    v = v & 1n ? (v >> 1n) ^ GCM_R : v >> 1n;
  }
  return z;
}

// returns ciphertext || 16-byte tag (no additional data)
function aesGcmEncrypt(key, iv, plain) {
  const w = expandKey(key);
  const H = toBig(aesBlock(w, new Uint8Array(16)));
  const j0 = concat(iv, new Uint8Array([0, 0, 0, 1]));
  const out = new Uint8Array(plain.length);
  const ctr = j0.slice();
  for (let off = 0; off < plain.length; off += 16) {
    for (let i = 15; i >= 12; i--) if (++ctr[i] !== 256) break; else ctr[i] = 0;
    const ks = aesBlock(w, ctr);
    for (let i = 0; i < 16 && off + i < plain.length; i++) out[off + i] = plain[off + i] ^ ks[i];
  }
  let X = 0n;
  for (let off = 0; off < out.length; off += 16) {
    const block = new Uint8Array(16);
    block.set(out.subarray(off, Math.min(off + 16, out.length)));
    X = gmul(X ^ toBig(block), H);
  }
  X = gmul(X ^ BigInt(out.length * 8), H); // lengths block: 0 bits of AAD, then ciphertext bits
  const tag = fromBig(toBig(aesBlock(w, j0)) ^ X, 16);
  return concat(out, tag);
}

// ------------------------------------------------------------------- P-256

const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const G = [0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n];

const mod = (a, m) => {
  const r = a % m;
  return r < 0n ? r + m : r;
};

function inv(a, m) {
  let [r0, r1] = [mod(a, m), m];
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return mod(s0, m);
}

// Jacobian coordinates [X, Y, Z]; Z = 0 is the point at infinity
function jDouble(p) {
  const [X, Y, Z] = p;
  if (Z === 0n || Y === 0n) return [0n, 1n, 0n];
  const YY = mod(Y * Y, P);
  const S = mod(4n * X * YY, P);
  const ZZ = mod(Z * Z, P);
  const M = mod(3n * (X - ZZ) * (X + ZZ), P); // a = -3
  const X3 = mod(M * M - 2n * S, P);
  const Y3 = mod(M * (S - X3) - 8n * YY * YY, P);
  const Z3 = mod(2n * Y * Z, P);
  return [X3, Y3, Z3];
}

function jAdd(p, q) {
  if (p[2] === 0n) return q;
  if (q[2] === 0n) return p;
  const [X1, Y1, Z1] = p, [X2, Y2, Z2] = q;
  const Z1Z1 = mod(Z1 * Z1, P), Z2Z2 = mod(Z2 * Z2, P);
  const U1 = mod(X1 * Z2Z2, P), U2 = mod(X2 * Z1Z1, P);
  const S1 = mod(Y1 * Z2 * Z2Z2, P), S2 = mod(Y2 * Z1 * Z1Z1, P);
  const Hh = mod(U2 - U1, P), R = mod(S2 - S1, P);
  if (Hh === 0n) return R === 0n ? jDouble(p) : [0n, 1n, 0n];
  const HH = mod(Hh * Hh, P), HHH = mod(Hh * HH, P);
  const V = mod(U1 * HH, P);
  const X3 = mod(R * R - HHH - 2n * V, P);
  const Y3 = mod(R * (V - X3) - S1 * HHH, P);
  const Z3 = mod(Z1 * Z2 * Hh, P);
  return [X3, Y3, Z3];
}

function mul(k, pt) {
  let r = [0n, 1n, 0n];
  const base = [pt[0], pt[1], 1n];
  for (let i = BigInt(k.toString(2).length - 1); i >= 0n; i--) {
    r = jDouble(r);
    if ((k >> i) & 1n) r = jAdd(r, base);
  }
  if (r[2] === 0n) throw new Error("point at infinity");
  const zi = inv(r[2], P), zi2 = mod(zi * zi, P);
  return [mod(r[0] * zi2, P), mod(r[1] * zi2 * zi, P)];
}

function onCurve(x, y) {
  return mod(y * y - (x * x * x - 3n * x + B), P) === 0n;
}

function encodePoint(pt) {
  return concat(new Uint8Array([4]), fromBig(pt[0], 32), fromBig(pt[1], 32));
}

function decodePoint(bytes) {
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("expected an uncompressed P-256 key");
  const x = toBig(bytes.slice(1, 33)), y = toBig(bytes.slice(33));
  if (!onCurve(x, y)) throw new Error("key is not on P-256");
  return [x, y];
}

function randomScalar() {
  for (;;) {
    const d = toBig(randomBytes(32));
    if (d > 0n && d < N) return d;
  }
}

function generateKeys() {
  const d = randomScalar();
  return { privateKey: fromBig(d, 32), publicKey: encodePoint(mul(d, G)) };
}

function ecdh(privateKey, publicKey) {
  return fromBig(mul(toBig(privateKey), decodePoint(publicKey))[0], 32);
}

// ES256: raw r || s
function sign(privateKey, msg) {
  const d = toBig(privateKey);
  const z = toBig(sha256(msg));
  for (;;) {
    const k = randomScalar();
    const r = mod(mul(k, G)[0], N);
    if (r === 0n) continue;
    const s = mod(inv(k, N) * (z + r * d), N);
    if (s === 0n) continue;
    return concat(fromBig(r, 32), fromBig(s, 32));
  }
}

// ---------------------------------------------------------------- Web Push

// RFC 8291: encrypt `payload` (bytes) for a browser's p256dh + auth keys
function encrypt(payload, p256dh, auth) {
  const uaPublic = typeof p256dh === "string" ? fromB64url(p256dh) : p256dh;
  const authSecret = typeof auth === "string" ? fromB64url(auth) : auth;
  const server = generateKeys();
  const shared = ecdh(server.privateKey, uaPublic);
  const ikm = hkdf(authSecret, shared, concat(utf8("WebPush: info"), new Uint8Array([0]), uaPublic, server.publicKey), 32);
  const salt = randomBytes(16);
  const cek = hkdf(salt, ikm, concat(utf8("Content-Encoding: aes128gcm"), new Uint8Array([0])), 16);
  const nonce = hkdf(salt, ikm, concat(utf8("Content-Encoding: nonce"), new Uint8Array([0])), 12);
  const body = aesGcmEncrypt(cek, nonce, concat(payload, new Uint8Array([2])));
  const rs = 4096;
  const header = concat(salt, new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255, 65]), server.publicKey);
  return concat(header, body);
}

// RFC 8292: the Authorization header value for one push service
function vapidAuth(endpoint, subject, keys, nowSeconds) {
  const aud = /^(https?:\/\/[^/]+)/i.exec(endpoint)[1];
  const enc = (o) => b64url(utf8(JSON.stringify(o)));
  const unsigned = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({ aud, exp: nowSeconds + 12 * 3600, sub: subject });
  const jwt = unsigned + "." + b64url(sign(keys.privateKey, utf8(unsigned)));
  return `vapid t=${jwt}, k=${b64url(keys.publicKey)}`;
}

module.exports = {
  encrypt,
  vapidAuth,
  generateKeys,
  ecdh,
  sign,
  sha256,
  hmac,
  hkdf,
  aesGcmEncrypt,
  utf8,
  b64url,
  fromB64url,
};
