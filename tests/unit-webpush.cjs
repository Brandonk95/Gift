// Checks pocketbase/pb_hooks/lib/webpush.js against Node's own crypto: hashes, AES-GCM,
// P-256 keys, signatures, and a full push message decrypted the way a browser would.
const crypto = require("crypto");
const assert = require("assert");
const wp = require("../pocketbase/pb_hooks/lib/webpush.js");

const buf = (u8) => Buffer.from(u8);
const eq = (a, b, what) => assert.strictEqual(buf(a).toString("hex"), buf(b).toString("hex"), what);

// SHA-256 / HMAC at awkward lengths (padding edges)
for (const n of [0, 1, 55, 56, 63, 64, 65, 200]) {
  const m = crypto.randomBytes(n);
  eq(wp.sha256(m), crypto.createHash("sha256").update(m).digest(), `sha256 len ${n}`);
  const k = crypto.randomBytes(n % 3 ? 16 : 80);
  eq(wp.hmac(k, m), crypto.createHmac("sha256", k).update(m).digest(), `hmac len ${n}`);
}
eq(wp.hkdf(Buffer.from("salt"), Buffer.from("ikm"), Buffer.from("info"), 16), Buffer.from(crypto.hkdfSync("sha256", "ikm", "salt", "info", 16)), "hkdf");
eq(wp.utf8("héllo 🎁"), Buffer.from("héllo 🎁", "utf8"), "utf8");
eq(wp.fromB64url(wp.b64url(Buffer.from("abcde"))), Buffer.from("abcde"), "base64url round trip");

// AES-128-GCM
for (const n of [0, 1, 15, 16, 17, 100]) {
  const key = crypto.randomBytes(16), iv = crypto.randomBytes(12), pt = crypto.randomBytes(n);
  const c = crypto.createCipheriv("aes-128-gcm", key, iv);
  const want = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
  eq(wp.aesGcmEncrypt(key, iv, pt), want, `aes-gcm len ${n}`);
}

// P-256: our key pair agrees with Node on ECDH both ways
const ours = wp.generateKeys();
const node = crypto.createECDH("prime256v1");
node.generateKeys();
eq(wp.ecdh(ours.privateKey, node.getPublicKey()), node.computeSecret(buf(ours.publicKey)), "ecdh");

// ES256 signatures verify with Node
const pubKey = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"), buf(ours.publicKey)]), format: "der", type: "spki" });
for (let i = 0; i < 3; i++) {
  const msg = crypto.randomBytes(40);
  assert(crypto.verify("sha256", msg, { key: pubKey, dsaEncoding: "ieee-p1363" }, buf(wp.sign(ours.privateKey, msg))), "signature verifies");
}

// VAPID header: a JWT for the push service's origin, signed with our key
const auth = wp.vapidAuth("https://fcm.googleapis.com/fcm/send/abc", "mailto:admin@example.test", ours, 1_000_000);
const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(auth);
const [h, p, s] = jwt.split(".");
const claims = JSON.parse(Buffer.from(p, "base64url"));
assert.deepStrictEqual(claims, { aud: "https://fcm.googleapis.com", exp: 1_000_000 + 43200, sub: "mailto:admin@example.test" });
assert(crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key: pubKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")), "jwt verifies");
eq(Buffer.from(k, "base64url"), ours.publicKey, "k is our public key");

// RFC 8291 message: decrypt as the browser
const browser = crypto.createECDH("prime256v1");
browser.generateKeys();
const authSecret = crypto.randomBytes(16);
const text = JSON.stringify({ title: "Sam added 3 gifts", body: "Board game, scarf, mug 🎁" });
const msg = buf(wp.encrypt(Buffer.from(text), wp.b64url(browser.getPublicKey()), wp.b64url(authSecret)));
const salt = msg.subarray(0, 16), rs = msg.readUInt32BE(16), idlen = msg[20], serverKey = msg.subarray(21, 21 + idlen), body = msg.subarray(21 + idlen);
assert.strictEqual(rs, 4096);
assert.strictEqual(idlen, 65);
const shared = browser.computeSecret(serverKey);
const info = Buffer.concat([Buffer.from("WebPush: info\0"), browser.getPublicKey(), serverKey]);
const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, authSecret, info, 32));
const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
d.setAuthTag(body.subarray(body.length - 16));
const plain = Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]);
assert.strictEqual(plain[plain.length - 1], 2, "last-record delimiter");
assert.strictEqual(plain.subarray(0, -1).toString("utf8"), text, "browser decrypts the message");

console.log("all web push checks passed");
