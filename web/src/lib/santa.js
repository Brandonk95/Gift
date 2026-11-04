import { useEffect, useState } from "react";
import { pb } from "./pb.js";

// Secret Santas where names are drawn and you have someone: [{ id, name, budget, currency, matchUser, matchName }]
let cache = { user: "", at: 0, promise: null };

export function loadMyMatches(userId) {
  if (!userId) return Promise.resolve([]);
  if (cache.user !== userId || Date.now() - cache.at > 60000) {
    cache = {
      user: userId,
      at: Date.now(),
      promise: pb
        .send("/api/giftlist/exchanges")
        .then((xs) => xs.filter((x) => x.status === "drawn" && x.matchUser))
        .catch(() => []),
    };
  }
  return cache.promise;
}

export function useMyMatches(userId) {
  const [matches, setMatches] = useState([]);
  useEffect(() => {
    let alive = true;
    loadMyMatches(userId).then((m) => alive && setMatches(m));
    return () => {
      alive = false;
    };
  }, [userId]);
  return matches;
}

// The Secret Santa (with a budget) in which you buy for this person, if any
export function santaFor(matches, ownerId) {
  return matches.find((m) => m.matchUser === ownerId) || null;
}

// true when a gift's price is over the exchange budget
export function overBudget(santa, price) {
  return !!(santa && santa.budget > 0 && price > santa.budget);
}
