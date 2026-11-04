import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Copy, LogOut, Pencil, Plus, RefreshCw, Share2, Trash2, UserMinus, Users } from "lucide-react";
import { CardsSkeleton, EmptyState } from "../components/Placeholders.jsx";
import Modal from "../components/Modal.jsx";
import { Avatar } from "../components/Layout.jsx";
import { Menu } from "../components/ui.jsx";
import { ListCard } from "./Dashboard.jsx";
import NotFound, { LoadError } from "./NotFound.jsx";
import { errorMessage, pb, shareHeaders } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";
import Emoji from "../components/Emoji.jsx";

export const inviteUrl = (g) => `${window.location.origin}/g/${g.invite_token}`;

async function copyInvite(g, notify) {
  const url = inviteUrl(g);
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title: g.name, text: `Join “${g.name}” on GiftMe so we can all see each other's wish lists`, url });
      return;
    } catch {
      /* cancelled: fall back to copying */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    notify("Invite link copied. Send it to everyone you want in the group.");
  } catch {
    window.prompt("Copy this invite link:", url);
  }
}

// /groups: family groups you're in
export default function Groups() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [groups, setGroups] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState("");
  const [form, setForm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([pb.collection("groups").getFullList({ sort: "name" }), pb.collection("group_members").getFullList({ fields: "group" })])
      .then(([gs, ms]) => {
        if (!alive) return;
        const c = {};
        for (const m of ms) c[m.group] = (c[m.group] || 0) + 1;
        setGroups(gs);
        setCounts(c);
      })
      .catch((err) => alive && setError(errorMessage(err, "load your groups")));
    return () => {
      alive = false;
    };
  }, [reloadKey, user.id]);

  if (error) return <LoadError message={error} onRetry={() => (setError(""), setReloadKey((k) => k + 1))} />;
  if (!groups) return <CardsSkeleton kind="lists" count={2} />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Groups</h1>
          <p className="muted">Make a group once, like your family, and everyone's wish lists show up for everyone. No more sending each list's link around.</p>
        </div>
        {groups.length > 0 && (
          <button className="btn btn-primary" onClick={() => setForm(true)}>
            <Plus size={16} /> New group
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState art="group" title="Start a group" text="Make one for your family or friends, send everyone the invite link, and everyone's wish lists show up for everyone.">
          <button className="btn btn-primary" onClick={() => setForm(true)}>
            <Plus size={16} /> New group
          </button>
        </EmptyState>
      ) : (
        <div className="list-grid">
          {groups.map((g) => (
            <div key={g.id} className="list-card">
              <Link to={`/groups/${g.id}`} className="list-card-link">
                <span className="list-card-banner plain" aria-hidden="true" />
                <div className="list-card-body">
                  <span className="list-icon list-icon-md"><Emoji e={g.emoji || "🏡"} /></span>
                  <h3>{g.name}</h3>
                  <p className="muted small">{g.owner === user.id ? "You made this group" : `Made by ${g.owner_name || "a friend"}`}</p>
                  <div className="list-card-meta">
                    <span>
                      {counts[g.id] || 1} {counts[g.id] === 1 ? "person" : "people"}
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {form && <GroupForm onClose={() => setForm(false)} onSaved={(g) => navigate(`/groups/${g.id}`)} />}
    </div>
  );
}

const EMOJIS = ["🏡", "👨‍👩‍👧‍👦", "🎄", "💼", "🎓", "⚽", "📚", "🎉"];

function GroupForm({ group, onClose, onSaved }) {
  const { user } = useApp();
  const [name, setName] = useState(group?.name || "");
  const [emoji, setEmoji] = useState(group?.emoji || "🏡");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: name.trim(), emoji };
      onSaved(group ? await pb.collection("groups").update(group.id, body) : await pb.collection("groups").create({ ...body, owner: user.id }));
    } catch (err) {
      setError(errorMessage(err, group ? "save the group" : "create the group"));
      setBusy(false);
    }
  };
  return (
    <Modal title={group ? "Edit group" : "New group"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus placeholder="e.g. Family" />
        </label>
        <div>
          <span className="label-text">Icon</span>
          <div className="emoji-picker">
            {EMOJIS.map((em) => (
              <button type="button" key={em} className={`emoji-opt ${em === emoji ? "active" : ""}`} onClick={() => setEmoji(em)} aria-label={em} aria-pressed={em === emoji}>
                <Emoji e={em} />
              </button>
            ))}
          </div>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {group ? "Save" : "Create group"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// /groups/:id
export function Group() {
  const { id } = useParams();
  const { user, notify } = useApp();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [lists, setLists] = useState(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(null); // the member you're about to remove

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [g, ms] = await Promise.all([pb.collection("groups").getOne(id), pb.collection("group_members").getFullList({ filter: pb.filter("group = {:g}", { g: id }), sort: "created" })]);
        if (!alive) return;
        setGroup(g);
        setMembers(ms);
        // the members' lists, as they appear on your dashboard
        const others = ms.map((m) => m.user).filter((u) => u !== user.id);
        const fs = await pb.collection("follows").getFullList({ filter: pb.filter("user = {:me}", { me: user.id }) });
        const rows = await Promise.all(
          fs.map(async (f) => {
            try {
              const l = await pb.collection("lists").getOne(f.list, shareHeaders(f.token));
              return others.includes(l.owner) && !l.archived ? { follow: f, list: l } : null;
            } catch {
              return null;
            }
          })
        );
        if (alive) setLists(rows.filter(Boolean));
      } catch (err) {
        if (!alive) return;
        if (err.status === 404) setMissing(true);
        else setError(errorMessage(err, "load this group"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, user.id]);

  if (missing) return <NotFound title="Group not found" message="This group doesn't exist anymore, or you're not in it." />;
  if (error) return <LoadError message={error} onRetry={() => window.location.reload()} />;
  if (!group) return <CardsSkeleton kind="lists" count={2} />;

  const mine = group.owner === user.id;
  const me = members.find((m) => m.user === user.id);

  const removeMember = async (m) => {
    setRemoving(null);
    try {
      await pb.collection("group_members").delete(m.id);
      setMembers((ms) => ms.filter((x) => x.id !== m.id));
      setLists((ls) => ls?.filter((r) => r.list.owner !== m.user));
      notify(`${m.name || "They"} removed from the group`);
    } catch (err) {
      notify(errorMessage(err, "remove them"), "error");
    }
  };
  const leave = async () => {
    if (!confirm(`Leave “${group.name}”? Its members' lists leave your dashboard (unless another group or a share link keeps them), and yours leave theirs.`)) return;
    try {
      await pb.collection("group_members").delete(me.id);
      notify(`You left “${group.name}”`);
      navigate("/groups");
    } catch (err) {
      notify(errorMessage(err, "leave the group"), "error");
    }
  };
  const remove = async () => {
    if (!confirm(`Delete “${group.name}”? Everyone stays on ${window.location.host}, but the lists the group shared leave everyone's dashboards.`)) return;
    try {
      await pb.collection("groups").delete(group.id);
      notify("Group deleted");
      navigate("/groups");
    } catch (err) {
      notify(errorMessage(err, "delete the group"), "error");
    }
  };
  const resetInvite = async () => {
    if (!confirm("Make a new invite link? The old one stops working. People already in the group stay in.")) return;
    try {
      const r = await pb.send(`/api/giftlist/groups/${group.id}/reset-invite`, { method: "POST" });
      setGroup((g) => ({ ...g, invite_token: r.invite_token }));
      notify("New invite link ready");
    } catch (err) {
      notify(errorMessage(err, "make a new invite link"), "error");
    }
  };

  const menu = mine
    ? [
        { label: "Edit name and icon", icon: Pencil, onClick: () => setEditing(true) },
        { label: "New invite link", icon: RefreshCw, onClick: resetInvite },
        { divider: true },
        { label: "Delete group", icon: Trash2, danger: true, onClick: remove },
      ]
    : [{ label: "Leave group", icon: LogOut, danger: true, onClick: leave }];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link to="/groups">Groups</Link>
          </p>
          <h1>
            <Emoji e={group.emoji || "🏡"} /> {group.name}
          </h1>
          <p className="muted">Everyone here sees everyone's wish lists, including new ones. Private ideas boards stay private.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setInviting(true)}>
            <Share2 size={16} /> Invite people
          </button>
          <Menu items={menu} />
        </div>
      </div>

      <div className="section-head">
        <h2>
          People <span className="section-count">{members.length}</span>
        </h2>
      </div>
      <ul className="member-list">
        {members.map((m) => (
          <li key={m.id}>
            <Avatar user={{ name: m.name, email_hash: m.email_hash }} size={36} />
            <span className="member-name">
              {m.name || "Someone"}
              {m.user === user.id && <span className="badge">you</span>}
              {m.user === group.owner && <span className="badge">made the group</span>}
            </span>
            {mine && m.user !== user.id && <Menu label={`Options for ${m.name || "this person"}`} items={[{ label: "Remove from group", icon: UserMinus, danger: true, onClick: () => setRemoving(m) }]} />}
          </li>
        ))}
      </ul>
      {members.length === 1 && (
        <div className="empty-hint">
          <span className="empty-hint-icon">
            <Users size={22} />
          </span>
          <p className="muted small">It's just you so far. Send the invite link to your family or friends.</p>
        </div>
      )}

      <div className="section-head">
        <h2>Their lists {lists?.length > 0 && <span className="section-count">{lists.length}</span>}</h2>
      </div>
      {lists === null ? (
        <div className="loading">Loading…</div>
      ) : lists.length === 0 ? (
        <p className="muted small">{members.length > 1 ? "Nobody else here has a list yet. They'll show up as soon as someone makes one." : "Lists show up here once people join."}</p>
      ) : (
        <div className="list-grid">
          {lists.map(({ follow, list }) => (
            <ListCard key={follow.id} list={list} to={`/s/${follow.token}`} meta={`by ${list.owner_name || "a friend"}`} />
          ))}
        </div>
      )}

      {inviting && (
        <Modal title={`Invite people to ${group.name}`} onClose={() => setInviting(false)}>
          <div className="form">
            <p className="muted small">Send this link to everyone you want in the group. When they join, everyone's wish lists show up for everyone.</p>
            <div className="invite-row">
              <input readOnly value={inviteUrl(group)} onFocus={(e) => e.target.select()} aria-label="Invite link" />
              <button className="btn btn-primary" onClick={() => copyInvite(group, notify)}>
                <Copy size={15} /> {navigator.share && matchMedia("(pointer: coarse)").matches ? "Share" : "Copy"}
              </button>
            </div>
            <p className="muted small">Anyone with this link can join. {mine ? "If it ends up in the wrong hands, make a new one from the ⋯ menu." : ""}</p>
          </div>
        </Modal>
      )}
      {removing && (
        <Modal title={`Remove ${removing.name || "this person"}?`} onClose={() => setRemoving(null)}>
          <div className="form">
            <p>
              {removing.name || "They"} will leave “{group.name}”. Their lists leave your dashboards, and yours leave theirs. You can invite them again later.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => removeMember(removing)}>
                <UserMinus size={15} /> Remove from group
              </button>
            </div>
          </div>
        </Modal>
      )}
      {editing && (
        <GroupForm

          group={group}
          onClose={() => setEditing(false)}
          onSaved={(g) => {
            setGroup(g);
            setEditing(false);
            notify("Group saved");
          }}
        />
      )}
    </div>
  );
}

// /g/:token, the invite link
export function JoinGroup() {
  const { token } = useParams();
  const { user, notify } = useApp();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pb.send(`/api/giftlist/groups/invite/${token}`)
      .then(setInfo)
      .catch((err) => setError(errorMessage(err, "open this invite")));
  }, [token, user?.id]);

  if (error) {
    return (
      <div className="auth-card card">
        <h1>Can't open this invite</h1>
        <p className="muted">{error}</p>
        <Link className="btn btn-primary btn-block" to="/">
          Go to your lists
        </Link>
      </div>
    );
  }
  if (!info) return <div className="loading">Loading…</div>;
  if (info.member && info.id) return <Navigate to={`/groups/${info.id}`} replace />;

  const join = async () => {
    setBusy(true);
    try {
      const r = await pb.send("/api/giftlist/groups/join", { method: "POST", body: { token } });
      notify(`You're in “${info.name}”. Everyone's lists are on your dashboard now.`);
      navigate(`/groups/${r.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "join the group"));
      setBusy(false);
    }
  };
  const others = info.members - info.names.length;

  return (
    <div className="auth-card card join-card">
      <div className="join-icon"><Emoji e={info.emoji || "🏡"} /></div>
      <p className="eyebrow">Group invite</p>
      <h1>{info.name}</h1>
      <p className="muted">
        <strong>{info.owner_name || "Someone"}</strong> invited you to a group. Everyone in it can see each other's wish lists, so nobody has to send links around.
      </p>
      <ul className="join-facts">
        <li>
          <Users size={15} /> {info.names.join(", ")}
          {others > 0 ? ` and ${others} more` : ""}
        </li>
      </ul>
      {user ? (
        <button className="btn btn-primary btn-block" onClick={join} disabled={busy}>
          {busy ? "Joining…" : `Join ${info.name}`}
        </button>
      ) : (
        <div className="form">
          <Link className="btn btn-primary btn-block" to={`/register?next=${encodeURIComponent(`/g/${token}`)}`}>
            Create an account to join
          </Link>
          <Link className="btn btn-ghost btn-block" to={`/login?next=${encodeURIComponent(`/g/${token}`)}`}>
            I already have an account
          </Link>
        </div>
      )}
      <p className="muted small">Your private ideas boards are never shared, and reservations stay a surprise.</p>
    </div>
  );
}
