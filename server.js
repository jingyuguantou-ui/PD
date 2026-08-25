const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generateSelfSigned } = require("./certgen");

const ROOT = __dirname;
const PORT = process.env.PORT || 8123;

let cfg = {};
try {
  cfg = require("./config.js");
} catch (e) {
  cfg = { AI_PROVIDER: "mock", AI_KEY: "", AI_BASE_URL: "" };
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".csv": "text/csv",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

async function fetchT(url, opts, ms = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function toDataUrl(url, cfg) {
  if (!url) throw new Error("empty image url");
  if (url.startsWith("data:")) return url;
  const headers = {};
  if (cfg.AI_KEY && url.includes("open.bigmodel")) {
    headers["Authorization"] = `Bearer ${cfg.AI_KEY}`;
  }
  const r = await fetch(url, { headers });
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "image/png";
  return "data:" + ct + ";base64," + buf.toString("base64");
}

function genMock(prompt) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#6366f1'/><stop offset='1' stop-color='#ec4899'/></linearGradient></defs><rect width='512' height='512' fill='url(#g)'/><text x='50%' y='47%' fill='#ffffff' font-size='30' text-anchor='middle' font-family='sans-serif'>AI 预览（mock）</text><text x='50%' y='56%' fill='#ffffff' font-size='20' text-anchor='middle' font-family='sans-serif'>${(prompt || "").slice(0, 22)}</text></svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

async function genCogView(prompt, cfg) {
  if (!cfg.AI_KEY) throw new Error("未配置 AI_KEY，无法调用 CogView");
  const r = await fetchT(
    "https://open.bigmodel.cn/api/paas/v4/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.AI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "cogview-3-plus",
        prompt,
        n: 1,
        size: "1024x1024",
      }),
    },
    60000
  );
  const j = await r.json();
  const img = j.data && (j.data[0].url || j.data[0].b64_json);
  return await toDataUrl(img, cfg);
}

async function genWanx(prompt, cfg) {
  if (!cfg.AI_KEY) throw new Error("未配置 AI_KEY，无法调用通义万相");
  const r = await fetchT(
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.AI_KEY}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "disable",
      },
      body: JSON.stringify({
        model: "wanx-v1",
        input: { prompt },
        parameters: { size: "1024*1024", n: 1 },
      }),
    },
    60000
  );
  const j = await r.json();
  const url = j.output && j.output.results && j.output.results[0].url;
  return await toDataUrl(url, cfg);
}

async function genSD(prompt, cfg) {
  const base = (cfg.AI_BASE_URL || "http://127.0.0.1:7860").replace(/\/$/, "");
  const r = await fetchT(
    base + "/sdapi/v1/txt2img",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        steps: 20,
        width: 512,
        height: 512,
        cfg_scale: 7,
        send_images: true,
        save_images: false,
      }),
    },
    180000
  );
  const j = await r.json();
  if (!j.images || !j.images[0]) {
    throw new Error(j.error || "本地 SD 未返回图像（确认 SD 以 --api 启动且地址正确）");
  }
  return "data:image/png;base64," + j.images[0];
}

async function pollComfy(base, promptId, ms = 180000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const r = await fetchT(base + "/history/" + promptId, {}, 10000);
    const j = await r.json();
    if (j[promptId]) return j[promptId];
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error("ComfyUI 生成超时");
}

