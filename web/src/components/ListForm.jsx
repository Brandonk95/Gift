import { useEffect, useRef, useState } from "react";
import { ImagePlus, Lock, X } from "lucide-react";
import Modal from "./Modal.jsx";
import { EmojiPicker, Switch, Swatches } from "./ui.jsx";
import { errorMessage, pb } from "../lib/pb.js";
import { OCCASIONS, dateOnly, occasion } from "../lib/format.js";
import { LIST_COLORS, VIEWS } from "../lib/theme.js";
import { OCCASION_THEME, THEMES, coverProps, listCover } from "../lib/themes.js";
import { useApp } from "../lib/app.jsx";
import Emoji from "./Emoji.jsx";
import CoOwners from "./CoOwners.jsx";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "JPY", "CHF", "SEK", "NOK", "DKK", "PLN", "MXN", "BRL", "INR", "ZAR"];

// Create (no `list`) or edit a list: details, look, privacy.
export default function ListForm({ list, onClose, onSaved, onListChange }) {
  const { user, config } = useApp();
  const [form, setForm] = useState({
    title: list?.title || "",
    occasion: list?.occasion || "christmas",
    event_date: dateOnly(list?.event_date),
    description: list?.description || "",
    emoji: list?.emoji || "",
    color: list?.color || "",
    currency: list?.currency || "",
    hide_prices: !!list?.hide_prices,
    hide_reservers: !!list?.hide_reservers,
    reveal_givers: !!list?.reveal_givers,
    no_chip_in: !!list?.no_chip_in,
    no_questions: !!list?.no_questions,
    archived: !!list?.archived,
    theme: list?.theme || "",
    friend_view: list?.friend_view === "compact" ? "list" : list?.friend_view || "",
    private: !!list?.private,
  });
  const [coverFile, setCoverFile] = useState(null); // a new photo to upload
  const [removeCover, setRemoveCover] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      emoji: form.emoji.trim(),
      event_date: form.event_date ? `${form.event_date} 12:00:00.000Z` : "",
    };
    if (coverFile) body.cover = coverFile;
    else if (removeCover) body.cover = null;
    try {
      const saved = list ? await pb.collection("lists").update(list.id, body) : await pb.collection("lists").create({ ...body, owner: user.id });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err, list ? "save your changes to this list" : "create the list"));
      setBusy(false);
    }
  };

  return (
    <Modal title={list ? "List settings" : "New list"} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="form-section">
          <label>
            Name
            <input value={form.title} onChange={set("title")} required maxLength={120} autoFocus placeholder="e.g. Christmas 2026" />
          </label>
          <div className="row-2">
            <label>
              Occasion
              <select value={form.occasion} onChange={set("occasion")}>
                {Object.entries(OCCASIONS).map(([k, o]) => (
                  <option key={k} value={k}>
                    <Emoji e={o.icon} /> {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date <span className="muted">(optional)</span>
              <input type="date" value={form.event_date} onChange={set("event_date")} />
            </label>
          </div>
          <label>
            Note for friends <span className="muted">(optional)</span>
            <textarea rows={2} value={form.description} onChange={set("description")} maxLength={2000} placeholder="Sizes, favorite colors, things I already have…" />
          </label>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Look</h3>
          <span className="label-text">
            Icon <span className="muted">(defaults to {occasion(form.occasion).icon})</span>
          </span>
          <EmojiPicker value={form.emoji} onChange={set("emoji")} />
          <span className="label-text">Color</span>
          <Swatches value={form.color} onChange={set("color")} colors={LIST_COLORS} allowNone />
          <span className="label-text">
            Banner <span className="muted">(the top of your list, the first thing friends see)</span>
          </span>
          <BannerPicker
            list={list}
            occasionKey={form.occasion}
            theme={form.theme}
            onTheme={(t) => {
              setForm({ ...form, theme: t });
              setCoverFile(null);
              if (list?.cover) setRemoveCover(true);
            }}
            coverFile={coverFile}
            hasSavedCover={!!list?.cover && !removeCover}
            onPhoto={(f) => {
              setCoverFile(f);
              setRemoveCover(false);
            }}
            onRemovePhoto={() => {
              setCoverFile(null);
              setRemoveCover(true);
            }}
          />
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Sharing & privacy</h3>
          <Switch
            checked={form.private}
            onChange={set("private")}
            label={
              <>
                <Lock size={13} /> Private ideas board
              </>
            }
            hint="Only you can see it, and it has no share link. Collect ideas here, then move gifts to a real list when you're ready."
          />
          <label>
            Friends see gifts as
            <select value={form.friend_view} onChange={set("friend_view")}>
              <option value="">Their own choice</option>
              {Object.entries(VIEWS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <Switch
            checked={form.hide_prices}
            onChange={set("hide_prices")}
            label="Hide prices from friends"
            hint="You still see prices; friends just see the gifts."
          />
          <Switch
            checked={form.hide_reservers}
            onChange={set("hide_reservers")}
            label="Hide who reserved what"
            hint="Friends see that a gift is taken, but not by whom."
          />
          <Switch
            checked={!form.no_chip_in}
            onChange={(v) => setForm({ ...form, no_chip_in: !v })}
            label="Let friends chip in together"
            hint="Several friends can split one gift. Turn off if each gift should come from one person."
          />
          <Switch
            checked={!form.no_questions}
            onChange={(v) => setForm({ ...form, no_questions: !v })}
            label="Let friends ask questions"
            hint="Friends can ask you things like sizes or colors without saying which gift they're getting."
          />
          <Switch
            checked={form.reveal_givers}
            onChange={set("reveal_givers")}
            label="Show me who gave what after the date"
            hint="The day after the list's date you'll get a thank-you checklist. Friends are told on the list."
          />
          <label>
            Currency
            <select value={form.currency} onChange={set("currency")}>
              <option value="">Site default ({config.currency})</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {list && <Switch checked={form.archived} onChange={set("archived")} label="Archive this list" hint="Moves it to the archive on your dashboard. The share link keeps working." />}
        </div>

        {list && <CoOwners list={list} onListChange={onListChange} />}

        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : list ? "Save" : "Create list"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Banner choice: none, a theme (the occasion's own first), or your own photo
function BannerPicker({ list, occasionKey, theme, onTheme, coverFile, hasSavedCover, onPhoto, onRemovePhoto }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!coverFile) return setPreview("");
    const url = URL.createObjectURL(coverFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const photo = preview || (hasSavedCover ? listCover({ ...list, theme: "" }, "600x200")?.image : "");
  const suggested = OCCASION_THEME[occasionKey];
  const order = Object.keys(THEMES).sort((a, b) => (a === suggested ? -1 : b === suggested ? 1 : 0));

  return (
    <div className="banner-picker">
      <button type="button" className={`banner-tile banner-none ${!photo && !theme ? "active" : ""}`} onClick={() => onTheme("")} aria-pressed={!photo && !theme}>
        <span className="banner-tile-art" />
        <span className="banner-tile-label">None</span>
      </button>
      {order.map((t) => {
        const p = coverProps({ theme: t }, "banner-tile-art");
        const on = !photo && theme === t;
        return (
          <button key={t} type="button" className={`banner-tile ${on ? "active" : ""}`} onClick={() => onTheme(t)} title={THEMES[t].hint} aria-pressed={on}>
            <span {...p} />
            <span className="banner-tile-label">
              {THEMES[t].label}
              {t === suggested && <span className="muted"> · suggested</span>}
            </span>
          </button>
        );
      })}
      <div className={`banner-tile banner-photo ${photo ? "active" : ""}`}>
        <button type="button" className="banner-photo-btn" onClick={() => fileRef.current?.click()}>
          {photo ? <span className="banner-tile-art cover-photo" style={{ backgroundImage: `url("${photo}")` }} /> : (
            <span className="banner-tile-art banner-upload">
              <ImagePlus size={18} />
            </span>
          )}
          <span className="banner-tile-label">{photo ? "Your photo · change" : "Your photo"}</span>
        </button>
        {photo && (
          <button type="button" className="banner-remove" onClick={onRemovePhoto} aria-label="Remove photo" title="Remove photo">
            <X size={13} />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 5 * 1024 * 1024) return alert("That photo is over 5 MB. Pick a smaller one.");
            onPhoto(f);
          }}
        />
      </div>
    </div>
  );
}
