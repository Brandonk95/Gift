// A list can have two owners (owner + co_owner). Both run the list, and neither
// sees who reserved what.

export function ownsList(list, user) {
  const id = user?.id || user;
  return !!id && !!list && (list.owner === id || list.co_owner === id);
}

// "Alex" or "Alex & Jamie", for showing friends whose list it is
export function ownerNames(list, fallback = "") {
  const names = [list?.owner_name, list?.co_owner && list?.co_owner_name].filter(Boolean);
  return names.length ? names.join(" & ") : fallback;
}

// the other owner's name, from where this person sits ("" when there's no co-owner)
export function partnerName(list, user) {
  if (!list?.co_owner) return "";
  const id = user?.id || user;
  return list.co_owner === id ? list.owner_name || "the owner" : list.co_owner_name || "your co-owner";
}

// filter for "lists I own or co-own" (prefix "list." for items)
export const MINE = (prefix = "") => `(${prefix}owner = {:me} || ${prefix}co_owner = {:me})`;