async function genComfy(prompt, cfg, opts = {}) {
  const base = (cfg.AI_BASE_URL || "http://127.0.0.1:8188").replace(/\/$/, "");
  let ckpt = "";
  try {
    const info = await fetchT(base + "/object_info/CheckpointLoaderSimple", {}, 15000);
    const j = await info.json();
    const list = j.CheckpointLoaderSimple.input.required.ckpt_name[0];
    ckpt = Array.isArray(list) && list.length ? list[0] : "";
  } catch (e) {
    ckpt = "";
  }
  if (opts.model) ckpt = opts.model;
  if (!ckpt) {
    throw new Error("ComfyUI 未获取到可用模型（确认 ComfyUI 已在 " + base + " 启动）");
  }
  const seed = Math.floor(Math.random() * 1e9);
  const steps = parseInt(opts.steps, 10) || 28;
  const cfgScale = parseFloat(opts.cfgScale) || 7;
  const sampler = opts.sampler || "dpmpp_2m";
  const scheduler = opts.scheduler || "karras";
  const size = parseInt(opts.size, 10) || 512;
  const negative = opts.negative || "";
  const workflow = {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg: cfgScale,
        sampler_name: sampler,
        scheduler,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: size, height: size, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["4", 1] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "PreviewImage", inputs: { images: ["8", 0] } },
  };
  const pr = await fetchT(
    base + "/prompt",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: "pindou" }),
    },
    30000
  );
  const pj = await pr.json();
  const promptId = pj.prompt_id;
  if (!promptId) throw new Error("ComfyUI 未返回 prompt_id：" + JSON.stringify(pj));
  const history = await pollComfy(base, promptId);
  const out = history.outputs && history.outputs["9"];
  if (!out || !out.images || !out.images[0]) throw new Error("ComfyUI 未返回图像");
  const img = out.images[0];
  const vr = await fetchT(
    base +
      "/view?filename=" +
      encodeURIComponent(img.filename) +
      "&subfolder=" +
      encodeURIComponent(img.subfolder || "") +
      "&type=" +
      encodeURIComponent(img.type || ""),
    {},
    30000
  );
  const buf = Buffer.from(await vr.arrayBuffer());
  return "data:image/png;base64," + buf.toString("base64");
}

async function generate(prompt, provider, opts = {}) {
  const p = provider || cfg.AI_PROVIDER;
  switch (p) {
    case "cogview":
      return await genCogView(prompt, cfg);
    case "wanx":
      return await genWanx(prompt, cfg);
    case "sd":
      return await genSD(prompt, cfg);
    case "comfy":
      return await genComfy(prompt, cfg, opts);
    case "mock":
    default:
      return genMock(prompt);
  }
}

