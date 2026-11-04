import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Ban, Calendar, Check, Copy, EyeOff, Gift, LogOut, Mail, Pencil, PartyPopper, Shuffle, Trash2, Wallet, X } from "lucide-react";
import Modal from "../components/Modal.jsx";
import SantaMessages from "../components/SantaMessages.jsx";
import { Menu } from "../components/ui.jsx";
import { ExchangeForm } from "./Exchanges.jsx";
import { LoadError } from "./NotFound.jsx";
import { errorMessage, pb } from "../lib/pb.js";
import { countdown, formatDate, formatPrice } from "../lib/format.js";
import { useApp } from "../lib/app.jsx";

export default function Exchange() {
  const { id } = useParams();
  const { user, config, notify } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [myLists, setMyLists] = useState([]);
  const [editing, setEditing] = useState(false);
  const [rulesFor, setRulesFor] = useState(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    let alive = true;
    pb.send(`/api/giftlist/exchanges/${id}`)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(errorMessage(err, "load this gift exchange")));
    return () => {
      alive = false;
    };
  }, [id, reloadKey]);

  useEffect(() => {
    pb.collection("lists")
      .getFullList({ filter: pb.filter("owner = {:me} && archived = false", { me: user.id }), sort: "-created", fields: "id,title" })
      .then(setMyLists)
      .catch(() => {});
  }, [user.id]);

  if (error) return <LoadError message={error} onRetry={() => (setError(""), setReloadKey((k) => k + 1))} />;
  if (!data) return <div className="loading">Loading…</div>;

  const { exchange: x, members, me, match, santa } = data;
  const drawn = x.status === "drawn";
  const joined = members.filter((m) => m.joined);
  const invited = members.filter((m) => !m.joined);
  const budget = formatPrice(x.budget, x.currency || config.currency);
  const cd = countdown(x.event_date);

  const pickList = async (list) => {
    try {
      setData(await pb.send(`/api/giftlist/exchanges/${id}/my-list`, { method: "POST", body: { list } }));
      notify(list ? "Your Secret Santa will see this list" : "Wish list removed from the exchange");
    } catch (err) {
      notify(errorMessage(err, "update your wish list"), "error");
    }
  };

  const draw = async () => {
    const msg = drawn
      ? "Draw names again? Everyone gets a new match and a new email, so let them know to ignore the first one."
      : `Draw names for ${joined.length} people?` + (invited.length ? `\n\n${invited.length} invited ${invited.length === 1 ? "person hasn't" : "people haven't"} joined yet and will be left out.` : "") + "\n\nEveryone who's joined gets an email with their match.";
    if (!confirm(msg)) return;
    setDrawing(true);
    try {
      const r = await pb.send(`/api/giftlist/exchanges/${id}/draw`, { method: "POST" });
      notify(
        `Names drawn for ${r.drawn} people! 🎅 ` +
          (config.smtpEnabled
            ? `${r.emailed} ${r.emailed === 1 ? "person was" : "people were"} emailed their match${r.failed ? ` (${r.failed} emails failed; they can still see it here)` : ""}. Tell everyone to check spam if it doesn't arrive.`
            : "Everyone can see their match on this page.")
      );
      setReloadKey((k) => k + 1);
    } catch (err) {
      notify(errorMessage(err, "draw names"), "error");
    } finally {
      setDrawing(false);
    }
  };

  const remove = async (m) => {
    const self = m.you;
    if (!confirm(self ? `Leave “${x.name}”?` : `Remove ${m.name} from the exchange?`)) return;
    try {
      const r = await pb.send(`/api/giftlist/exchanges/${id}/members/${m.id}/remove`, { method: "POST" });
      if (self) {
        notify(`You left “${x.name}”`);
        navigate("/exchanges");
      } else setData(r);
    } catch (err) {
      notify(errorMessage(err, self ? "leave the exchange" : `remove ${m.name}`), "error");
    }
  };

  const removeExchange = async () => {
    if (!confirm(`Delete “${x.name}”? Everyone loses access and the draw is gone for good.`)) return;
    try {
      await pb.collection("exchanges").delete(x.id);
      notify("Exchange deleted");
      navigate("/exchanges");
    } catch (err) {
      notify(errorMessage(err, "delete the exchange"), "error");
    }
  };

  const reveal = async (hide) => {
    if (!hide && !confirm("Reveal everyone's Secret Santa? Each person will see who had them. Do this after the gifts are opened.")) return;
    try {
      setData(await pb.send(`/api/giftlist/exchanges/${id}/reveal`, { method: "POST", body: { hide } }));
      notify(hide ? "Santas are secret again" : "Santas revealed! 🎉 Everyone can see who had them.");
    } catch (err) {
      notify(errorMessage(err, "reveal the Santas"), "error");
    }
  };

  const organizerMenu = [
    { label: "Edit details", icon: Pencil, onClick: () => setEditing(true) },
    { label: "Reveal the Santas", icon: PartyPopper, onClick: () => reveal(false), hidden: !drawn || x.revealed },
    { label: "Hide the Santas again", icon: EyeOff, onClick: () => reveal(true), hidden: !drawn || !x.revealed },
    { label: "Draw names again", icon: Shuffle, onClick: draw, hidden: !drawn },
    { divider: true },
    { label: "Delete exchange", icon: Trash2, danger: true, onClick: removeExchange },
  ];

  return (
    <div className="page santa-page">
      <section className="list-header santa-header">
        <div className="list-header-main">
          <span className="list-icon list-icon-lg santa-icon">🎅</span>
          <div className="list-header-body">
            <p className="eyebrow">Secret Santa · {x.isOrganizer ? "you're organizing" : `organized by ${x.organizer}`}</p>
            <h1>{x.name}</h1>
            <div className="list-header-meta">
              {x.event_date && (
                <span>
                  <Calendar size={14} /> {formatDate(x.event_date)}
                  {cd && cd !== "Past" && <span className="countdown">{cd}</span>}
                </span>
              )}
              {budget && (
                <span>
                  <Wallet size={14} /> {budget} budget
                </span>
              )}
              <span>{joined.length} joined</span>
            </div>
          </div>
          {x.isOrganizer && (
            <div className="list-header-actions">
              <Menu items={organizerMenu} />
            </div>
          )}
        </div>
        {x.message && <p className="santa-note">{x.message}</p>}
      </section>

      {drawn && match && <MatchCard match={match} budget={budget} />}
      {drawn && x.revealed && santa && (
        <div className="banner santa-reveal">
          🎉 Your Secret Santa was <strong>{santa.name}</strong>!
        </div>
      )}
      {drawn && me && <SantaMessages exchangeId={x.id} />}
      {drawn && !match && me && <div className="banner">Names were drawn before you joined. Ask {x.organizer} to draw names again so you're included.</div>}
      {!drawn && (
        <div className="santa-status">
          <Shuffle size={18} />
          <div>
            <strong>{x.isOrganizer ? "Ready when everyone's in" : "Waiting for the draw"}</strong>
            <span className="muted small">
              {x.isOrganizer
                ? joined.length < 3
                  ? `You need at least 3 people to draw names. ${joined.length} joined so far.`
                  : `${joined.length} people have joined${invited.length ? `, ${invited.length} still invited` : ""}. Draw names when everyone's in.`
                : `${x.organizer} will draw names once everyone has joined. You'll get an email with who you're buying for.`}
            </span>
          </div>
          {x.isOrganizer && (
            <button className="btn btn-primary" onClick={draw} disabled={drawing || joined.length < 3}>
              <Shuffle size={15} /> {drawing ? "Drawing…" : "Draw names"}
            </button>
          )}
        </div>
      )}

      <div className="santa-grid">
        <div className="santa-col">
          {me && (
            <section className="panel">
              <div className="panel-head">
                <h2>Your wish list</h2>
                <p className="muted small">Pick the list your Secret Santa should shop from.</p>
              </div>
              {myLists.length ? (
                <select value={me.list} onChange={(e) => pickList(e.target.value)} aria-label="Your wish list">
                  <option value="">No list yet</option>
                  {myLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="small">
                  You don't have a wish list yet. <Link to="/">Make one</Link>, then come back and pick it here.
                </p>
              )}
              {me.list && (
                <p className="small muted santa-hint">
                  <Check size={13} /> Shared. <Link to={`/lists/${me.list}`}>Add more gifts to “{me.listTitle}”</Link>
                </p>
              )}
            </section>
          )}

          {x.isOrganizer && !drawn && <InvitePanel x={x} smtp={config.smtpEnabled} onInvited={() => setReloadKey((k) => k + 1)} />}
        </div>

        <section className="panel santa-col">
          <div className="panel-head">
            <h2>Who's in</h2>
            {x.isOrganizer && <p className="muted small">Use “can't draw” to keep partners or housemates from drawing each other.</p>}
          </div>
          <ul className="member-list">
            {members.map((m) => {
              const rules = (m.exclusions || []).map((rid) => members.find((o) => o.id === rid)?.name).filter(Boolean);
              return (
                <li key={m.id} className={m.joined ? "" : "pending"}>
                  <span className="member-avatar">{m.name.slice(0, 1).toUpperCase()}</span>
                  <div className="member-body">
                    <div className="member-name">
                      {m.name}
                      {m.you && <span className="chip-static subtle">you</span>}
                      {m.organizer && <span className="chip-static subtle">organizer</span>}
                    </div>
                    <div className="muted small">
                      {m.joined ? (m.hasList ? "Joined · shared a wish list" : "Joined · no wish list yet") : `Invited${m.email ? ` (${m.email})` : ""} · hasn't joined`}
                    </div>
                    {rules.length > 0 && (
                      <div className="member-rules small">
                        <Ban size={12} /> Can't draw {rules.join(", ")}
                      </div>
                    )}
                  </div>
                  {x.isOrganizer && (
                    <div className="member-actions">
                      {members.length > 2 && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setRulesFor(m)} title={`Who ${m.name} can't draw`}>
                          <Ban size={14} /> Can't draw
                        </button>
                      )}
                      {!drawn && !m.organizer && (
                        <button className="icon-btn icon-btn-sm" onClick={() => remove(m)} title={`Remove ${m.name}`} aria-label={`Remove ${m.name}`}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {me && !x.isOrganizer && !drawn && (
            <button className="btn btn-ghost btn-sm santa-leave" onClick={() => remove(members.find((m) => m.you))}>
              <LogOut size={14} /> Leave exchange
            </button>
          )}
          {drawn && x.isOrganizer && <p className="muted small santa-hint">🤫 Even as the organizer, you can only see your own match.</p>}
        </section>
      </div>

      {editing && (
        <ExchangeForm
          exchange={x}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setReloadKey((k) => k + 1);
            notify("Exchange updated");
          }}
        />
      )}
      {rulesFor && (
        <RulesModal
          member={rulesFor}
          members={members}
          drawn={drawn}
          exchangeId={x.id}
          onClose={() => setRulesFor(null)}
          onSaved={(d) => {
            setData(d);
            setRulesFor(null);
          }}
        />
      )}
    </div>
  );
}

function MatchCard({ match, budget }) {
  return (
    <section className="match-card">
      <p className="eyebrow">You're the Secret Santa for</p>
      <div className="match-name">{match.name}</div>
      {budget && <p className="muted small">Budget: about {budget}</p>}
      {match.list ? (
        <Link className="btn btn-primary" to={`/s/${match.list.token}`}>
          <Gift size={16} /> See {match.name}'s wish list
        </Link>
      ) : (
        <p className="small">{match.name} hasn't shared a wish list yet. We'll email you when they do.</p>
      )}
      <p className="muted small">🤫 Keep it secret! Reserve a gift on their list so nobody doubles up.</p>
    </section>
  );
}

function InvitePanel({ x, smtp, onInvited }) {
  const { notify } = useApp();
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(x.joinLink);
      notify("Join link copied!");
    } catch {
      prompt("Copy this join link:", x.joinLink);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await pb.send(`/api/giftlist/exchanges/${x.id}/invite`, { method: "POST", body: { emails } });
      notify(
        `Invited ${r.sent} ${r.sent === 1 ? "person" : "people"} ✉️` +
          (r.alreadyIn.length ? ` (${r.alreadyIn.length} already in)` : "") +
          (r.failed.length ? ` (${r.failed.length} failed)` : "") +
          " Let them know to check spam or junk if it doesn't arrive."
      );
      setEmails("");
      onInvited();
    } catch (err) {
      setError(errorMessage(err, "send the invitations"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Invite people</h2>
        <p className="muted small">Anyone with the link can join (they'll need an account).</p>
      </div>
      <div className="input-group">
        <input value={x.joinLink} readOnly onFocus={(e) => e.target.select()} aria-label="Join link" />
        <button className="btn btn-secondary" onClick={copy}>
          <Copy size={15} /> Copy
        </button>
      </div>
      {smtp && (
        <form className="form santa-invite" onSubmit={send}>
          <label>
            <span className="small">…or email the invitation</span>
            <textarea rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="mom@example.com, sam@example.com" required />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <div>
            <button className="btn btn-primary btn-sm" disabled={busy}>
              <Mail size={14} /> {busy ? "Sending…" : "Send invitations"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function RulesModal({ member, members, drawn, exchangeId, onClose, onSaved }) {
  const { notify } = useApp();
  const [picked, setPicked] = useState(new Set(member.exclusions || []));
  const [busy, setBusy] = useState(false);
  const others = members.filter((m) => m.id !== member.id);

  const toggle = (id) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      const d = await pb.send(`/api/giftlist/exchanges/${exchangeId}/members/${member.id}/exclusions`, { method: "POST", body: { exclude: [...picked] } });
      notify(drawn ? "Saved. Draw names again to apply the new rules." : "Saved");
      onSaved(d);
    } catch (err) {
      notify(errorMessage(err, "save the rules"), "error");
      setBusy(false);
    }
  };

  return (
    <Modal title={`Who ${member.name} can't draw`} onClose={onClose}>
      <div className="form">
        <p className="muted small">Works both ways: they won't draw each other. Handy for partners and people who live together.</p>
        <div className="check-list">
          {others.map((o) => (
            <label key={o.id} className="toggle">
              <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
              {o.name}
              {!o.joined && <span className="muted small"> (invited)</span>}
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
