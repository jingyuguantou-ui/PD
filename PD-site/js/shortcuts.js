/**
 * shortcuts.js — 键盘快捷键面板（支持自定义）
 */
const Shortcuts = (() => {
  const STORAGE_KEY = "pindou-shortcuts";
  const defaultBindings = {
    paint: "b", erase: "e", pick: "i", fill: "g", view: "v",
    line: "l", rect: "r", ellipse: "o", select: "s", text: "t",
    replace: "x",
  };
  let bindings = { ...defaultBindings };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) bindings = { ...defaultBindings, ...saved };
    } catch(e) {}
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings)); } catch(e) {}
  }
  function reset() {
    bindings = { ...defaultBindings };
    save();
  }
  function getBinding(tool) { return bindings[tool] || defaultBindings[tool]; }
  function getAllBindings() { return { ...bindings }; }

  const groups = [
    { title: "全局", items: [
      ["Ctrl+Z", "撤销（主流程）"],
      ["Ctrl+Shift+Z / Ctrl+Y", "重做（主流程）"],
      ["Ctrl+S", "保存图纸"],
    ]},
    { title: "编辑模式（可自定义）", items: null },
    { title: "画布", items: [
      ["滚轮 / 双指", "缩放"], ["拖拽 / 触摸", "平移"],
      ["适应宽度", "自动适配画布宽度"],
    ]},
  ];

  const toolLabels = {
    paint: "画笔", erase: "擦除", pick: "取色", fill: "填充",
    line: "直线", rect: "矩形", ellipse: "椭圆", select: "选择",
    text: "文字", view: "查看/平移", replace: "换色",
  };

  function show() {
    let overlay = document.getElementById("scOverlay");
    if (overlay) { overlay.remove(); return; }
    overlay = document.createElement("div");
    overlay.id = "scOverlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center";
    let html = '<div class="panel" style="width:500px;max-width:90vw;max-height:80vh;overflow-y:auto;padding:24px">';
    html += '<h3 style="margin:0 0 16px">键盘快捷键</h3>';
    for (const g of groups) {
      html += '<div style="margin-bottom:14px">';
      html += '<div style="font-weight:700;margin-bottom:6px;color:var(--primary)">' + g.title + '</div>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
      if (g.items) {
        for (const [key, desc] of g.items) {
          html += '<tr><td style="padding:4px 8px;border-bottom:1px solid var(--border)"><code style="background:var(--panel-2);padding:2px 6px;border-radius:3px;font-size:12px;white-space:nowrap">' + key + '</code></td>';
          html += '<td style="padding:4px 8px;border-bottom:1px solid var(--border)">' + desc + '</td></tr>';
        }
      } else {
        for (const [tool, label] of Object.entries(toolLabels)) {
          const key = bindings[tool] || defaultBindings[tool];
          html += '<tr><td style="padding:4px 8px;border-bottom:1px solid var(--border)">';
          html += '<button class="sc-rebind" data-tool="' + tool + '" style="background:var(--panel-2);padding:2px 8px;border:1px solid var(--border);border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit;color:var(--text)">' + key.toUpperCase() + '</button>';
          html += '</td><td style="padding:4px 8px;border-bottom:1px solid var(--border)">' + label + '</td></tr>';
        }
      }
      html += '</table></div>';
    }
    html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">';
    html += '<button id="scReset" style="padding:6px 14px;border:2px solid var(--border);border-radius:6px;background:var(--panel-2);cursor:pointer;font-size:13px;color:var(--text)">恢复默认</button>';
    html += '<button id="scClose" style="padding:6px 16px;border:2px solid var(--border-strong);border-radius:6px;background:var(--panel);cursor:pointer;font-size:13px;color:var(--text)">关闭</button>';
    html += '</div></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector("#scClose").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#scReset").addEventListener("click", () => { reset(); overlay.remove(); show(); });
    overlay.querySelectorAll(".sc-rebind").forEach(btn => {
      btn.addEventListener("click", () => {
        const tool = btn.dataset.tool;
        btn.textContent = "…";
        btn.style.borderColor = "var(--primary)";
        const handler = (e) => {
          e.preventDefault();
          const key = e.key.toLowerCase();
          if (key === "escape") { btn.textContent = (bindings[tool] || defaultBindings[tool]).toUpperCase(); btn.style.borderColor = ""; document.removeEventListener("keydown", handler, true); return; }
          bindings[tool] = key;
          btn.textContent = key.toUpperCase();
          btn.style.borderColor = "";
          save();
          document.removeEventListener("keydown", handler, true);
        };
        document.addEventListener("keydown", handler, true);
      });
    });
  }
  load();
  return { show, getBinding, getAllBindings, reset };
})();
