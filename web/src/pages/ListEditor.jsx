import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  CopyPlus,
  Download,
  Eye,
  FolderInput,
  ListPlus,
  Pencil,
  Plus,
  Printer,
  Settings2,
  Share2,
  Trash2,
  Undo2,
} from "lucide-react";
import ItemCard from "../components/ItemCard.jsx";
import GoesWith from "../components/GoesWith.jsx";
import ItemsGrid from "../components/ItemsGrid.jsx";
import ItemEditor from "../components/ItemEditor.jsx";
import BulkAdd from "../components/BulkAdd.jsx";
import ListForm from "../components/ListForm.jsx";
import Questions from "../components/Questions.jsx";
import ThankYous from "../components/ThankYous.jsx";
import ListHeader, { ListIcon } from "../components/ListHeader.jsx";
import Modal from "../components/Modal.jsx";
import SharePanel, { shareUrl } from "../components/SharePanel.jsx";
import { useItemFilters } from "../components/ItemFilters.jsx";
import { Menu } from "../components/ui.jsx";
import NotFound, { LoadError } from "./NotFound.jsx";
import { errorMessage, pb } from "../lib/pb.js";
import { findUrl, findUrls, formatPrice, isWishlistUrl } from "../lib/format.js";
import { copyItem, duplicateList, exportListCsv } from "../lib/listActions.js";
import { useApp } from "../lib/app.jsx";
import { CardsSkeleton, EmptyState } from "../components/Placeholders.jsx";


