/**
 * tutorial.js — 首次使用引导（步骤条 + 区域高亮）
 */
const Tutorial = (() => {
  const STORAGE_KEY = "pindou-onboarded";
  const steps = [
    {
      title: "欢迎",
      text: "把图片变成拼豆像素图，还能直接导出打印图纸。<br>整个过程只需要 4 步，跟我来。",
      icon: "🐳",
    },
    {
      title: "上传图片",
      text: "点「选择图片」上传一张照片或插画。<br>支持 JPG / PNG / GIF / WebP，背景简单的图效果最好。",
      icon: "📷",
      highlight: "#file",
    },
    {
      title: "调整设置",
      text: "选择拼豆品牌、格子宽度。<br>「自动抠图」去掉背景，「更多设置」里还能调容差和描边。",
      icon: "🎨",
      highlight: ".controls-basic",
    },
    {
      title: "生成图稿",
      text: "点「生成图稿」，等几秒就能看到像素化结果。<br>可以拖拽平移、滚轮缩放，逐格查看颜色。",
      icon: "✨",
      highlight: "#runBtn",
    },
    {
      title: "导出保存",
      text: "右侧面板有多种导出方式：预览图、高清图、SVG、PDF、材料包清单。<br>点「保存图纸」可以存到图纸库。",
      icon: "📦",
      highlight: ".side",
    },
  ];

  let currentStep = 0;
  let overlay = null;

  function isOnboarded() {
    try { return localStorage.getItem(STORAGE_KEY) === "done"; } catch (e) { return false; }
  }

  function markDone() {
    try { localStorage.setItem(STORAGE_KEY, "done"); } catch (e) {}
  }

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "tutorialOverlay";
    overlay.innerHTML = `
      <div class="tut-sidebar panel" id="tutSidebar">
        <div class="tut-sidebar-title">快速上手</div>
        <div class="tut-steps" id="tutSteps"></div>
        <div class="tut-text" id="tutText"></div>
        <div class="tut-actions">
          <button class="tut-btn tut-skip" id="tutSkip">跳过</button>
          <button class="tut-btn tut-prev" id="tutPrev" style="display:none">← 上一步</button>
          <button class="tut-btn primary tut-next" id="tutNext">开始 →</button>
        </div>
      </div>
      <div class="tut-spotlight" id="tutSpotlight"></div>
    `;
    document.body.appendChild(overlay);
    document.getElementById("tutSkip").addEventListener("click", close);
    document.getElementById("tutPrev").addEventListener("click", prev);
    document.getElementById("tutNext").addEventListener("click", next);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  function render() {
    const s = steps[currentStep];
    const stepsEl = document.getElementById("tutSteps");
    stepsEl.innerHTML = steps.map((st, i) => {
      const state = i < currentStep ? "done" : i === currentStep ? "active" : "pending";
      return `<div class="tut-step ${state}">
        <span class="tut-step-num">${i < currentStep ? "✓" : (i + 1)}</span>
        <span class="tut-step-label">${st.title}</span>
      </div>`;
    }).join("");
    document.getElementById("tutText").innerHTML = s.text;
    document.getElementById("tutPrev").style.display = currentStep > 0 ? "" : "none";
    const nextBtn = document.getElementById("tutNext");
    nextBtn.textContent = currentStep === steps.length - 1 ? "开始使用 →" : "下一步 →";
    const spotlight = document.getElementById("tutSpotlight");
    if (s.highlight) {
      const el = document.querySelector(s.highlight);
      if (el) {
        const r = el.getBoundingClientRect();
        spotlight.style.display = "block";
        spotlight.style.top = (r.top - 6) + "px";
        spotlight.style.left = (r.left - 6) + "px";
        spotlight.style.width = (r.width + 12) + "px";
        spotlight.style.height = (r.height + 12) + "px";
        return;
      }
    }
    spotlight.style.display = "none";
  }

  function next() {
    if (currentStep < steps.length - 1) {
      currentStep++;
      render();
    } else {
      close();
    }
  }

  function prev() {
    if (currentStep > 0) { currentStep--; render(); }
  }

  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
    markDone();
  }

  function start() {
    currentStep = 0;
    createOverlay();
    render();
  }

  function init() {
    const force = new URLSearchParams(location.search).get("tutorial") === "1";
    if (force || !isOnboarded()) {
      setTimeout(start, 600);
    }
  }

  function forceShow() {
    start();
  }

  return { init, start, forceShow, isOnboarded };
})();