const requestHandler = async (req, res) => {
  if (req.method === "GET" && req.url === "/api/ai-provider") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ provider: cfg.AI_PROVIDER }));
    return;
  }
  if (req.method === "GET" && req.url === "/api/comfy-models") {
    try {
      const base = (cfg.AI_BASE_URL || "http://127.0.0.1:8188").replace(/\/$/, "");
      const info = await fetchT(base + "/object_info/CheckpointLoaderSimple", {}, 15000);
      const j = await info.json();
      const list = j.CheckpointLoaderSimple.input.required.ckpt_name[0] || [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, models: Array.isArray(list) ? list : [] }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/ai-generate") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const {
          prompt,
          provider,
          model,
          negative,
          steps,
          cfg: cfgScale,
          sampler,
          scheduler,
          size,
        } = JSON.parse(body || "{}");
        if (!prompt) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "empty prompt" }));
          return;
        }
        const image = await generate(prompt, provider, {
          model,
          negative,
          steps,
          cfgScale,
          sampler,
          scheduler,
          size,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, image }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  // ---------- 图纸库（本地文件仓库） ----------
  const LIBRARY_DIR = path.join(ROOT, "library");
  function ensureLibrary() {
    if (!fs.existsSync(LIBRARY_DIR)) fs.mkdirSync(LIBRARY_DIR, { recursive: true });
    const idx = path.join(LIBRARY_DIR, "index.json");
    if (!fs.existsSync(idx)) fs.writeFileSync(idx, "[]");
  }
  function readIndex() {
    ensureLibrary();
    try {
      return JSON.parse(fs.readFileSync(path.join(LIBRARY_DIR, "index.json"), "utf8"));
    } catch (e) {
      return [];
    }
  }
  function writeIndex(arr) {
    fs.writeFileSync(path.join(LIBRARY_DIR, "index.json"), JSON.stringify(arr, null, 2));
  }
  function libId() {
    return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function safeId(id) {
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(id);
  }
  function readLibFile(id) {
    const f = path.join(LIBRARY_DIR, id + ".json");
    if (!fs.existsSync(f)) return null;
    try {
      return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch (e) {
      return null;
    }
  }

  if (req.method === "GET" && req.url === "/api/library") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(readIndex()));
    return;
  }
  if (req.method === "POST" && req.url === "/api/library") {
    ensureLibrary();
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const data = JSON.parse(body || "{}");
        if (!data.grid) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "empty grid" }));
          return;
        }
        const id = libId();
        const meta = {
          id,
          name: String(data.name || "未命名图纸").slice(0, 80),
          tags: Array.isArray(data.tags) ? data.tags.slice(0, 12).map(String) : [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cols: data.cols || 0,
          rows: data.rows || 0,
          w: data.w || 0,
          h: data.h || 0,
          thumb: typeof data.thumb === "string" ? data.thumb : "",
        };
        fs.writeFileSync(path.join(LIBRARY_DIR, id + ".json"), JSON.stringify({ ...data, id, name: meta.name, tags: meta.tags, createdAt: meta.createdAt, updatedAt: meta.updatedAt }));
        const arr = readIndex();
        arr.unshift(meta);
        writeIndex(arr);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, id }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  const libMatch = req.url.match(/^\/api\/library\/([A-Za-z0-9_-]+)$/);
  if (libMatch) {
    const id = libMatch[1];
    if (!safeId(id)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "bad id" }));
      return;
    }
    if (req.method === "GET") {
      const data = readLibFile(id);
      if (!data) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
      return;
    }
    if (req.method === "DELETE") {
      const f = path.join(LIBRARY_DIR, id + ".json");
      if (fs.existsSync(f)) fs.unlinkSync(f);
      writeIndex(readIndex().filter((m) => m.id !== id));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "PUT") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const cur = readLibFile(id);
          if (!cur) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "not found" }));
            return;
          }
          const patch = JSON.parse(body || "{}");
          if (patch.name != null) cur.name = String(patch.name).slice(0, 80);
          if (Array.isArray(patch.tags)) cur.tags = patch.tags.slice(0, 12).map(String);
          cur.updatedAt = Date.now();
          fs.writeFileSync(path.join(LIBRARY_DIR, id + ".json"), JSON.stringify(cur));
          const arr = readIndex().map((m) =>
            m.id === id ? { ...m, name: cur.name, tags: cur.tags, updatedAt: cur.updatedAt } : m
          );
          writeIndex(arr);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
  }

  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  sendFile(res, filePath);
};

function localIpSans() {
  const sans = ["DNS:localhost", "IP:127.0.0.1", "DNS:pindou.local"];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name]) {
      if (ni.family === "IPv4" && !ni.internal) sans.push("IP:" + ni.address);
    }
  }
  return sans;
}

function ensureCert() {
  const dir = path.join(ROOT, "cert");
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const { key, cert } = generateSelfSigned("pindou.local", localIpSans());
    fs.writeFileSync(keyPath, key);
    fs.writeFileSync(certPath, cert);
    console.log("已生成自签证书:", certPath);
    return { key, cert };
  } catch (e) {
    console.warn("生成自签证书失败，HTTPS 不可用：", e.message);
    return null;
  }
}

function startHttps() {
  const c = ensureCert();
  if (!c) return;
  const port = process.env.PORT_HTTPS || 8443;
  try {
    const s = https.createServer({ key: c.key, cert: c.cert }, requestHandler);
    s.listen(port, () => {
      console.log(`HTTPS 已启用: https://localhost:${port}  (PWA 安装/离线请用此地址)`);
      const nets = os.networkInterfaces();
      for (const n of Object.keys(nets)) {
        for (const ni of nets[n]) {
          if (ni.family === "IPv4" && !ni.internal) {
            console.log(`  手机/平板访问: https://${ni.address}:${port}`);
          }
        }
      }
    });
  } catch (e) {
    console.warn("HTTPS 启动失败：", e.message);
  }
}

const server = http.createServer(requestHandler);
server.on("error", (e) => console.warn(`HTTP 端口 ${PORT} 占用，仅 HTTPS 可用：`, e.message));

server.listen(PORT, () =>
  console.log(`拼豆图稿平台 running at http://localhost:${PORT}`)
);
startHttps();
