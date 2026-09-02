/**
 * ipad-fixes.js — iPad Safari 特有适配
 */
const IpadFixes = (() => {
  function init() {
    fixDoubleTapZoom();
    fixSafeArea();
  }

  function fixDoubleTapZoom() {
    let lastTouchEnd = 0;
    document.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        const tag = e.target.tagName;
        if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, false);
  }

  function fixSafeArea() {
    const style = document.createElement("style");
    style.textContent = `
      @supports (padding: env(safe-area-inset-top)) {
        header { padding-top: env(safe-area-inset-top); }
        .export-fab { bottom: calc(14px + env(safe-area-inset-bottom)); }
        .side .actions { bottom: calc(78px + env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(style);
  }

  return { init };
})();