export default function ListEditor() {
  const { id } = useParams();
  const { user, config, notify, undoable } = useApp();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(null); // null | { item?, initial? }
  const [editingList, setEditingList] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showReceived, setShowReceived] = useState(false);
  const [quick, setQuick] = useState("");
  const [bulk, setBulk] = useState(null); // null | pasted text for "Add many gifts"
  const [picker, setPicker] = useState(null); // { item, mode: "move" | "copy" }
  const dragId = useRef(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    let alive = true;
    Promise.all([
      pb.collection("lists").getOne(id),
      pb.collection("items").getFullList({ filter: pb.filter("list = {:id}", { id }) }),
      pb.collection("categories").getFullList({ filter: pb.filter('owner = "" || owner = {:me}', { me: user.id }), sort: "name" }),
    ])
      .then(([l, its, cats]) => {
        if (!alive) return;
        if (l.owner !== user.id) return setMissing(true);
        setList(l);
        setItems(its);
        setCategories(cats);
      })
      .catch((err) => {
        if (!alive) return;
        if (err.status === 404) setMissing(true);
        else setLoadError(errorMessage(err, "load this list"));
      });
    return () => {
      alive = false;
    };
  }, [id, user.id, reloadKey]);

  // ?share=1 (from the dashboard's getting-started guide) opens the share panel
  useEffect(() => {
    if (!list || params.get("share") === null) return;
    setParams({}, { replace: true });
    if (!list.private) setSharing(true);
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?add=… comes from the Share page (a link shared from another app)
  useEffect(() => {
    const shared = params.get("add");
    if (!list || shared === null) return;
    setParams({}, { replace: true });
    const url = findUrl(shared);
    const rest = shared.split(/\s+/).filter((w) => !/^(https?:\/\/|www\.)/i.test(w)).join(" ").trim();
    // the Add-to-GiftMe button also sends what it read on the store page
    const extra = { image_url: params.get("img") || "", price: params.get("price") || "" };
    if (url) setEditing({ initial: { url, name: rest.length > 3 && rest.length < 150 ? rest : "", ...extra } });
    else if (shared.trim()) setEditing({ initial: { name: shared.trim().slice(0, 200) } });
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const active = useMemo(() => items.filter((i) => !i.received), [items]);
  const received = items.length - active.length;
  const pool = showReceived ? items : active;
  const { visible, toolbar, view, sort, filtering, clear } = useItemFilters(pool, categoryMap);
  const currency = list?.currency || config.currency;
  const total = active.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  const canDrag = sort === "custom" && !filtering;

  if (missing) return <NotFound title="List not found" message="This list doesn't exist, or it belongs to someone else." />;
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


  const replaceItem = (saved) => setItems((prev) => (prev.some((i) => i.id === saved.id) ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved]));

  const patchItem = async (item, body, okMsg, action) => {
    try {
      const saved = await pb.collection("items").update(item.id, body);
      replaceItem(saved);
      if (okMsg) notify(okMsg);
      return saved;
    } catch (err) {
      notify(errorMessage(err, action), "error");
    }
  };

  const quickAdd = async (e) => {
    e.preventDefault();
    const v = quick.trim();
    if (!v) return;
    const url = findUrl(v);
    // several links, or a wish list: add them all at once
    if (findUrls(v).length > 1 || isWishlistUrl(url)) {
      setBulk(v);
      setQuick("");
      return;
    }
    if (url) {
      // text shared along with the link is usually the product name
      const rest = v.split(/\s+/).filter((w) => !/^(https?:\/\/|www\.)/i.test(w)).join(" ").trim();
      setEditing({ initial: { url, name: rest.length > 3 && rest.length < 150 ? rest : "" } });
      setQuick("");
      return;
    }
    try {
      const saved = await pb.collection("items").create({ list: list.id, name: v, priority: "medium", quantity: 1, sort: Date.now() % 2147483647 });
      replaceItem(saved);
      setQuick("");
      notify(`Added “${v}”. Click Edit to add a link, price or picture.`);
    } catch (err) {
      notify(errorMessage(err, `add “${v}”`), "error");
    }
  };

  // gone right away, with a few seconds to undo before it's really deleted
  const removeItem = (item) =>
    undoable({
      message: `Deleted “${item.name}”`,
      hide: () => setItems((prev) => prev.filter((i) => i.id !== item.id)),
      restore: () => setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item])),
      commit: () => pb.collection("items").delete(item.id),
      failMessage: `Couldn't delete “${item.name}”.`,
    });

  const duplicateItem = async (item) => {
    try {
      const saved = await copyItem(item, list.id, { name: `${item.name} (copy)`.slice(0, 200), sort: (item.sort || 0) + 1 });
      replaceItem(saved);
      notify("Gift duplicated");
    } catch (err) {
      notify(errorMessage(err, `duplicate “${item.name}”`), "error");
    }
  };

  // Persist a new order: give every visible item an evenly spaced sort value.
  const saveOrder = async (ordered) => {
    const changes = ordered.map((it, idx) => ({ it, sort: (idx + 1) * 10 })).filter(({ it, sort }) => it.sort !== sort);
    setItems((prev) => prev.map((i) => ({ ...i, sort: (ordered.findIndex((o) => o.id === i.id) + 1) * 10 || i.sort })));
    try {
      await Promise.all(changes.map(({ it, sort }) => pb.collection("items").update(it.id, { sort })));
    } catch (err) {
      notify(errorMessage(err, "save the new order"), "error");
    }
  };

  const moveBy = (item, delta) => {
    const ordered = [...visible];
    const from = ordered.findIndex((i) => i.id === item.id);
    const to = from + delta;
    if (to < 0 || to >= ordered.length) return;
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
    saveOrder(ordered);
  };

  const dragPropsFor = (item) =>
    canDrag
      ? {
          draggable: true,
          onDragStart: (e) => {
            dragId.current = item.id;
            e.dataTransfer.effectAllowed = "move";
          },
          onDragOver: (e) => {
            e.preventDefault();
            const from = dragId.current;
            if (!from || from === item.id) return;
            setItems((prev) => {
              const order = [...visible].map((i) => i.id);
              const fi = order.indexOf(from);
              const ti = order.indexOf(item.id);
              order.splice(ti, 0, order.splice(fi, 1)[0]);
              return prev.map((i) => (order.includes(i.id) ? { ...i, sort: (order.indexOf(i.id) + 1) * 10 } : i));
            });
          },
          onDragEnd: () => {
            dragId.current = null;
            saveOrder([...visible]);
          },
        }
      : null;

  const removeList = async () => {
    if (!confirm(`Delete "${list.title}" and all its gifts? This can't be undone.`)) return;
    try {
      await pb.collection("lists").delete(list.id);
      notify("List deleted");
      navigate("/");
    } catch (err) {
      notify(errorMessage(err, "delete this list"), "error");
    }
  };

  const dupList = async () => {
    notify("Duplicating…");
    try {
      const copy = await duplicateList(list, user.id);
      notify("List duplicated — you're now editing the copy");
      navigate(`/lists/${copy.id}`);
    } catch (err) {
      notify(errorMessage(err, "duplicate this list"), "error");
    }
  };

  const toggleArchive = async () => {
    try {
      const saved = await pb.collection("lists").update(list.id, { archived: !list.archived });
      setList(saved);
      notify(saved.archived ? "List archived. The share link still works." : "List restored from the archive");
    } catch (err) {
      notify(errorMessage(err, list.archived ? "restore this list" : "archive this list"), "error");
    }
  };

  return (
    <div className="page">
      <ListHeader
        list={list}
        eyebrow={list.private ? "🔒 Private ideas board" : list.archived ? "Archived list" : undefined}
        meta={
          <span className="meta-item">
            {active.length} gift{active.length === 1 ? "" : "s"}
            {total > 0 && ` · ${formatPrice(total, currency)}`}
            {received > 0 && ` · ${received} received`}
          </span>
        }
        actions={
          <>
            {!list.private && (
              <button className="btn btn-primary" onClick={() => setSharing(true)}>
                <Share2 size={16} /> Share
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setEditingList(true)}>
              <Settings2 size={16} /> Settings
            </button>
            <Menu
              items={[
                { label: "Preview as a friend", icon: Eye, hidden: list.private, onClick: () => window.open(shareUrl(list), "_blank", "noopener") },
                { label: "Duplicate list", icon: CopyPlus, onClick: dupList },
                { label: "Export to spreadsheet (CSV)", icon: Download, onClick: () => exportListCsv(list, items, categoryMap) },
                { label: "Print", icon: Printer, onClick: () => window.print() },
                { label: list.archived ? "Restore from archive" : "Archive list", icon: list.archived ? ArchiveRestore : Archive, onClick: toggleArchive },
                { divider: true },
                { label: "Delete list", icon: Trash2, danger: true, onClick: removeList },
              ]}
            />
          </>
        }
      />

      {list.private ? (
        <p className="hint-line">🔒 Only you can see this board, and it has no share link. When an idea is ready, use the gift's ⋯ menu → Move to another list.</p>
      ) : (
        <p className="hint-line">🤫 Reservations are hidden from you, so your gifts stay a surprise.</p>
      )}
      <ThankYous list={list} onItemChange={replaceItem} />

      <form className="quick-add" onSubmit={quickAdd}>
        <Plus size={18} className="quick-add-icon" />
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a gift or paste a link" aria-label="Quick add a gift" />
        <button className="btn btn-primary btn-sm" disabled={!quick.trim()}>
          Add
        </button>
        <Menu
          label="Other ways to add"
          buttonClassName="icon-btn quick-add-more"
          items={[
            { label: "Add with more details…", icon: Pencil, onClick: () => setEditing({}) },
            { label: "Add many at once", icon: ListPlus, onClick: () => setBulk("") },
          ]}
        />
      </form>

      <div className="toolbar">
        {toolbar}
        {received > 0 && (
          <label className="toggle">
            <input type="checkbox" checked={showReceived} onChange={(e) => setShowReceived(e.target.checked)} /> Show received ({received})
          </label>
        )}
      </div>
      {sort === "custom" && filtering && <p className="muted small">Clear the search and category filter to drag gifts into a new order.</p>}

      {items.length === 0 ? (
        <EmptyState art="gift" title="Add your first gift" text="Type a gift's name in the box above, or paste a link from any store and we'll fill in the picture and price.">
          <button className="btn btn-secondary" onClick={() => setBulk("")}>
            <ListPlus size={15} /> Add many at once
          </button>
        </EmptyState>
      ) : visible.length === 0 ? (
        <div className="empty empty-sm">
          <p className="muted">No gifts match.</p>
          {filtering && (
            <button className="btn btn-secondary btn-sm" onClick={clear}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ItemsGrid view={view}>
          {visible.map((it, idx) => (
            <ItemCard
              key={it.id}
              item={it}
              view={view}
              category={categoryMap[it.category]}
              currency={currency}
              dragProps={dragPropsFor(it)}
              note={<GoesWith item={it} items={items} />}
              onToggleStar={() => patchItem(it, { priority: it.priority === "high" ? "medium" : "high" }, null, "update the priority")}
            >
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ item: it })} aria-label={`Edit ${it.name}`} title="Edit">
                <Pencil size={14} /> <span>Edit</span>
              </button>
              <Menu
                items={[
                  {
                    label: it.received ? "Mark as not received" : "Mark as received",
                    icon: it.received ? Undo2 : CheckCircle2,
                    onClick: () =>
                      patchItem(it, { received: !it.received }, it.received ? "Back on your list" : "Marked as received 🎉 — hidden from friends", "update this gift"),
                  },
                  { label: "Move up", icon: ArrowUp, hidden: !canDrag || idx === 0, onClick: () => moveBy(it, -1) },
                  { label: "Move down", icon: ArrowDown, hidden: !canDrag || idx === visible.length - 1, onClick: () => moveBy(it, 1) },
                  { label: "Duplicate", icon: Copy, onClick: () => duplicateItem(it) },
                  { label: "Move to another list…", icon: FolderInput, onClick: () => setPicker({ item: it, mode: "move" }) },
                  { label: "Copy to another list…", icon: CopyPlus, onClick: () => setPicker({ item: it, mode: "copy" }) },
                  { divider: true },
                  { label: "Delete", icon: Trash2, danger: true, onClick: () => removeItem(it) },
                ]}
              />
            </ItemCard>
          ))}
        </ItemsGrid>
      )}

      <Questions list={list} items={items} mode="owner" />

      {bulk !== null && (
        <BulkAdd
          listId={list.id}
          currency={currency}
          initialText={bulk}
          onClose={() => setBulk(null)}
          onAdded={(saved) => {
            setItems((prev) => [...prev, ...saved]);
            notify(`Added ${saved.length} gift${saved.length === 1 ? "" : "s"}`);
          }}
        />
      )}
      {editing && (
        <ItemEditor
          listId={list.id}
          item={editing.item}
          initial={editing.initial}
          currency={currency}
          categories={categories}
          items={items}
          onCategoryCreated={(c) => setCategories((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            replaceItem(saved);
            notify(editing.item ? "Gift updated" : "Gift added 🎁");
            setEditing(null);
          }}
        />
      )}
      {editingList && (
        <ListForm
          list={list}
          onClose={() => setEditingList(false)}
          onSaved={(l) => {
            setList(l);
            setEditingList(false);
            notify("List settings saved");
          }}
        />
      )}
      {sharing && <SharePanel list={list} onClose={() => setSharing(false)} onListChange={setList} />}
      {picker && (
        <ListPicker
          currentId={list.id}
          mode={picker.mode}
          item={picker.item}
          onClose={() => setPicker(null)}
          onDone={(target) => {
            if (picker.mode === "move") setItems((prev) => prev.filter((i) => i.id !== picker.item.id));
            notify(`${picker.mode === "move" ? "Moved" : "Copied"} “${picker.item.name}” to ${target.title}`);
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

function ListPicker({ currentId, mode, item, onClose, onDone }) {
  const { user, notify } = useApp();
  const [lists, setLists] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pb.collection("lists")
      .getFullList({ filter: pb.filter("owner = {:me} && id != {:cur}", { me: user.id, cur: currentId }), sort: "archived,-created" })
      .then(setLists)
      .catch((err) => {
        notify(errorMessage(err, "load your other lists"), "error");
        setLists([]);
      });
  }, [user.id, currentId, notify]);

  const pick = async (target) => {
    setBusy(true);
    try {
      if (mode === "move") await pb.collection("items").update(item.id, { list: target.id });
      else await copyItem(item, target.id);
      onDone(target);
    } catch (err) {
      notify(errorMessage(err, `${mode} “${item.name}” to ${target.title}`), "error");
      setBusy(false);
    }
  };

  return (
    <Modal title={`${mode === "move" ? "Move" : "Copy"} “${item.name}” to…`} onClose={onClose}>
      {lists === null ? (
        <div className="loading">Loading…</div>
      ) : lists.length === 0 ? (
        <p className="muted">You don't have any other lists yet. Create one from your dashboard first.</p>
      ) : (
        <div className="pick-list">
          {lists.map((l) => (
            <button key={l.id} className="pick-row" disabled={busy} onClick={() => pick(l)}>
              <ListIcon list={l} size="sm" />
              <span className="pick-title">{l.title}</span>
              {l.archived && <span className="chip-static subtle">Archived</span>}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
