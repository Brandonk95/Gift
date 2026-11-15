// iPhone Safari keeps "100vh" and fixed elements sized as if its toolbars and the
// on-screen keyboard weren't there, so a bottom sheet can end up under the keyboard
// with no way to reach its fields. This keeps two CSS variables current:
//   --vv-height: the height you can actually see
//   --vv-bottom: how much of the bottom the keyboard (or toolbar) is covering
export function trackVisualViewport() {
  const vv = typeof window !== "undefined" && window.visualViewport;
  if (!vv) return;
  const root = document.documentElement.style;
  let frame = 0;
  const update = () => {
    frame = 0;
    root.setProperty("--vv-height", `${Math.round(vv.height)}px`);
    root.setProperty("--vv-bottom", `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  update();
}
