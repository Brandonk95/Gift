import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Info, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import Modal from "./Modal.jsx";
import { errorMessage, itemImage, pb } from "../lib/pb.js";
import { PRIORITIES, findUrl, hostname, isWishlistUrl } from "../lib/format.js";
import { useApp } from "../lib/app.jsx";
import Emoji from "./Emoji.jsx";

// Add or edit a gift. `categories` is the list visible to the user; new ones
// created inline are reported back through `onCategoryCreated`.
// `initial` prefills a new gift ({ url } triggers Autofill right away).
export default function ItemEditor({ listId, item, initial, currency, categories, items = [], onCategoryCreated, onClose, onSaved }) {
  const { user, config } = useApp();
  const [form, setForm] = useState({
    name: item?.name || initial?.name || "",
    url: item?.url || initial?.url || "",
    price: item?.price || initial?.price || "",
    quantity: item?.quantity || 1,
    priority: item?.priority || "medium",
    category: item?.category || "",
    size: item?.size || "",
    color: item?.color || "",
    description: item?.description || "",
    image_url: item?.image_url || initial?.image_url || "",
    goes_with: item?.goes_with || "",
  });
  // other gifts on this list it could go with (like a case for the earbuds)
  const partners = items.filter((o) => o.id !== item?.id && !o.received);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [newCat, setNewCat] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [found, setFound] = useState(null); // last Autofill result
  const [photos, setPhotos] = useState(null); // web photo search: { query, loading, items, error }
  // full-size web photos can refuse to load on other sites; fall back to the search thumbnail
  const thumbFor = useRef({});
  const autoRan = useRef(false);
  // fields Autofill filled in that you haven't touched since; a new Autofill may replace them
  // (a name that came with a shared link is only a fallback, so it counts too)
  const autoFields = useRef(new Set(initial?.url && initial?.name ? ["name"] : []));

  const set = (k) => (e) => {
    autoFields.current.delete(k);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  useEffect(() => {
    if (!file) return setFilePreview("");
    const u = URL.createObjectURL(file);
    setFilePreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const existingUpload = item?.image && !removeImage ? itemImage({ ...item, image_url: "" }) : "";
  const preview = filePreview || existingUpload || form.image_url;

  const autofill = async (raw = form.url) => {
    const url = findUrl(raw) || (raw.trim() && !/\s/.test(raw.trim()) ? `https://${raw.trim().replace(/^\/+/, "")}` : "");
    if (!url) return setError("Paste a full product link, like https://store.com/product, then press Autofill.");
    if (isWishlistUrl(url)) return setError("That's a wish list, not a single gift. Close this window and use “Add many” next to the add bar to bring in every gift on it.");
    setFetching(true);
    setError("");
    setFound(null);
    try {
      const d = await pb.send("/api/giftlist/preview", { query: { url } });
      const filled = [];
      setForm((f) => {
        const next = { ...f, url: d.url || url };
        const fill = (key, value, label) => {
          const mine = f[key] !== "" && f[key] != null && !autoFields.current.has(key);
          if (mine) return; // keep what you typed
          if (value === "" || value == null) {
            // don't leave the previous link's details behind
            if (key === "name") return; // never leave a gift without a name
            if (autoFields.current.has(key)) next[key] = "";
            autoFields.current.delete(key);
            return;
          }
          next[key] = value;
          autoFields.current.add(key);
          filled.push(label);
        };
        fill("name", d.title, "name");
        fill("price", d.price ?? "", "price");
        fill("description", d.description, "notes");
        if (!file && !existingUpload) fill("image_url", d.image, "picture");
        return next;
      });
      setFound({ ...d, filled });
      // no usable picture from the store (Amazon, blocked sites): look for photos on the web
      if (config.photoSearch && !d.images?.length && !file && !existingUpload && (d.title || form.name)) findPhotos(d.title || form.name, true);
    } catch (err) {
      setError(errorMessage(err, "read details from that link"));
    } finally {
      setFetching(false);
    }
  };

  const pickImage = (src) => {
    setFile(null);
    setRemoveImage(!!item?.image);
    autoFields.current.add("image_url");
    setForm((f) => ({ ...f, image_url: src }));
  };

  // auto = started by Autofill: also use the first photo if there's no picture yet
  const findPhotos = async (query = form.name, auto = false) => {
    const q = query.trim();
    if (!q) return setPhotos({ query: "", items: [], error: "Type what the gift is first, then search for photos of it." });
    setPhotos({ query: q, loading: true, items: [] });
    try {
      const d = await pb.send("/api/giftlist/images", { query: { q } });
      for (const p of d.photos) thumbFor.current[p.image] = p.thumbnail;
      setPhotos({ query: q, items: d.photos, error: d.photos.length ? "" : `No photos found for “${q}”. Try a shorter name.` });
      if (auto && d.photos.length) {
        setForm((f) => {
          if (f.image_url && !autoFields.current.has("image_url")) return f;
          autoFields.current.add("image_url");
          return { ...f, image_url: d.photos[0].image };
        });
      }
    } catch (err) {
      setPhotos({ query: q, items: [], error: errorMessage(err, "search for photos") });
    }
  };

  // the main picture failed: try the photo's thumbnail instead
  const previewFailed = () => {
    const thumb = thumbFor.current[form.image_url];
    if (thumb && thumb !== form.image_url) setForm((f) => ({ ...f, image_url: thumb }));
  };

  useEffect(() => {
    if (initial?.url && !item && !autoRan.current) {
      autoRan.current = true;
      autofill(initial.url);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError(`“${f.name}” isn't an image. Use a JPG, PNG, WebP or GIF.`);
    if (f.size > 5 * 1024 * 1024) {
      return setError(`“${f.name}” is ${(f.size / 1024 / 1024).toFixed(1)} MB. Pictures must be 5 MB or smaller — try a smaller image or a screenshot.`);
    }
    setError("");
    setFile(f);
    setRemoveImage(false);
  };

  const createCategory = async () => {
    if (!newCat?.name.trim()) return;
    try {
      const c = await pb.collection("categories").create({ name: newCat.name.trim(), icon: newCat.icon.trim() || "🏷️", owner: user.id });
      onCategoryCreated(c);
      setForm((f) => ({ ...f, category: c.id }));
      setNewCat(null);
    } catch (err) {
      setError(errorMessage(err, "create the category"));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      name: form.name.trim(),
      url: form.url.trim(),
      price: form.price === "" ? 0 : Number(form.price),
      quantity: Math.max(1, parseInt(form.quantity, 10) || 1),
      priority: form.priority,
      category: form.category,
      size: form.size.trim(),
      color: form.color.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim(),
      goes_with: form.goes_with,
    };
    if (file) body.image = file;
    else if (removeImage) body.image = null;

    try {
      const saved = item ? await pb.collection("items").update(item.id, body) : await pb.collection("items").create({ ...body, list: listId, sort: Date.now() % 2147483647 });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err, item ? "save your changes to this gift" : "add this gift"));
      setBusy(false);
    }
  };

  return (
    <Modal title={item ? "Edit gift" : "Add a gift"} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="item-form-grid">
          <div className="form-col">
            <label>
              Link <span className="muted">(optional)</span>
              <div className="input-group">
                <input
                  type="url"
                  value={form.url}
                  onChange={set("url")}
                  placeholder="Paste a product link to fill in the details"
                  onPaste={(e) => {
                    const url = findUrl(e.clipboardData.getData("text"));
                    if (!url) return;
                    e.preventDefault();
                    setForm((f) => ({ ...f, url }));
                    autofill(url);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      autofill();
                    }
                  }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => autofill()} disabled={!form.url || fetching}>
                  <Sparkles size={15} /> {fetching ? "Reading…" : "Autofill"}
                </button>
              </div>
            </label>
            {fetching && <div className="autofill-note">Reading {hostname(form.url) || "the page"}…</div>}
            {found && <AutofillNote found={found} currency={currency} />}
            <label>
              What is it?
              <input value={form.name} onChange={set("name")} required maxLength={200} autoFocus={!item && !initial?.url} placeholder="e.g. Wireless headphones" />
            </label>
            <div className="row-3">
              <label>
                Price{currency ? ` (${currency})` : ""}
                <input type="number" min="0" step="0.01" value={form.price} onChange={set("price")} placeholder="0.00" />
              </label>
              <label>
                Quantity
                <input type="number" min="1" step="1" value={form.quantity} onChange={set("quantity")} />
              </label>
              <label>
                Priority
                <select value={form.priority} onChange={set("priority")}>
                  {Object.entries(PRIORITIES).map(([k, p]) => (
                    <option key={k} value={k}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row-2">
              <label>
                Size <span className="muted">(optional)</span>
                <input value={form.size} onChange={set("size")} maxLength={60} placeholder="e.g. M, 10.5, 32×32" />
              </label>
              <label>
                Color / variant <span className="muted">(optional)</span>
                <input value={form.color} onChange={set("color")} maxLength={60} placeholder="e.g. Navy blue" />
              </label>
            </div>
            <label>
              Category
              {newCat ? (
                <div className="input-group">
                  <input className="emoji-input" value={newCat.icon} onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })} placeholder="🏷️" maxLength={4} />
                  <input
                    value={newCat.name}
                    onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                    placeholder="New category name"
                    maxLength={60}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        createCategory();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-primary" onClick={createCategory}>
                    Add
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setNewCat(null)} aria-label="Cancel new category">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="input-group">
                  <select value={form.category} onChange={set("category")}>
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        <Emoji e={c.icon} /> {c.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-secondary" onClick={() => setNewCat({ name: "", icon: "" })}>
                    <Plus size={15} /> New
                  </button>
                </div>
              )}
            </label>
            {partners.length > 0 && (
              <label>
                Goes with <span className="muted">(optional)</span>
                <select value={form.goes_with} onChange={set("goes_with")}>
                  <option value="">Nothing, it works on its own</option>
                  {partners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <span className="muted small">Like a case that only works with the earbuds. Friends see the two go together, but nobody has to buy both.</span>
              </label>
            )}
            <label>
              Notes <span className="muted">(anything that helps — model, where to buy…)</span>
              <textarea rows={3} value={form.description} onChange={set("description")} maxLength={3000} />
            </label>
          </div>

          <div className="form-col">
            <span className="label-text">Picture</span>
            <label
              className={`image-drop ${dragOver ? "drag-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={previewFailed}
                  onLoad={(e) => e.currentTarget.naturalWidth < 20 && previewFailed()}
                />
              ) : (
                <span className="image-drop-empty">
                  <ImagePlus size={28} />
                  <span>Drop an image or click to upload</span>
                </span>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => pickFile(e.target.files?.[0])} hidden />
            </label>
            {found?.images?.length > 1 && (
              <div className="image-choices" role="group" aria-label="Pictures found on the page">
                {found.images.map((src) => (
                  <button
                    type="button"
                    key={src}
                    className={`image-choice ${!file && form.image_url === src ? "active" : ""}`}
                    onClick={() => pickImage(src)}
                    title="Use this picture"
                  >
                    <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => (e.currentTarget.parentElement.hidden = true)} onLoad={(e) => e.currentTarget.naturalWidth < 20 && (e.currentTarget.parentElement.hidden = true)} />
                  </button>
                ))}
              </div>
            )}
            {config.photoSearch && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => findPhotos()} disabled={photos?.loading || !form.name.trim()}>
                <Search size={14} /> {photos?.loading ? "Searching…" : "Find photos online"}
              </button>
            )}
            {photos && (
              <div className="photo-results">
                {photos.loading ? (
                  <p className="muted small">Looking for photos of “{photos.query}”…</p>
                ) : photos.error ? (
                  <p className="muted small">{photos.error}</p>
                ) : (
                  <>
                    <p className="muted small">Photos of “{photos.query}” from the web. Tap one to use it.</p>
                    <div className="image-choices" role="group" aria-label="Photos from the web">
                      {photos.items.map((p) => (
                        <button
                          type="button"
                          key={p.image}
                          className={`image-choice ${!file && (form.image_url === p.image || form.image_url === p.thumbnail) ? "active" : ""}`}
                          onClick={() => pickImage(p.image)}
                          title={[p.title, p.source].filter(Boolean).join(" · ")}
                        >
                          <img
                            src={p.thumbnail}
                            alt=""
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            onError={(e) => (e.currentTarget.parentElement.hidden = true)}
                            onLoad={(e) => e.currentTarget.naturalWidth < 20 && (e.currentTarget.parentElement.hidden = true)}
                          />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <label>
              <span className="muted small">…or paste an image URL</span>
              <input type="url" value={form.image_url} onChange={set("image_url")} placeholder="https://…/photo.jpg" />
            </label>
            {(file || existingUpload || form.image_url) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setFile(null);
                  if (item?.image) setRemoveImage(true);
                  setForm((f) => ({ ...f, image_url: "" }));
                }}
              >
                <Trash2 size={14} /> Remove picture
              </button>
            )}
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : item ? "Save changes" : "Add to list"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// What Autofill found, or why it could only guess
function AutofillNote({ found, currency }) {
  const site = found.siteName || hostname(found.url);
  const otherCurrency = found.price != null && found.currency && currency && found.currency !== currency;
  if (found.blocked) {
    return (
      <div className="autofill-note warn">
        <Info size={15} />
        <span>
          {found.message}
          {found.title ? "" : " Fill in the details yourself."}
        </span>
      </div>
    );
  }
  return (
    <>
      <div className="autofill-note">
        <Check size={15} />
        <span>
          {found.filled.length ? `Filled in the ${listJoin(found.filled)} from ${site}.` : `Found ${site}, but your details were kept.`}
          {found.price == null && " No price on the page, so add it yourself."}
          {otherCurrency && ` The store's price is in ${found.currency}, while this list uses ${currency}.`}
          {found.images?.length > 1 && " Pick a different picture on the right if you like."}
        </span>
      </div>
      {found.priceNote && (
        <div className="autofill-note warn">
          <Info size={15} />
          <span>
            <strong>Check the price:</strong> {found.priceNote}
          </span>
        </div>
      )}
    </>
  );
}

function listJoin(words) {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
