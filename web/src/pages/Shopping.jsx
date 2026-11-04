import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Download, ExternalLink, HandCoins, RefreshCw, X } from "lucide-react";
import { ListIcon } from "../components/ListHeader.jsx";
import { LoadError } from "./NotFound.jsx";
import { errorMessage, itemImage, pb, shareHeaders } from "../lib/pb.js";
import { countdown, daysUntil, formatDate, formatPrice, holdEndsSoon, holdLabel, holdPeriod, hostname, renewReservation, reservationExpired } from "../lib/format.js";
import { downloadCsv, slugDate } from "../lib/listActions.js";
import { useApp } from "../lib/app.jsx";

// Everything the current user has reserved, across all lists shared with them.
export default function Shopping() {
  const { user, config, notify } = useApp();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [hideBought, setHideBought] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const follows = await pb.collection("follows").getFullList({ filter: pb.filter("user = {:id}", { id: user.id }) });
        const out = await Promise.all(
          follows.map(async (f) => {
            const opts = shareHeaders(f.token);
            try {
              const [list, res, pls] = await Promise.all([
                pb.collection("lists").getOne(f.list, opts),
                pb.collection("reservations").getFullList({
                  ...opts,
                  filter: pb.filter("user = {:u} && item.list = {:l}", { u: user.id, l: f.list }),
                  expand: "item",
                }),
                // every pledge on the list, so group gifts can show how far along they are
                pb.collection("pledges").getFullList({ ...opts, filter: pb.filter("item.list = {:l}", { l: f.list }), expand: "item" }),
              ]);
              const mine = pls.filter((p) => p.user === user.id && p.expand?.item);
              const groupGifts = mine.map((p) => ({ pledge: p, item: p.expand.item, all: pls.filter((x) => x.item === p.item) }));
              return { list, token: f.token, reservations: res.filter((r) => r.expand?.item && !reservationExpired(r)), groupGifts };
            } catch {
              return null; // list deleted or link reset
            }
          })
        );
        if (!alive) return;
        const withItems = out.filter((g) => g && (g.reservations.length || g.groupGifts.length));
        // soonest event first, undated last
        withItems.sort((a, b) => (daysUntil(a.list.event_date) ?? 1e9) - (daysUntil(b.list.event_date) ?? 1e9));
        setGroups(withItems);
      } catch (err) {
        if (alive) setError(errorMessage(err, "load your shopping list"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.id, reloadKey]);

  const totals = useMemo(() => {
    const t = {};
    for (const g of groups || []) {
      const cur = g.list.currency || config.currency;
      t[cur] ??= { all: 0, bought: 0, count: 0, boughtCount: 0 };
      for (const r of g.reservations) {
        const it = r.expand.item;
        const p = g.list.hide_prices ? 0 : (it.price || 0) * (it.quantity || 1);
        t[cur].all += p;
        t[cur].count += 1;
        if (r.purchased) {
          t[cur].bought += p;
          t[cur].boughtCount += 1;
        }
      }
    }
    return t;
  }, [groups, config.currency]);

  if (error)
    return (
      <LoadError
        message={error}
        onRetry={() => {
          setError("");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  if (!groups) return <div className="loading">Loading…</div>;

  const update = (g, saved) =>
    setGroups((prev) => prev.map((x) => (x === g ? { ...x, reservations: x.reservations.map((r) => (r.id === saved.id ? { ...saved, expand: r.expand } : r)) } : x)));

  const togglePurchased = async (g, r) => {
    try {
      const saved = await pb.collection("reservations").update(r.id, { purchased: !r.purchased }, shareHeaders(g.token));
      update(g, saved);
    } catch (err) {
      notify(errorMessage(err, "update this gift"), "error");
    }
  };

  const renew = async (g, r) => {
    try {
      update(g, await renewReservation(pb, r));
      notify(`Renewed “${r.expand.item.name}” for another ${holdPeriod(config.reservationDays).replace(/^an? /, "")}`);
    } catch (err) {
      notify(errorMessage(err, "renew this reservation"), "error");
    }
  };

  const leaveGroup = async (g, gg) => {
    if (!confirm(`Stop chipping in on “${gg.item.name}”? The others will see you've left.`)) return;
    try {
      await pb.collection("pledges").delete(gg.pledge.id, shareHeaders(g.token));
      setGroups((prev) =>
        prev.map((x) => (x === g ? { ...x, groupGifts: x.groupGifts.filter((y) => y !== gg) } : x)).filter((x) => x.reservations.length || x.groupGifts.length)
      );
      notify("You've left the group gift");
    } catch (err) {
      notify(errorMessage(err, "leave this group gift"), "error");
    }
  };

  const cancel = async (g, r) => {
    if (!confirm(`Cancel your reservation for “${r.expand.item.name}”? Someone else will be able to reserve it.`)) return;
    try {
      await pb.collection("reservations").delete(r.id, shareHeaders(g.token));
      setGroups((prev) =>
        prev.map((x) => (x === g ? { ...x, reservations: x.reservations.filter((y) => y.id !== r.id) } : x)).filter((x) => x.reservations.length || x.groupGifts.length)
      );
      notify("Reservation cancelled");
    } catch (err) {
      notify(errorMessage(err, "cancel this reservation"), "error");
    }
  };

  const exportCsv = () => {
    const rows = [["For", "List", "Gift", "Price", "Quantity", "Size", "Color", "Link", "Bought"]];
    for (const g of groups)
      for (const r of g.reservations) {
        const it = r.expand.item;
        rows.push([g.list.owner_name, g.list.title, it.name, g.list.hide_prices ? "" : it.price || "", it.quantity || 1, it.size, it.color, it.url, r.purchased ? "yes" : ""]);
      }
    downloadCsv(`shopping-list-${slugDate()}.csv`, rows);
  };

  const count = groups.reduce((n, g) => n + g.reservations.length + g.groupGifts.length, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Shopping list</h1>
          <p className="muted">Gifts you've reserved on friends' lists. Reservations last {holdPeriod(config.reservationDays)}: renew them, or tick them off once bought and they stay yours.</p>
        </div>
        {count > 0 && (
          <button className="btn btn-secondary" onClick={exportCsv}>
            <Download size={16} /> Export
          </button>
        )}
      </div>

      {count === 0 ? (
        <div className="empty">
          <div className="empty-icon">🛍️</div>
          <h3>Nothing reserved yet</h3>
          <p className="muted">When you open a friend's list and click “I'll get this”, the gift shows up here.</p>
          <Link to="/" className="btn btn-primary">
            Go to your dashboard
          </Link>
        </div>
      ) : (
        <>
          <div className="stats">
            {Object.entries(totals).map(([cur, t]) => (
              <div key={cur} className="stat">
                <span className="stat-label">Progress{Object.keys(totals).length > 1 ? ` (${cur})` : ""}</span>
                <span className="stat-value">
                  {t.boughtCount}/{t.count} bought
                </span>
                <div className="progress">
                  <span style={{ width: `${t.count ? (t.boughtCount / t.count) * 100 : 0}%` }} />
                </div>
                {t.all > 0 && (
                  <span className="muted small">
                    {formatPrice(t.bought, cur, { showZero: true })} of {formatPrice(t.all, cur)} spent
                  </span>
                )}
              </div>
            ))}
            <label className="toggle stat-toggle">
              <input type="checkbox" checked={hideBought} onChange={(e) => setHideBought(e.target.checked)} /> Hide bought
            </label>
          </div>

          {groups.map((g) => {
            const cur = g.list.currency || config.currency;
            const rows = hideBought ? g.reservations.filter((r) => !r.purchased) : g.reservations;
            if (!rows.length && !g.groupGifts.length) return null;
            const cd = countdown(g.list.event_date);
            return (
              <section key={g.list.id} className="shop-group">
                <div className="shop-group-head">
                  <ListIcon list={g.list} size="sm" />
                  <div className="shop-group-title">
                    <strong>For {g.list.owner_name || "a friend"}</strong>
                    <span className="muted small">
                      {g.list.title}
                      {g.list.event_date && ` · ${formatDate(g.list.event_date)}`}
                      {cd && cd !== "Past" && <span className="countdown">{cd}</span>}
                    </span>
                  </div>
                  <Link to={`/s/${g.token}`} className="btn btn-ghost btn-sm">
                    View list <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="shop-rows">
                  {rows.map((r) => {
                    const it = r.expand.item;
                    const img = itemImage(it, "100x100f");
                    const price = g.list.hide_prices ? "" : formatPrice((it.price || 0) * (it.quantity || 1), cur);
                    return (
                      <div key={r.id} className={`shop-row ${r.purchased ? "done" : ""}`}>
                        <label className="check">
                          <input type="checkbox" checked={!!r.purchased} onChange={() => togglePurchased(g, r)} aria-label={`Bought ${it.name}`} />
                          <span className="check-box" />
                        </label>
                        <span className="shop-thumb">{img ? <img src={img} alt="" referrerPolicy="no-referrer" /> : "🎁"}</span>
                        <div className="shop-info">
                          <span className="shop-name">{it.name}</span>
                          <span className="muted small">
                            {[it.size && `Size ${it.size}`, it.color, it.quantity > 1 && `× ${it.quantity}`].filter(Boolean).join(" · ")}
                            {it.url && (
                              <a href={it.url} target="_blank" rel="noopener noreferrer nofollow" className="shop-link">
                                <ExternalLink size={12} /> {hostname(it.url)}
                              </a>
                            )}
                          </span>
                          {!r.purchased && r.expires && (
                            <span className={`shop-hold small ${holdEndsSoon(r) ? "soon" : ""}`}>
                              <Clock size={12} /> {holdLabel(r)}
                              <button className="link-btn" onClick={() => renew(g, r)}>
                                <RefreshCw size={12} /> Renew
                              </button>
                            </span>
                          )}
                        </div>
                        {price && <span className="shop-price">{price}</span>}
                        <button className="icon-btn" title="Cancel reservation" aria-label={`Cancel reservation for ${it.name}`} onClick={() => cancel(g, r)}>
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                  {g.groupGifts.map((gg) => {
                    const it = gg.item;
                    const img = itemImage(it, "100x100f");
                    const target = (it.price || 0) * (it.quantity || 1);
                    const total = gg.all.reduce((n, p) => n + (p.amount || 0), 0);
                    const others = gg.all.length - 1;
                    const money = !g.list.hide_prices;
                    return (
                      <div key={gg.pledge.id} className="shop-row">
                        <span className="check-spacer" title="Group gift">
                          <HandCoins size={18} />
                        </span>
                        <span className="shop-thumb">{img ? <img src={img} alt="" referrerPolicy="no-referrer" /> : "🎁"}</span>
                        <div className="shop-info">
                          <span className="shop-name">{it.name}</span>
                          <span className="muted small">
                            Chipping in{others > 0 ? ` with ${others} other${others === 1 ? "" : "s"}` : " (just you so far)"}
                            {money && target > 0 && ` · ${formatPrice(total, cur, { showZero: true })} of ${formatPrice(target, cur)}${total >= target ? " covered 🎉" : ""}`}
                          </span>
                        </div>
                        {money && gg.pledge.amount > 0 && <span className="shop-price">{formatPrice(gg.pledge.amount, cur)}</span>}
                        <button className="icon-btn" title="Leave this group gift" aria-label={`Leave the group gift for ${it.name}`} onClick={() => leaveGroup(g, gg)}>
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
