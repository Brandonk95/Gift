import { BUNDLED } from "../lib/emoji-set.js";

// Twemoji file name: code points joined by "-", dropping the FE0F variation
// selector unless it's a joined sequence (👨‍👩‍👧‍👦).
export function emojiCode(e) {
  const cps = [...String(e || "")].map((c) => c.codePointAt(0).toString(16));
  return (e.includes("‍") ? cps : cps.filter((c) => c !== "fe0f")).join("-");
}

// An emoji drawn the same on every phone and computer. Emoji we don't bundle
// (someone typed their own) fall back to the system's.
export default function Emoji({ e, label }) {
  if (!e) return null;
  const code = emojiCode(e);
  if (!BUNDLED.has(code)) return <span className="emoji-text">{e}</span>;
  return <img className="emoji" src={`/emoji/${code}.svg`} alt={label || ""} draggable={false} />;
}
