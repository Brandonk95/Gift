import { useMemo, useState } from "react";
import { PRIORITIES } from "../lib/format.js";
import { useApp } from "../lib/app.jsx";
import { SearchInput, ViewToggle } from "./ui.jsx";

const SORTS = {
  custom: { label: "My order", fn: (a, b) => (a.sort || 0) - (b.sort || 0) || a.created.localeCompare(b.created) },
  priority: { label: "Most wanted first", fn: (a, b) => rank(a) - rank(b) || (a.sort || 0) - (b.sort || 0) },
  newest: { label: "Newest", fn: (a, b) => b.created.localeCompare(a.created) },
  priceAsc: { label: "Price: low to high", fn: (a, b) => (a.price || Infinity) - (b.price || Infinity) },
  priceDesc: { label: "Price: high to low", fn: (a, b) => (b.price || 0) - (a.price || 0) },
  name: { label: "Name A–Z", fn: (a, b) => a.name.localeCompare(b.name) },
};

function rank(item) {
  return PRIORITIES[item.priority]?.rank ?? 1;
}

function matches(item, q, categoryMap) {
  if (!q) return true;
  const hay = [item.name, item.description, item.size, item.color, categoryMap[item.category]?.name, item.url].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

// Search, category chips, sort and layout shared by the editor and the friend view.
// `friendView`: the layout the list's owner picked for friends. Friends start there
// and can switch, without changing their own saved preference.
export function useItemFilters(items, categoryMap, { hidePrice = false, defaultSort = "custom", friendView = "" } = {}) {
  const { prefs, setPrefs } = useApp();
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState(defaultSort);
  const [query, setQuery] = useState("");
  // the layout toggle updates your saved preference, so it sticks everywhere
  const [localView, setLocalView] = useState("");
  const activeView = localView || friendView || prefs.view;
  const setView = (view) => (friendView ? setLocalView(view) : setPrefs({ view }));

  const usedCategories = useMemo(() => {
    const ids = [...new Set(items.map((i) => i.category || ""))];
    return ids
      .map((id) => (id ? categoryMap[id] : null))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, categoryMap]);

  const hasUncategorized = items.some((i) => !i.category || !categoryMap[i.category]);

  const visible = useMemo(() => {
    const filtered = items.filter((i) => {
      if (!matches(i, query, categoryMap)) return false;
      if (cat === "all") return true;
      if (cat === "none") return !i.category || !categoryMap[i.category];
      return i.category === cat;
    });
    return [...filtered].sort(SORTS[sort].fn);
  }, [items, cat, sort, query, categoryMap]);

  const sortOptions = Object.entries(SORTS).filter(([k]) => !(hidePrice && k.startsWith("price")));

  const toolbar =
    items.length > 0 ? (
      <div className="filters">
        <div className="filters-row">
          <SearchInput value={query} onChange={setQuery} />
          <select className="select-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort gifts">
            {sortOptions.map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
          <ViewToggle value={activeView} onChange={setView} />
        </div>
        {usedCategories.length > 0 && (
          <div className="chips">
            <button className={`chip ${cat === "all" ? "active" : ""}`} onClick={() => setCat("all")}>
              All <span className="chip-count">{items.length}</span>
            </button>
            {usedCategories.map((c) => (
              <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => setCat(c.id)}>
                {c.icon} {c.name} <span className="chip-count">{items.filter((i) => i.category === c.id).length}</span>
              </button>
            ))}
            {hasUncategorized && (
              <button className={`chip ${cat === "none" ? "active" : ""}`} onClick={() => setCat("none")}>
                Other
              </button>
            )}
          </div>
        )}
      </div>
    ) : null;

  const filtering = !!query || cat !== "all";
  const clear = () => {
    setQuery("");
    setCat("all");
  };

  return { visible, toolbar, view: activeView, sort, filtering, clear };
}
