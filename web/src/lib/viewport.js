// iPhone Safari quirks the CSS alone can't fix.
//
// 1. Tapping a text box can zoom the page in, and Safari leaves it zoomed after you're
//    done typing. Adding maximum-scale=1 to the viewport tag stops that zoom on iPhones
//    and iPads, while people can still pinch to zoom there (Safari ignores the limit for
//    pinching). It's only added on Apple devices, because other phones would block pinch
//    zoom completely.
//
// 2. When the keyboard opens, Safari doesn't shrink the page. It slides the visible part
//    over it instead, so a bottom sheet can end up under the keyboard with no way to reach
//    its fields. These CSS variables describe the part of the screen you can actually see,
//    so open dialogs can sit right inside it:
//      --vv-top     how far down the visible part starts
//      --vv-height  how tall it is
export function trackVisualViewport() {
  if (typeof window === "undefined") return;
  if (isAppleTouch()) {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta && !/maximum-scale/.test(meta.content)) meta.content += ", maximum-scale=1";
  }

  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement.style;
  let frame = 0;
  const update = () => {
    frame = 0;
    // while someone pinch-zooms, let dialogs fill the screen as usual
    if (vv.scale > 1.05) {
      root.removeProperty("--vv-top");
      root.removeProperty("--vv-height");
      return;
    }
    root.setProperty("--vv-top", `${Math.max(0, Math.round(vv.offsetTop))}px`);
    root.setProperty("--vv-height", `${Math.round(vv.height)}px`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  update();
}

function isAppleTouch() {
  const ua = navigator.userAgent || "";
  // iPadOS reports itself as a Mac, so check for a touch screen too
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
