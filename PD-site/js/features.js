/**
 * features.js — 导出格式扩展 / 尺寸计算器 / 图片对比 / 版本管理
 */
const Features = (() => {

  /* ---- 导出格式扩展 (JPG/BMP) ---- */
  function exportAsFormat(fmt) {
    if (!window._pState || !window._pState.result) return;
    const res = window._pState.result;
    const c = document.createElement("canvas");
    c.width = res.cols * 24;
    c.height = res.rows * 24;
    const ctx = c.getContext("2d");
    ctx.fillStyle = fmt === "jpg" ? "#ffffff" : "#000000";
    ctx.fillRect(0, 0, c.width, c.height);
    for (let r = 0; r < res.rows; r++) {
      for (let col = 0; col < res.cols; col++) {
        const cell = res.grid[r][col];
        if (cell.blank || cell.bg) continue;
        const ci = cell.ci;
        if (ci == null || ci >= res.palette.length) continue;
        const p = res.palette[ci];
        ctx.fillStyle = p.hex;
        ctx.fillRect(col * 24, r * 24, 24, 24);
      }
    }
    const mime = fmt === "jpg" ? "image/jpeg" : "image/bmp";
    const ext = fmt === "jpg" ? "jpg" : "bmp";
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = "pindou-export." + ext;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, mime, 0.92);
  }

  /* ---- 拼豆尺寸计算器 ---- */
  function calcBeadSize(targetCm, beadPitchMm) {
    beadPitchMm = beadPitchMm || 5;
    const targetMm = targetCm * 10;
    const beads = Math.round(targetMm / beadPitchMm);
    return beads;
  }

  function showCalculator() {
    let overlay = document.getElementById("calcOverlay");
    if (overlay) { overlay.remove(); return; }
    overlay = document.createElement("div");
    overlay.id = "calcOverlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center";
    overlay.innerHTML = `
      <div class="panel" style="width:340px;max-width:90vw;padding:24px">
        <h3 style="margin:0 0 12px">拼豆尺寸计算器</h3>
        <label class="field">目标宽度 (cm)<input type="number" id="calcW" class="field" value="15" min="1" step="0.5" /></label>
        <label class="field">目标高度 (cm)<input type="number" id="calcH" class="field" value="15" min="1" step="0.5" /></label>
        <label class="field">珠子间距 (mm)<input type="number" id="calcPitch" class="field" value="5" min="2.5" max="10" step="0.5" /></label>
        <div id="calcResult" style="margin:12px 0;padding:12px;background:var(--panel-2);border-radius:8px;font-size:14px;line-height:1.8"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button onclick="document.getElementById('calcOverlay').remove()" style="padding:6px 16px;border:2px solid var(--border-strong);border-radius:6px;background:var(--panel);cursor:pointer">关闭</button>
          <button id="calcApply" class="primary" style="padding:6px 16px;border:none;border-radius:6px;background:var(--primary);color:#fff;cursor:pointer;font-weight:700">应用到图稿</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    function update() {
      const w = parseFloat(document.getElementById("calcW").value) || 15;
      const h = parseFloat(document.getElementById("calcH").value) || 15;
      const p = parseFloat(document.getElementById("calcPitch").value) || 5;
      const cols = calcBeadSize(w, p);
      const rows = calcBeadSize(h, p);
      const cmW = (cols * p / 10).toFixed(1);
      const cmH = (rows * p / 10).toFixed(1);
      document.getElementById("calcResult").innerHTML =
        "宽度：<b>" + cols + "</b> 格（" + cmW + " cm）<br>" +
        "高度：<b>" + rows + "</b> 格（" + cmH + " cm）<br>" +
        "总计：<b>" + (cols * rows) + "</b> 粒拼豆";
      document.getElementById("calcApply").onclick = () => {
        const sel = document.getElementById("cols");
        if (sel) { sel.value = String(cols); sel.dispatchEvent(new Event("change")); }
        overlay.remove();
      };
    }
    ["calcW", "calcH", "calcPitch"].forEach(id => {
      document.getElementById(id).addEventListener("input", update);
    });
    update();
  }

  /* ---- 图片对比 ---- */
  function showComparison() {
    if (!window._pState || !window._pState.result || !window._pState.img) return;
    let overlay = document.getElementById("compareOverlay");
    if (overlay) { overlay.remove(); return; }
    const orig = window._pState.img;
    const pattern = document.getElementById("preview");
    overlay = document.createElement("div");
    overlay.id = "compareOverlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:20px";
    const box = document.createElement("div");
    box.style.cssText = "position:relative;overflow:hidden;border:3px solid var(--border-strong);border-radius:8px;max-width:90vw;max-height:75vh;cursor:ew-resize;touch-action:none";
    const cw = Math.min(orig.width, 600);
    const ch = Math.round(cw * orig.height / orig.width);
    const cvL = document.createElement("canvas");
    cvL.width = cw; cvL.height = ch;
    cvL.getContext("2d").drawImage(orig, 0, 0, cw, ch);
    cvL.style.cssText = "display:block;width:" + cw + "px;height:" + ch + "px";
    const cvR = document.createElement("canvas");
    cvR.width = cw; cvR.height = ch;
    cvR.getContext("2d").drawImage(pattern, 0, 0, cw, ch);
    cvR.style.cssText = "display:block;width:" + cw + "px;height:" + ch + "px;position:absolute;top:0;left:0;clip-path:inset(0 50% 0 0)";
    const slider = document.createElement("div");
    slider.style.cssText = "position:absolute;top:0;bottom:0;left:50%;width:3px;background:#fff;z-index:2;pointer-events:none;transform:translateX(-50%)";
    const lblL = document.createElement("div");
    lblL.textContent = "原图";
    lblL.style.cssText = "position:absolute;top:8px;left:8px;background:rgba(0,0,0,.6);color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;z-index:3";
    const lblR = document.createElement("div");
    lblR.textContent = "图稿";
    lblR.style.cssText = "position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;z-index:3";
    box.appendChild(cvL); box.appendChild(cvR); box.appendChild(slider); box.appendChild(lblL); box.appendChild(lblR);
    let dragging = false;
    const ac = new AbortController();
    const opts = { signal: ac.signal };
    function moveSlider(clientX) {
      const r = box.getBoundingClientRect();
      let pct = ((clientX - r.left) / r.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      slider.style.left = pct + "%";
      cvR.style.clipPath = "inset(0 " + (100 - pct) + "% 0 0)";
    }
    box.addEventListener("mousedown", (e) => { dragging = true; moveSlider(e.clientX); }, opts);
    box.addEventListener("mousemove", (e) => { if (dragging) moveSlider(e.clientX); }, opts);
    box.addEventListener("mouseup", () => dragging = false, opts);
    box.addEventListener("touchstart", (e) => { dragging = true; moveSlider(e.touches[0].clientX); }, { ...opts, passive: true });
    box.addEventListener("touchmove", (e) => { if (dragging) moveSlider(e.touches[0].clientX); }, { ...opts, passive: true });
    box.addEventListener("touchend", () => dragging = false, opts);
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "关闭对比";
    closeBtn.style.cssText = "padding:8px 20px;border:2px solid #fff;border-radius:6px;background:rgba(255,255,255,.15);color:#fff;font-weight:700;cursor:pointer;font-size:14px";
    closeBtn.onclick = () => { ac.abort(); overlay.remove(); };
    overlay.appendChild(box);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) { ac.abort(); overlay.remove(); } });
  }

  return { exportAsFormat, showCalculator, showComparison, calcBeadSize };
})();
