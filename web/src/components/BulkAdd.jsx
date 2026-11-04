import { useEffect, useRef, useState } from "react";
import { Check, Gift, Loader2, AlertTriangle } from "lucide-react";
import Modal from "./Modal.jsx";
import { errorMessage, pb } from "../lib/pb.js";
import { findUrls, formatPrice, hostname, isWishlistUrl } from "../lib/format.js";

const AT_ONCE = 3; // links read at the same time

// Add many gifts at once: paste a pile of product links (or an Amazon wish list
// link), every link is autofilled, then you untick what you don't want and add the rest.
export default function BulkAdd({ listId, currency, initialText = "", onClose, onAdded }) {
  const [text, setText] = useState(initialText);
  const [rows, setRows] = useState(null); // null = still pasting
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const patch = (i, p) => alive.current && setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const read = async () => {
    setError("");
    const urls = findUrls(text);
    if (!urls.length) return setError("Paste at least one link that starts with https://, one per line.");
    let list = [];
    for (const url of urls) {
      if (isWishlistUrl(url) || /^https?:\/\/(a\.co|amzn\.to|amzn\.eu)\//i.test(url)) {
        try {
          const d = await pb.send("/api/giftlist/wishlist", { query: { url } });
          list.push(...d.items.map((it) => ({ ...it, state: "ready", keep: true, fromList: true })));
          continue;
        } catch (err) {
          // a short link to a single product isn't a wish list: read it like any other link
          if (isWishlistUrl(url)) {
            setError(errorMessage(err, "read that wish list"));
            continue;
          }
        }
      }
      list.push({ url, name: "", price: null, image: "", state: "waiting", keep: true });
    }
    list = list.slice(0, 200);
    if (!list.length) return;
    setRows(list);

    // autofill the plain links, a few at a time
    let next = 0;
    const worker = async () => {
      while (alive.current) {
        const i = next++;
        if (i >= list.length) return;
        if (list[i].state !== "waiting") continue;
        patch(i, { state: "reading" });
        try {
          const d = await pb.send("/api/giftlist/preview", { query: { url: list[i].url } });
          patch(i, { state: "ready", url: d.url || list[i].url, name: (d.title || "").slice(0, 200), price: d.price ?? null, image: d.image || "", description: d.description || "", note: d.blocked ? "Store blocked the preview; name guessed from the link" : "" });
        } catch (err) {
          // a link that doesn't work starts unticked; tick it to add it anyway
          patch(i, { state: "ready", name: "", keep: false, note: errorMessage(err, "read this link") });
        }
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
  };

  const busy = rows?.some((r) => r.state === "waiting" || r.state === "reading");
  const chosen = (rows || []).filter((r) => r.keep && r.state !== "added");

  const addAll = async () => {
    setAdding(true);
    setError("");
    const saved = [];
    const start = Date.now() % 2147483647;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.keep || r.state === "added") continue;
      try {
        const item = await pb.collection("items").create({
          list: listId,
          name: (r.name || "").trim() || hostname(r.url) || "Gift",
          url: r.url,
          ...(r.price != null && r.price !== "" ? { price: Number(r.price) } : {}),
          image_url: r.image || "",
          description: (r.description || "").slice(0, 2000),
          priority: "medium",
          quantity: 1,
          sort: (start + i) % 2147483647,
        });
        saved.push(item);
        patch(i, { state: "added" });
      } catch (err) {
        patch(i, { state: "ready", note: errorMessage(err, "add this gift") });
      }
    }
    setAdding(false);
    if (saved.length) onAdded(saved);
  };

  return (
    <Modal title="Add many gifts" onClose={onClose} wide>
      {rows === null ? (
        <div className="form">
          <label>
            Paste gift links, one per line
            <textarea
              rows={8}
              value={text}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              placeholder={"https://store.com/cozy-socks\nhttps://another.shop/board-game\n…or an Amazon wish list link"}
            />
          </label>
          <p className="muted small">Each link is read for its name, price and picture, just like Autofill. You can check them before anything is added.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={read} disabled={!text.trim()}>
              Read {findUrls(text).length > 1 ? `${findUrls(text).length} links` : "links"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="bulk-rows">
            {rows.map((r, i) => (
              <li key={i} className={`bulk-row ${r.keep ? "" : "off"} ${r.state}`}>
                <input type="checkbox" checked={r.keep} disabled={r.state === "added" || adding} onChange={(e) => patch(i, { keep: e.target.checked })} aria-label="Include this gift" />
                <span className="bulk-thumb">{r.image ? <img src={r.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => patch(i, { image: "" })} /> : <Gift size={18} />}</span>
                <div className="bulk-main">
                  {r.state === "waiting" || r.state === "reading" ? (
                    <span className="muted small">
                      <Loader2 size={14} className="spin" /> Reading {hostname(r.url)}…
                    </span>
                  ) : (
                    <input className="bulk-name" value={r.name} placeholder={`Name (from ${hostname(r.url)})`} disabled={r.state === "added" || adding} onChange={(e) => patch(i, { name: e.target.value })} />
                  )}
                  <span className="bulk-meta muted small">
                    {hostname(r.url)}
                    {r.price != null && ` · ${formatPrice(r.price, currency)}`}
                    {r.note && (
                      <span className="bulk-note">
                        {" "}
                        · <AlertTriangle size={12} /> {r.note}
                      </span>
                    )}
                  </span>
                </div>
                {r.state === "added" && (
                  <span className="bulk-done" title="Added">
                    <Check size={16} />
                  </span>
                )}
              </li>
            ))}
          </ul>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => (rows.some((r) => r.state === "added") ? onClose() : setRows(null))} disabled={adding}>
              {rows.some((r) => r.state === "added") ? "Done" : "Back"}
            </button>
            <button type="button" className="btn btn-primary" onClick={addAll} disabled={busy || adding || !chosen.length}>
              {busy ? "Reading links…" : adding ? "Adding…" : `Add ${chosen.length} gift${chosen.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
