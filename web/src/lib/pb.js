import PocketBase from "pocketbase";

// The SPA is served by PocketBase itself, so the API lives on the same origin.
export const pb = new PocketBase(import.meta.env.VITE_PB_URL || window.location.origin);
pb.autoCancellation(false);

export const shareHeaders = (token) => ({ headers: { "X-Share-Token": token } });

export function itemImage(item, thumb = "400x400f") {
  if (item.image) return pb.files.getURL(item, item.image, { thumb });
  return item.image_url || "";
}

export { errorMessage } from "./errors.js";

export function randomToken(len = 24) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
