/**
 * error-boundary.js — 全局错误捕获 + 用户友好提示
 */
const ErrorBoundary = (() => {
  let _enabled = false;

  function install() {
    if (_enabled) return;
    _enabled = true;
    window.addEventListener("error", (e) => {
      console.error("[ErrorBoundary]", e.message, e.filename, e.lineno);
      showFriendly("脚本错误: " + e.message);
      e.preventDefault();
    });
    window.addEventListener("unhandledrejection", (e) => {
      console.error("[ErrorBoundary] Promise:", e.reason);
      showFriendly("操作失败: " + (e.reason && e.reason.message ? e.reason.message : "未知错误"));
    });
  }

  function showFriendly(msg) {
    if (document.getElementById("errorToast")) return;
    const t = document.createElement("div");
    t.id = "errorToast";
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#c33;color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:2147483647;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  return { install, showFriendly };
})();
