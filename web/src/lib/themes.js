import { pb } from "./pb.js";
import { bannerImage } from "./banners.js";

// Banner themes for lists (lists.theme). The art is drawn in banners.js; styles.css (.theme-*) has a base color.
export const THEMES = {
  snow: { label: "Winter", hint: "Snowfall on deep blue" },
  confetti: { label: "Party", hint: "Bright confetti" },
  baby: { label: "Little one", hint: "Soft pastel clouds" },
  hearts: { label: "Love", hint: "Hearts on rose" },
  garden: { label: "Garden", hint: "Fresh green leaves" },
  stars: { label: "Starry night", hint: "Stars on midnight blue" },
};

// A theme that suits the occasion, offered first in the picker
export const OCCASION_THEME = { christmas: "snow", birthday: "confetti", baby: "baby", wedding: "hearts", anniversary: "hearts", graduation: "stars" };

// What the list's banner shows: its own photo, a theme, or nothing
export function listCover(list, thumb = "1200x400") {
  if (!list) return null;
  if (list.cover) return { image: pb.files.getURL(list, list.cover, { thumb }) };
  if (THEMES[list.theme]) return { theme: list.theme, seed: list.id || list.theme };
  return null;
}

// className + style for an element showing a list's banner
export function coverProps(cover, extraClass = "") {
  if (!cover) return null;
  return {
    className: `${extraClass} ${cover.theme ? `theme-${cover.theme}` : "cover-photo"}`.trim(),
    style: cover.image ? { backgroundImage: `url("${cover.image}")` } : { backgroundImage: bannerImage(cover.theme, cover.seed || cover.theme), backgroundSize: "cover", backgroundPosition: "center" },
  };
}
