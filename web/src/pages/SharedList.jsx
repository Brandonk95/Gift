import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Bell, BellRing, Check, Clock, Gift, HandCoins, Pencil, Printer, RefreshCw, ShoppingBag, Undo2, X } from "lucide-react";
import ItemCard from "../components/ItemCard.jsx";
import ItemsGrid from "../components/ItemsGrid.jsx";
import ChipIn, { pledgeSummary } from "../components/ChipIn.jsx";
import GuestReserve from "../components/GuestReserve.jsx";
import Questions from "../components/Questions.jsx";
import ListHeader from "../components/ListHeader.jsx";
import { useItemFilters } from "../components/ItemFilters.jsx";
import { Menu } from "../components/ui.jsx";
import Emoji from "../components/Emoji.jsx";
import NotFound, { LoadError } from "./NotFound.jsx";
import { errorMessage, pb, shareHeaders } from "../lib/pb.js";
import { formatDate, formatPrice, holdEndsSoon, holdLabel, holdPeriod, occasion, renewReservation, reservationExpired } from "../lib/format.js";
import { useApp } from "../lib/app.jsx";
import { overBudget, santaFor, useMyMatches } from "../lib/santa.js";
import { CardsSkeleton, EmptyState } from "../components/Placeholders.jsx";

export default function SharedList() {
  const { token } = useParams();
  const { user, config, notify, undoable } = useApp();
  const loc = useLocation();
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [pledges, setPledges] = useState([]);
  const [chipFor, setChipFor] = useState(null);
  const [guestFor, setGuestFor] = useState(null); // { item, chip }: a signed-out friend confirming their email first
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busyItem, setBusyItem] = useState(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [follow, setFollow] = useState(null);
  const [followBusy, setFollowBusy] = useState(false);
  const matches = useMyMatches(user?.id);

  const opts = useMemo(() => shareHeaders(token), [token]);
  // testers (set in the admin dashboard) see their own lists the way friends do
  const ownList = !!(user && list && list.owner === user.id);
  const isOwner = ownList && !user.tester;
  const nextParam = encodeURIComponent(loc.pathname);

  const loadReservations = useCallback(
    async (listId) => {
      const filter = pb.filter("item.list = {:id}", { id: listId });
      const [rs, ps] = await Promise.all([pb.collection("reservations").getFullList({ ...opts, filter }), pb.collection("pledges").getFullList({ ...opts, filter })]);
      setReservations(rs.filter((r) => !reservationExpired(r)));
      setPledges(ps);
    },
    [opts]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const l = await pb.collection("lists").getFirstListItem(pb.filter("share_token = {:t}", { t: token }), opts);
        const [its, cats] = await Promise.all([
          pb.collection("items").getFullList({ ...opts, filter: pb.filter("list = {:id}", { id: l.id }) }),
          pb.collection("categories").getFullList({ filter: pb.filter('owner = "" || owner = {:o}', { o: l.owner }) }),
        ]);
        if (!alive) return;
        setList(l);
        setItems(its);
        setCategories(cats);
        if (!user || l.owner !== user.id || user.tester) await loadReservations(l.id);
      } catch (err) {
        if (!alive) return;
        if (err.status === 404) setMissing(true);
        else setLoadError(errorMessage(err, "load this gift list"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, opts, user?.id, loadReservations, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember lists a logged-in friend has opened so they show on their dashboard.
  useEffect(() => {
    if (!user || !list || (list.owner === user.id && !user.tester)) return;
    (async () => {
      try {
        const existing = await pb
          .collection("follows")
          .getFirstListItem(pb.filter("user = {:u} && list = {:l}", { u: user.id, l: list.id }))
          .catch(() => null);
        if (!existing) setFollow(await pb.collection("follows").create({ user: user.id, list: list.id, token }));
        else if (existing.token !== token) setFollow(await pb.collection("follows").update(existing.id, { token }));
        else setFollow(existing);
      } catch {
        /* not critical */
      }
    })();
  }, [user?.id, user?.tester, list, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const resByItem = useMemo(() => Object.fromEntries(reservations.map((r) => [r.item, r])), [reservations]);
  const pledgesByItem = useMemo(() => {
    const m = {};
    for (const p of pledges) (m[p.item] ||= []).push(p);
    return m;
  }, [pledges]);
  // taken = reserved by someone, or a group gift that's fully covered
  const isTaken = (i) => !!resByItem[i.id] || (pledgesByItem[i.id] && pledgeSummary(i, pledgesByItem[i.id]).funded);
  // gifts the owner already received are hidden from friends
  const wanted = useMemo(() => items.filter((i) => !i.received), [items]);
  const shown = useMemo(() => (onlyAvailable ? wanted.filter((i) => !isTaken(i)) : wanted), [wanted, onlyAvailable, resByItem, pledgesByItem]); // eslint-disable-line react-hooks/exhaustive-deps
  const hidePrice = !!list?.hide_prices && !isOwner;
  const { visible, toolbar, view, filtering, clear } = useItemFilters(shown, categoryMap, { hidePrice, defaultSort: "custom", friendView: list?.friend_view || "" });

  if (missing) {
    return <NotFound title="This link doesn't work" message="The list may have been deleted, or the owner created a new share link. Ask them for the current link." />;
  }
  if (loadError)
    return (
      <LoadError
        message={loadError}
        onRetry={() => {
          setLoadError("");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  if (!list) return <CardsSkeleton header />;

  const currency = list.currency || config.currency;
  const ownerName = list.owner_name || "The list owner";

  // uid: passed right after an email-code sign-in, before `user` has updated
  const reserve = async (item, uid = user?.id) => {
    setBusyItem(item.id);
    try {
      await pb.collection("reservations").create({ item: item.id, user: uid }, opts);
      notify(config.smtpEnabled ? "Reserved! It's on your shopping list, and we emailed you a reminder (check spam if you don't see it) 🎉" : "Reserved! It's on your shopping list 🎉");
    } catch (err) {
      const ruleRejected = err.status === 400 && !Object.keys(err.response?.data || {}).length;
      notify(
        ruleRejected
          ? `Couldn't reserve “${item.name}”. The owner may have removed it or reset the share link. Refresh the page — if it still fails, ask ${ownerName} for their current link.`
          : errorMessage(err, `reserve “${item.name}”`),
        "error"
      );
    } finally {
      await loadReservations(list.id).catch(() => {});
      setBusyItem(null);
    }
  };

  const unreserve = (r) =>
    undoable({
      message: "Released. Someone else can get it now.",
      hide: () => setReservations((prev) => prev.filter((x) => x.id !== r.id)),
      restore: () => setReservations((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r])),
      commit: () => pb.collection("reservations").delete(r.id, opts).finally(() => loadReservations(list.id).catch(() => {})),
      failMessage: "Couldn't release that gift. It's still yours.",
    });

  const togglePurchased = async (r) => {
    try {
      const saved = await pb.collection("reservations").update(r.id, { purchased: !r.purchased }, opts);
      setReservations((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    } catch (err) {
      notify(errorMessage(err, "update your reservation"), "error");
    }
  };

  const renew = async (r) => {
    try {
      const saved = await renewReservation(pb, r);
      setReservations((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      notify(`Renewed. It's yours for another ${holdPeriod(config.reservationDays).replace(/^an? /, "")} 🎁`);
    } catch (err) {
      notify(errorMessage(err, "renew your reservation"), "error");
      await loadReservations(list.id).catch(() => {});
    }
  };

  // Follow = a nightly email listing the gifts added that day
  const toggleFollow = async () => {
    if (!follow) return;
    setFollowBusy(true);
    try {
      const saved = await pb.collection("follows").update(follow.id, { notify: !follow.notify });
      setFollow(saved);
      notify(
        saved.notify
          ? `Following! When ${list.owner_name || "they"} add gifts, you'll get one email that night with everything new.${config.smtpEnabled ? " Check spam if it doesn't show up." : ""}`
          : "Unfollowed. No more emails about this list."
      );
    } catch (err) {
      notify(errorMessage(err, follow.notify ? "unfollow this list" : "follow this list"), "error");
    } finally {
      setFollowBusy(false);
    }
  };

  const reservedCount = wanted.filter((i) => resByItem[i.id] || pledgesByItem[i.id]).length;
  // you're this person's Secret Santa: show the budget and which gifts fit it
  const santa = !isOwner && !hidePrice ? santaFor(matches, list.owner) : null;
  const santaBudget = santa?.budget > 0 ? formatPrice(santa.budget, santa.currency || currency) : "";
  const firstName = (list.owner_name || "").trim().split(/\s+/)[0];
  const titleNamesOwner = firstName && list.title.toLowerCase().includes(firstName.toLowerCase());
  const mine = [...reservations, ...pledges].filter((r) => user && r.user === user.id);

  return (
    <div className="page">
      <ListHeader
        list={list}
        eyebrow={titleNamesOwner || !list.owner_name ? occasion(list.occasion).label : `${occasion(list.occasion).label} · ${list.owner_name}`}
        meta={
          !isOwner && (
            <span className="meta-item">
              <Gift size={15} /> {wanted.length} gift{wanted.length === 1 ? "" : "s"} · {reservedCount} reserved
              {mine.length > 0 && ` · ${mine.length} by you`}
            </span>
          )
        }
        actions={
          <>
            {config.smtpEnabled && !isOwner &&
              (user ? (
                <button
                  className={`btn ${follow?.notify ? "btn-secondary" : "btn-primary"}`}
                  onClick={toggleFollow}
                  disabled={!follow || followBusy}
                  title={follow?.notify ? "Stop the emails about new gifts" : "Get one email each night when new gifts are added"}
                  aria-pressed={!!follow?.notify}
                >
                  {follow?.notify ? <BellRing size={16} /> : <Bell size={16} />} {follow?.notify ? "Following" : "Follow"}
                </button>
              ) : (
                <Link to={`/login?next=${nextParam}`} className="btn btn-secondary" title="Log in to get an email when new gifts are added">
                  <Bell size={16} /> Follow
                </Link>
              ))}
            {mine.length > 0 && (
              <Link to="/shopping" className="btn btn-secondary">
                <ShoppingBag size={16} /> My shopping list
              </Link>
            )}
            <Menu items={[{ label: "Print this list", icon: Printer, onClick: () => window.print() }]} />
          </>
        }
      />

      {isOwner ? (
        <div className="banner">
          👀 This is how friends see your list. Reservations are hidden from you.{" "}
          <Link to={`/lists/${list.id}`}>
            <Pencil size={13} /> Edit list
          </Link>
        </div>
      ) : ownList ? (
        <div className="banner">
          🧪 Tester view: this is exactly what friends see, reservations included. Reservations you make here are real, so cancel them when you're done.{" "}
          <Link to={`/lists/${list.id}`}>
            <Pencil size={13} /> Edit list
          </Link>
        </div>
      ) : !user ? (
        <div className="banner">
          {config.smtpEnabled ? (
            <>
              <Gift size={16} /> Want to get one of these? Press <strong>I'll get this</strong>, and confirm with a code we email you. No account or password needed.{" "}
              {list.owner_name || "They"} won't see who reserved what. Have an account? <Link to={`/login?next=${nextParam}`}>Log in</Link>
            </>
          ) : (
            <>
              <Gift size={16} /> Want to get one of these? <Link to={`/login?next=${nextParam}`}>Log in</Link> or <Link to={`/register?next=${nextParam}`}>create a free account</Link> to
              reserve a gift. {list.owner_name || "They"} won't see who reserved what.
            </>
          )}
        </div>
      ) : santa ? (
        <div className="banner santa-banner">
          <Emoji e="🎅" /> You're {firstName || ownerName}'s Secret Santa for <strong>{santa.name}</strong>
          {santaBudget && (
            <>
              {" "}
              · budget {santaBudget}. Gifts that fit are marked <span className="chip-static fits-budget">Fits budget</span>
            </>
          )}
        </div>
      ) : (
        <p className="hint-line">🤫 Reserve a gift so nobody else buys it. Reservations last {holdPeriod(config.reservationDays)} (renew them or mark them bought to keep them). {ownerName} can't see reservations.</p>
      )}

      <div className="toolbar">
        {toolbar}
        {!isOwner && wanted.length > 0 && (
          <label className="toggle">
            <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} /> Only show available
          </label>
        )}
      </div>

      {wanted.length === 0 ? (
        <EmptyState art="gift" title="Nothing here yet" text={`${list.owner_name || "They"} hasn't added any gifts. Check back later.`} />
      ) : visible.length === 0 ? (
        <div className="empty empty-sm">
          <p className="muted">{filtering ? "No gifts match your search." : "Everything has been reserved. 🎉"}</p>
          {filtering && (
            <button className="btn btn-secondary btn-sm" onClick={clear}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ItemsGrid view={view}>
          {visible.map((it) => {
            const r = resByItem[it.id];
            const byMe = r && user && r.user === user.id;
            const ps = pledgesByItem[it.id];
            const group = ps ? pledgeSummary(it, ps, user?.id) : null;
            const groupLabel = group
              ? group.target && !hidePrice
                ? `${group.funded ? "Covered" : "Chipping in"} · ${formatPrice(group.total, currency, { showZero: true })} of ${formatPrice(group.target, currency)}`
                : `${group.count} chipping in`
              : "";
            const status = isOwner
              ? null
              : byMe
                ? { kind: "mine", label: r.purchased ? "You bought this" : holdEndsSoon(r) ? `You're getting this · ${holdLabel(r).toLowerCase()}` : "You're getting this" }
                : r
                  ? { kind: "taken", label: list.hide_reservers || !r.reserver_name ? "Reserved" : `Reserved by ${r.reserver_name}` }
                  : group
                    ? { kind: group.mine ? "mine" : group.funded ? "taken" : "group", label: groupLabel }
                    : null;
            const chipButton = (label) => (
              <button className="btn btn-secondary btn-sm" onClick={() => setChipFor(it)} title="Split this gift with other friends">
                <HandCoins size={14} /> {label}
              </button>
            );
            return (
              <ItemCard
                key={it.id}
                item={it}
                view={view}
                category={categoryMap[it.category]}
                currency={currency}
                hidePrice={hidePrice}
                status={status}
                badge={
                  santa?.budget > 0 && it.price > 0 && !r ? (
                    overBudget(santa, it.price) ? null : <span className="chip-static fits-budget">Fits budget</span>
                  ) : null
                }
              >
                {isOwner ? null : byMe ? (
                  <>
                    {holdEndsSoon(r) && (
                      <button className="btn btn-sm btn-ghost" onClick={() => renew(r)} title={`Keep this reservation for another ${holdPeriod(config.reservationDays).replace(/^an? /, "")}`}>
                        <RefreshCw size={14} /> Renew
                      </button>
                    )}
                    <button className={`btn btn-sm ${r.purchased ? "btn-success" : "btn-secondary"}`} onClick={() => togglePurchased(r)} title="Track whether you've bought it">
                      {r.purchased ? <Check size={14} /> : <ShoppingBag size={14} />} {r.purchased ? "Bought" : "Mark bought"}
                    </button>
                    <Menu
                      items={[
                        { label: r.purchased ? "Mark as not bought" : "Mark as bought", icon: r.purchased ? Undo2 : Check, onClick: () => togglePurchased(r) },
                        ...(r.purchased ? [] : [{ label: `Keep another ${holdPeriod(config.reservationDays).replace(/^an? /, "")} (${holdLabel(r).toLowerCase()})`, icon: Clock, onClick: () => renew(r) }]),
                        { label: "Release (someone else can get it)", icon: X, danger: true, onClick: () => unreserve(r) },
                      ]}
                    />
                  </>
                ) : r ? null : group && user ? (
                  group.mine ? chipButton(group.mine.amount && !hidePrice ? `Your share: ${formatPrice(group.mine.amount, currency)}` : "You're chipping in") : !group.funded && chipButton("Chip in")
                ) : group && config.smtpEnabled ? (
                  !group.funded && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setGuestFor({ item: it, chip: true })}>
                      <HandCoins size={14} /> Chip in
                    </button>
                  )
                ) : user ? (
                  <>
                    <button className="btn btn-primary btn-sm" disabled={busyItem === it.id} onClick={() => reserve(it)}>
                      <Gift size={14} /> {busyItem === it.id ? "Reserving…" : "I'll get this"}
                    </button>
                    <Menu items={[{ label: "Chip in with others", icon: HandCoins, onClick: () => setChipFor(it) }]} />
                  </>
                ) : config.smtpEnabled ? (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => setGuestFor({ item: it })}>
                      <Gift size={14} /> I'll get this
                    </button>
                    <Menu items={[{ label: "Chip in with others", icon: HandCoins, onClick: () => setGuestFor({ item: it, chip: true }) }]} />
                  </>
                ) : (
                  <Link className="btn btn-primary btn-sm" to={`/login?next=${nextParam}`}>
                    Log in to reserve
                  </Link>
                )}
              </ItemCard>
            );
          })}
        </ItemsGrid>
      )}

      {!isOwner && list.reveal_givers && list.event_date && (
        <p className="hint-line">💌 After {formatDate(list.event_date)}, {ownerName} will see who reserved each gift, so they can say thank you.</p>
      )}
      {!isOwner && <Questions list={list} items={items} mode="friend" shareOpts={opts} loginPath={`/login?next=${nextParam}`} />}

      {guestFor && (
        <GuestReserve
          item={guestFor.item}
          chip={!!guestFor.chip}
          ownerName={ownerName}
          loginPath={`/login?next=${nextParam}`}
          onSignedIn={(uid) => (guestFor.chip ? setChipFor(guestFor.item) : reserve(guestFor.item, uid))}
          onClose={() => setGuestFor(null)}
        />
      )}
      {chipFor && (
        <ChipIn
          item={chipFor}
          pledges={pledgesByItem[chipFor.id] || []}
          currency={currency}
          hideNames={!!list.hide_reservers}
          hidePrice={hidePrice}
          shareOpts={opts}
          onClose={() => setChipFor(null)}
          onSaved={() => {
            setChipFor(null);
            loadReservations(list.id).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
