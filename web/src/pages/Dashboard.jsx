import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, CopyPlus, Lightbulb, Link2, Lock, MailCheck, Plus, Settings2, Trash2, Users, X } from "lucide-react";
import GettingStarted from "../components/GettingStarted.jsx";
import ListForm from "../components/ListForm.jsx";
import { ListIcon } from "../components/ListHeader.jsx";
import { shareUrl } from "../components/SharePanel.jsx";
import { Menu } from "../components/ui.jsx";
import { errorMessage, pb, shareHeaders } from "../lib/pb.js";
import { countdown, daysUntil, formatDate, occasion } from "../lib/format.js";
import { duplicateList } from "../lib/listActions.js";
import { listColor } from "../lib/theme.js";
import { coverProps, listCover } from "../lib/themes.js";
import { useApp } from "../lib/app.jsx";

// Occasions in the next 60 days: your lists, lists you follow, and Secret Santas
function ComingUp({ lists, follows, userId }) {
  const [exchanges, setExchanges] = useState([]);
  useEffect(() => {
    pb.send("/api/giftlist/exchanges")
      .then(setExchanges)
      .catch(() => {});
  }, [userId]);

  const events = useMemo(() => {
    const soon = (d) => {
      const n = daysUntil(d);
      return n !== null && n >= 0 && n <= 60;
    };
    const out = [];
    for (const l of lists || []) if (!l.archived && soon(l.event_date)) out.push({ key: l.id, icon: <ListIcon list={l} size="sm" />, title: l.title, who: "Your list", date: l.event_date, to: `/lists/${l.id}` });
    for (const { follow, list: l } of follows || [])
      if (l && l.owner !== userId && soon(l.event_date))
        out.push({ key: `f${l.id}`, icon: <ListIcon list={l} size="sm" />, title: l.title, who: l.owner_name || "A friend", date: l.event_date, to: `/s/${follow.token}` });
    for (const x of exchanges)
      if (soon(x.event_date))
        out.push({ key: `x${x.id}`, icon: <span className="list-icon list-icon-sm santa-icon">🎅</span>, title: x.name, who: x.matchName ? `You have ${x.matchName}` : "Secret Santa", date: x.event_date, to: `/exchanges/${x.id}` });
    return out.sort((a, b) => daysUntil(a.date) - daysUntil(b.date)).slice(0, 8);
  }, [lists, follows, exchanges, userId]);

  if (!events.length) return null;
  return (
    <section className="coming-up">
      <div className="section-head">
        <h2>Coming up</h2>
      </div>
      <div className="coming-up-row">
        {events.map((ev) => {
          const n = daysUntil(ev.date);
          return (
            <Link key={ev.key} to={ev.to} className={`coming-up-card ${n <= 7 ? "is-soon" : ""}`}>
              <span className="coming-up-days">
                {n === 0 ? (
                  <strong className="display">Today</strong>
                ) : (
                  <>
                    <strong className="display">{n}</strong>
                    <span>{n === 1 ? "day" : "days"}</span>
                  </>
                )}
              </span>
              <span className="coming-up-body">
                <strong>{ev.title}</strong>
                <span className="muted small">
                  {ev.who} · {formatDate(ev.date)}
                </span>
              </span>
              {ev.icon}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const SORTS = {
  upcoming: { label: "Upcoming first", fn: (a, b) => upcomingKey(a) - upcomingKey(b) || b.created.localeCompare(a.created) },
  newest: { label: "Newest first", fn: (a, b) => b.created.localeCompare(a.created) },
  name: { label: "Name A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
};

// future dates first (soonest on top), then undated, then past
function upcomingKey(l) {
  const d = daysUntil(l.event_date);
  if (d === null) return 1e6;
  return d < 0 ? 2e6 - d : d;
}

function readSort() {
  try {
    return SORTS[localStorage.getItem("giftlist.listSort")] ? localStorage.getItem("giftlist.listSort") : "upcoming";
  } catch {
    return "upcoming";
  }
}

// Reminder for accounts that haven't clicked the link in their verification email yet
function VerifyBanner() {
  const { user, config, notify } = useApp();
  const [hidden, setHidden] = useState(false);
  const [sent, setSent] = useState(false);
  if (hidden || user.verified || !config.smtpEnabled) return null;

  const resend = async () => {
    try {
      await pb.collection("users").requestVerification(user.email);
      setSent(true);
    } catch (err) {
      notify(errorMessage(err, "send the verification email"), "error");
    }
  };

  return (
    <div className="verify-banner">
      <MailCheck size={20} />
      <div>
        {sent ? (
          <>
            <strong>New link sent to {user.email}.</strong>
            <span className="muted">Not there in a few minutes? Check your spam or junk folder and mark it “Not spam”.</span>
          </>
        ) : (
          <>
            <strong>Please confirm your email.</strong>
            <span className="muted">We sent a link to {user.email}. Can't find it? Check your spam or junk folder.</span>
          </>
        )}
      </div>
      {!sent && (
        <button className="btn btn-sm" onClick={resend}>
          Resend link
        </button>
      )}
      <button className="icon-btn icon-btn-sm" aria-label="Dismiss" title="Dismiss" onClick={() => setHidden(true)}>
        <X size={14} />
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { user, notify } = useApp();
  const navigate = useNavigate();
  const [lists, setLists] = useState(null);
  const [counts, setCounts] = useState({});
  const [follows, setFollows] = useState(null);
  const [form, setForm] = useState(null); // null | { list? }
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState(readSort);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [mine, items] = await Promise.all([
          pb.collection("lists").getFullList({ filter: pb.filter("owner = {:id}", { id: user.id }) }),
          pb.collection("items").getFullList({ filter: pb.filter("list.owner = {:id} && received = false", { id: user.id }), fields: "list" }),
        ]);
        if (!alive) return;
        const c = {};
        for (const it of items) c[it.list] = (c[it.list] || 0) + 1;
        setLists(mine);
        setCounts(c);
      } catch (err) {
        if (alive) setError(errorMessage(err, "load your lists"));
      }

      try {
        const fs = await pb.collection("follows").getFullList({ filter: pb.filter("user = {:id}", { id: user.id }), sort: "-updated", expand: "via_group" });
        const resolved = await Promise.all(
          fs.map(async (f) => {
            try {
              return { follow: f, list: await pb.collection("lists").getOne(f.list, shareHeaders(f.token)) };
            } catch {
              return { follow: f, list: null };
            }
          })
        );
        if (alive) setFollows(resolved);
      } catch {
        if (alive) setFollows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.id]);

  const changeSort = (s) => {
    setSort(s);
    try {
      localStorage.setItem("giftlist.listSort", s);
    } catch {
      /* ignore */
    }
  };

  const [activeLists, archivedLists, ideaBoards] = useMemo(() => {
    const sorted = [...(lists || [])].sort(SORTS[sort].fn);
    return [sorted.filter((l) => !l.archived && !l.private), sorted.filter((l) => l.archived && !l.private), sorted.filter((l) => l.private)];
  }, [lists, sort]);

  const newIdeasBoard = async () => {
    try {
      const l = await pb.collection("lists").create({ owner: user.id, title: "Ideas", occasion: "other", emoji: "💡", private: true });
      navigate(`/lists/${l.id}`);
    } catch (err) {
      notify(errorMessage(err, "create an ideas board"), "error");
    }
  };

  const replaceList = (l) => setLists((prev) => prev.map((x) => (x.id === l.id ? l : x)));

  const copyLink = async (l) => {
    try {
      await navigator.clipboard.writeText(shareUrl(l));
      notify("Share link copied");
    } catch {
      window.prompt("Copy this link:", shareUrl(l));
    }
  };

  const toggleArchive = async (l) => {
    try {
      replaceList(await pb.collection("lists").update(l.id, { archived: !l.archived }));
      notify(l.archived ? "List restored" : "List archived");
    } catch (err) {
      notify(errorMessage(err, l.archived ? "restore this list" : "archive this list"), "error");
    }
  };

  const dup = async (l) => {
    notify("Duplicating…");
    try {
      const copy = await duplicateList(l, user.id);
      navigate(`/lists/${copy.id}`);
    } catch (err) {
      notify(errorMessage(err, "duplicate this list"), "error");
    }
  };

  const remove = async (l) => {
    if (!confirm(`Delete "${l.title}" and all its gifts? This can't be undone.`)) return;
    try {
      await pb.collection("lists").delete(l.id);
      setLists((prev) => prev.filter((x) => x.id !== l.id));
      notify("List deleted");
    } catch (err) {
      notify(errorMessage(err, "delete this list"), "error");
    }
  };

  const unfollow = async (f) => {
    try {
      await pb.collection("follows").delete(f.id);
      setFollows((prev) => prev.filter((x) => x.follow.id !== f.id));
      notify("Removed from your dashboard");
    } catch (err) {
      notify(errorMessage(err, "remove this list from your dashboard"), "error");
    }
  };

  const menuFor = (l) => [
    { label: "Copy share link", icon: Link2, hidden: l.private, onClick: () => copyLink(l) },
    { label: "Settings", icon: Settings2, onClick: () => setForm({ list: l }) },
    { label: "Duplicate", icon: CopyPlus, onClick: () => dup(l) },
    { label: l.archived ? "Restore" : "Archive", icon: l.archived ? ArchiveRestore : Archive, hidden: l.private, onClick: () => toggleArchive(l) },
    { divider: true },
    { label: "Delete", icon: Trash2, danger: true, onClick: () => remove(l) },
  ];

  return (
    <div className="page">
      <div className="page-head dash-head">
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1>{(user.name || "").trim().split(/\s+/)[0] || "Welcome back"}</h1>
          <p className="muted">Your wish lists, and the ones friends have shared with you.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({})}>
          <Plus size={16} /> New list
        </button>
      </div>

      <VerifyBanner />
      {error && <div className="alert alert-error">{error}</div>}
      {lists !== null && <GettingStarted lists={lists.filter((l) => !l.private)} counts={counts} onNewList={() => setForm({})} />}
      <ComingUp lists={lists} follows={follows} userId={user.id} />

      <div className="section-head">
        <h2>
          My lists {activeLists.length > 0 && <span className="section-count">{activeLists.length}</span>}
        </h2>
        {activeLists.length > 1 && (
          <select className="select-sm" value={sort} onChange={(e) => changeSort(e.target.value)} aria-label="Sort lists">
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {lists === null ? (
        <div className="loading">Loading…</div>
      ) : activeLists.length === 0 ? (
        <button className="new-list-card" onClick={() => setForm({})}>
          <Plus size={22} />
          <span>
            <strong>Create your first list</strong>
            <span className="muted small">Christmas, birthday, wedding — anything.</span>
          </span>
        </button>
      ) : (
        <div className="list-grid">
          {activeLists.map((l) => (
            <ListCard key={l.id} list={l} to={`/lists/${l.id}`} meta={`${counts[l.id] || 0} gift${counts[l.id] === 1 ? "" : "s"}`} menu={menuFor(l)} />
          ))}
          <button className="new-list-card compact" onClick={() => setForm({})}>
            <Plus size={20} /> New list
          </button>
        </div>
      )}

      <div className="section-head">
        <h2>
          Saving for later <span className="section-note"><Lock size={13} /> only you</span>
        </h2>
      </div>
      {lists !== null &&
        (ideaBoards.length === 0 ? (
          <button className="new-list-card ideas-card" onClick={newIdeasBoard}>
            <Lightbulb size={22} />
            <span>
              <strong>Start a private ideas board</strong>
              <span className="muted small">Only you see it. Collect things you're thinking about, and move them to a real list when you're sure.</span>
            </span>
          </button>
        ) : (
          <div className="list-grid">
            {ideaBoards.map((l) => (
              <ListCard key={l.id} list={l} to={`/lists/${l.id}`} meta={`${counts[l.id] || 0} idea${counts[l.id] === 1 ? "" : "s"}`} menu={menuFor(l)} />
            ))}
            <button className="new-list-card compact" onClick={newIdeasBoard}>
              <Plus size={20} /> New ideas board
            </button>
          </div>
        ))}

      {archivedLists.length > 0 && (
        <>
          <button className="section-toggle" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Archived ({archivedLists.length})
          </button>
          {showArchived && (
            <div className="list-grid">
              {archivedLists.map((l) => (
                <ListCard key={l.id} list={l} to={`/lists/${l.id}`} meta={`${counts[l.id] || 0} gifts · archived`} menu={menuFor(l)} dim />
              ))}
            </div>
          )}
        </>
      )}

      <div className="section-head">
        <h2>
          Shared with me {follows?.length > 0 && <span className="section-count">{follows.length}</span>}
        </h2>
      </div>
      {follows === null ? (
        <div className="loading">Loading…</div>
      ) : follows.length === 0 ? (
        <div className="empty-hint">
          <span className="empty-hint-icon">💌</span>
          <p className="muted small">
            When a friend shares a list with you and you open the link while logged in, it shows up here. Or <Link to="/groups">make a group</Link> for your family, and everyone's lists show up automatically.
          </p>
        </div>
      ) : (
        <div className="list-grid">
          {follows.map(({ follow, list }) =>
            list ? (
              <ListCard
                key={follow.id}
                list={list}
                to={`/s/${follow.token}`}
                meta={`by ${list.owner_name || "a friend"}${follow.expand?.via_group ? ` · ${follow.expand.via_group.name}` : ""}`}
                menu={follow.via_group ? [{ label: "Open group", icon: Users, onClick: () => navigate(`/groups/${follow.via_group}`) }] : [{ label: "Remove from dashboard", icon: X, onClick: () => unfollow(follow) }]}
              />
            ) : (
              <div key={follow.id} className="list-card dim">
                <span className="list-icon list-icon-md">
                  <Lock size={20} />
                </span>
                <div className="list-card-body">
                  <h3>List unavailable</h3>
                  <p className="muted small">The owner deleted it or reset its share link. Ask them for the new link.</p>
                </div>
                <button className="icon-btn" title="Remove" aria-label="Remove" onClick={() => unfollow(follow)}>
                  <X size={16} />
                </button>
              </div>
            )
          )}
        </div>
      )}

      {form && (
        <ListForm
          list={form.list}
          onClose={() => setForm(null)}
          onSaved={(l) => {
            setForm(null);
            if (form.list) {
              replaceList(l);
              notify("List settings saved");
            } else navigate(`/lists/${l.id}`);
          }}
        />
      )}
    </div>
  );
}

export function ListCard({ list, to, meta, menu, dim }) {
  const o = occasion(list.occasion);
  const n = daysUntil(list.event_date);
  const color = listColor(list);
  const cover = coverProps(listCover(list, "600x200"), "list-card-banner");
  return (
    <div className={`list-card ${dim ? "dim" : ""}`} style={color ? { "--list-color": color } : undefined}>
      <Link to={to} className="list-card-link">
        {cover ? <span {...cover} aria-hidden="true" /> : <span className="list-card-banner plain" aria-hidden="true" />}
        <div className="list-card-body">
          <ListIcon list={list} />
          <h3>{list.title}</h3>
          <p className="muted small">
            {o.label}
            {list.event_date ? ` · ${formatDate(list.event_date)}` : ""}
          </p>
          <div className="list-card-meta">
            <span>{meta}</span>
            {n !== null && n >= 0 && <span className={`countdown ${n <= 7 ? "soon" : ""}`}>{countdown(list.event_date)}</span>}
          </div>
        </div>
      </Link>
      {menu && <Menu items={menu} className="list-card-menu" />}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
