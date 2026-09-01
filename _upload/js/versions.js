/**
 * versions.js — 图纸版本管理
 */
const Versions = (() => {
  const VER_KEY = "pindou-versions";
  const MAX_VER = 10;

  function getAll() {
    try { return JSON.parse(localStorage.getItem(VER_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveAll(list) {
    try { localStorage.setItem(VER_KEY, JSON.stringify(list.slice(-MAX_VER))); } catch (e) {}
  }
  function saveVersion(name, payload) {
    const list = getAll();
    list.push({
      id: "v-" + Date.now(),
      name: name || "未命名",
      ts: Date.now(),
      data: payload,
    });
    saveAll(list);
  }
  function loadVersion(id) {
    return getAll().find(v => v.id === id) || null;
  }
  function deleteVersion(id) {
    saveAll(getAll().filter(v => v.id !== id));
  }
  function showVersions() {
    let overlay = document.getElementById("verOverlay");
    if (overlay) { overlay.remove(); return; }
    const list = getAll();
    overlay = document.createElement("div");
    overlay.id = "verOverlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center";
    let html = '<div class="panel" style="width:420px;max-width:90vw;max-height:80vh;overflow-y:auto;padding:24px">';
    html += '<h3 style="margin:0 0 12px">图纸版本历史</h3>';
    if (!list.length) {
      html += '<p class="muted" style="text-align:center;padding:20px">暂无保存的版本。<br>每次生成图稿会自动记录。</p>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:8px">';
      for (let i = list.length - 1; i >= 0; i--) {
        const v = list[i];
        const d = new Date(v.ts);
        const ts = d.toLocaleDateString() + " " + d.toLocaleTimeString();
        const cols = v.data && v.data.gcols ? v.data.gcols : "?";
        const rows = v.data && v.data.grows ? v.data.grows : "?";
        html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:2px solid var(--border);border-radius:8px;background:var(--panel-2)">';
        html += '<div style="flex:1;min-width:0"><div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (v.name || "未命名") + '</div>';
        html += '<div class="muted small">' + ts + " · " + cols + "×" + rows + "格</div></div>";
        html += '<button data-ver-load="' + v.id + '" style="padding:4px 10px;border:2px solid var(--primary);border-radius:4px;background:var(--primary);color:#fff;cursor:pointer;font-size:12px;font-weight:700">载入</button>';
        html += '<button data-ver-del="' + v.id + '" style="padding:4px 10px;border:2px solid #c33;border-radius:4px;background:transparent;color:#c33;cursor:pointer;font-size:12px">删除</button>';
        html += '</div>';
      }
      html += '</div>';
    }
    html += '<div style="text-align:right;margin-top:12px"><button onclick="document.getElementById(\'verOverlay\').remove()" style="padding:6px 16px;border:2px solid var(--border-strong);border-radius:6px;background:var(--panel);cursor:pointer">关闭</button></div>';
    html += '</div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
      const t = e.target.closest("[data-ver-load]");
      if (t) {
        const ver = loadVersion(t.dataset.verLoad);
        if (ver && ver.data) {
          try {
            const applyFn = window._pApplyDrawing;
            if (applyFn) applyFn(ver.data);
            overlay.remove();
          } catch (err) { alert("载入版本失败: " + err.message); }
        }
      }
      const d = e.target.closest("[data-ver-del]");
      if (d) {
        if (confirm("确定删除此版本？")) {
          deleteVersion(d.dataset.verDel);
          overlay.remove();
          showVersions();
        }
      }
    });
  }
  return { saveVersion, loadVersion, deleteVersion, showVersions, getAll };
})();
