/**
 * tutorial.js — 首次使用引导 + 空状态提示
 */
const Tutorial = (() => {
  const STORAGE_KEY = "pindou-onboarded";
  const steps = [
    {
      title: "欢迎使用拼豆图稿生成器",
      text: "把图片变成拼豆像素图，还能直接导出打印图纸。<br><br>整个过程只需要 4 步，跟我来。",
      icon: " whale",
    },
    {
      title: "① 上传图片",
      text: "点左侧「选择图片」上传一张照片或插画。<br><br>支持 JPG / PNG / GIF / WebP，背景简单的图效果最好。",
      icon: " image",
      highlight: "#file",
    },
    {
      title: "② 调整配色与尺寸",
      text: "选择拼豆品牌（默认 MARD 291 色），设置格子宽度。<br><br>「自动抠图」会去掉背景，「高级设置」里还能调容差和描边。",
      icon: " palette",
      highlight: ".controls-toggle",
    },
    {
      title: "③ 生成图稿",
      text: "点「生成图稿」，等几秒就能看到像素化结果。<br><br>可以拖拽平移、滚轮缩放，逐格查看颜色。",
      icon: " sparkles",
      highlight: "#runBtn",
    },
    {
      title: "④ 导出与保存",
      text: "右侧有多种导出方式：预览图（免费）、高清 PNG / SVG / PDF（Pro）、材料包清单。<br><br>点「保存图纸」可以把作品存到图纸库，下次接着用。",
      icon: " download",
      highlight: "#exportMenuBtn",
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
      <div class="tut-card panel">
        <div class="tut-icon" id="tutIcon"></div>
        <div class="tut-title" id="tutTitle"></div>
        <div class="tut-text" id="tutText"></div>
        <div class="tut-dots" id="tutDots"></div>
        <div class="tut-actions">
          <button class="tut-btn tut-skip" id="tutSkip">跳过</button>
          <button class="tut-btn tut-prev" id="tutPrev" style="display:none">上一步</button>
          <button class="tut-btn primary tut-next" id="tutNext">开始</button>
        </div>
      </div>
      <div class="tut-spotlight" id="tutSpotlight"></div>
    `;
    document.body.appendChild(overlay);
    console.log("[Tutorial] overlay appended to body, children:", overlay.childNodes.length);
    document.getElementById("tutSkip").addEventListener("click", close);
    document.getElementById("tutPrev").addEventListener("click", prev);
    document.getElementById("tutNext").addEventListener("click", next);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  function render() {
    const s = steps[currentStep];
    document.getElementById("tutIcon").textContent = s.icon;
    document.getElementById("tutTitle").textContent = s.title;
    document.getElementById("tutText").innerHTML = s.text;
    const dots = document.getElementById("tutDots");
    dots.innerHTML = steps.map((_, i) =>
      `<span class="tut-dot${i === currentStep ? " active" : ""}"></span>`
    ).join("");
    document.getElementById("tutPrev").style.display = currentStep > 0 ? "" : "none";
    const nextBtn = document.getElementById("tutNext");
    nextBtn.textContent = currentStep === steps.length - 1 ? "开始使用" : "下一步";
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
    console.log("[Tutorial] start called");
    currentStep = 0;
    createOverlay();
    render();
    console.log("[Tutorial] overlay created:", !!overlay);
  }

  function init() {
    if (!isOnboarded()) {
      setTimeout(start, 600);
    }
  }

  return { init, start, isOnboarded };
})();
