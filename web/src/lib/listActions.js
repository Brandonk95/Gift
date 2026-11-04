import { pb } from "./pb.js";

const COPY_FIELDS = ["name", "description", "url", "price", "quantity", "priority", "category", "image_url", "size", "color", "sort"];

// Copies one gift into a list, including an uploaded picture.
export async function copyItem(item, listId, overrides = {}) {
  const body = { list: listId, ...Object.fromEntries(COPY_FIELDS.map((f) => [f, item[f]])), received: false, ...overrides };
  if (item.image) {
    try {
      const blob = await fetch(pb.files.getURL(item, item.image)).then((r) => (r.ok ? r.blob() : null));
      if (blob) body.image = new File([blob], item.image, { type: blob.type });
    } catch {
      /* keep going without the picture */
    }
  }
  return pb.collection("items").create(body);
}

export async function duplicateList(list, userId, { includeReceived = false } = {}) {
  const copy = await pb.collection("lists").create({
    owner: userId,
    title: `${list.title} (copy)`.slice(0, 120),
    description: list.description,
    occasion: list.occasion,
    color: list.color,
    emoji: list.emoji,
    currency: list.currency,
    hide_prices: list.hide_prices,
    hide_reservers: list.hide_reservers,
    no_chip_in: list.no_chip_in,
    no_questions: list.no_questions,
  });
  const items = await pb.collection("items").getFullList({ filter: pb.filter("list = {:id}", { id: list.id }) });
  for (const it of items) {
    if (!includeReceived && it.received) continue;
    await copyItem(it, copy.id);
  }
  return copy;
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportListCsv(list, items, categoryMap) {
  const rows = [["Name", "Price", "Quantity", "Priority", "Category", "Size", "Color", "Link", "Details", "Received"]];
  for (const i of items) {
    rows.push([i.name, i.price || "", i.quantity || 1, i.priority, categoryMap[i.category]?.name || "", i.size, i.color, i.url, i.description, i.received ? "yes" : ""]);
  }
  const safe = list.title.replace(/[^\w\- ]+/g, "").trim() || "gift-list";
  downloadCsv(`${safe}.csv`, rows);
}

export function slugDate() {
  return new Date().toISOString().slice(0, 10);
}
