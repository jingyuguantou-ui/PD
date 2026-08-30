const $ = (sel) => document.querySelector(sel);

const AFFILIATE = (code, hex) =>
  `https://s.taobao.com/search?q=${encodeURIComponent("拼豆 " + code + " " + hex)}`;

const BG_BEAD = { code: "BG", hex: null, isBg: true, label: "背景" };

const EDGE_BG_THRESH = 120;
const OUTLINE_THRESH = 95;

function gridGradient(grid, rows, cols) {
  const lumAt = (r, c) => {
    r = r < 0 ? 0 : r >= rows ? rows - 1 : r;
    c = c < 0 ? 0 : c >= cols ? cols - 1 : c;
    const cell = grid[r][c];
    return 0.299 * cell.r + 0.587 * cell.g + 0.114 * cell.b;
  };
  const mag = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const gx =
        -lumAt(r - 1, c - 1) - 2 * lumAt(r, c - 1) - lumAt(r + 1, c - 1) +
        lumAt(r - 1, c + 1) + 2 * lumAt(r, c + 1) + lumAt(r + 1, c + 1);
      const gy =
        -lumAt(r - 1, c - 1) - 2 * lumAt(r - 1, c) - lumAt(r - 1, c + 1) +
        lumAt(r + 1, c - 1) + 2 * lumAt(r + 1, c) + lumAt(r + 1, c + 1);
      mag[r][c] = Math.sqrt(gx * gx + gy * gy);
    }
  return mag;
}

function darkestPaletteColor(palette) {
  let best = palette[0];
  let bl = Infinity;
  for (const c of palette) {
    const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    if (l < bl) { bl = l; best = c; }
  }
  return best;
}

function effRgb(cell) {
  if (cell.override) return cell.override;
  return { r: cell.r, g: cell.g, b: cell.b };
}

const state = {
  img: null,
  result: null,
  paletteKey: "mard",
  paletteSize: 291,
  cols: 58,
  mode: "bead",
  colorMode: "palette",
  maxColors: 0,
  showGhost: false,
  pro: false,
  aiImage: null,
  boardOrientation: "square",
  removeBg: true,
  bgTol: 40,
  edgeAware: false,
  outlineMode: false,
  pixelWhiteBg: false,
  editing: false,
  editTool: "paint",
  editColorIdx: 0,
  zoom: "fit",
  showGrid: false,
  showBoards: false,
  refOutline: false,
  highlightEdits: false,
  symmetry: "none",
  tempShape: null,
  sel: null,
};

let previewCellSize = 0;
let editFullPalette = [];
let editCodeIndex = {};
let undoStack = [];
let redoStack = [];
let strokeChanges = null;
let moveSnap = null;
let dragMode = null;
let clipboard = null;
let edgeCache = null;
let textStart = null;
let _redrawQueued = false;
function scheduleRedraw() {
  if (_redrawQueued) return;
  _redrawQueued = true;
  requestAnimationFrame(() => {
    _redrawQueued = false;
    redraw();
  });
}

const PROJ_KEY = "pindou-project-v1";
const BEAD_PACK_SIZE = 1000;
const BEAD_PACK_PRICE = 9;
function setHint(msg) {
  const h = $("#hint");
  if (h) h.textContent = msg;
}

function boardDims() {
  switch (state.boardOrientation) {
    case "h":
      return { bw: 58, bh: 29 };
    case "v":
      return { bw: 29, bh: 58 };
    case "big":
      return { bw: 58, bh: 58 };
    default:
      return { bw: 29, bh: 29 };
  }
}

const labCacheMap = {};

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function rgbToLab(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  r = lin(r);
  g = lin(g);
  b = lin(b);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function buildReducedPalette(colors, n) {
  const labs = colors.map((c) => rgbToLab(c.r, c.g, c.b));
  let anchor = 0;
  let minL = Infinity;
  for (let i = 0; i < labs.length; i++) {
    if (labs[i].L < minL) {
      minL = labs[i].L;
      anchor = i;
    }
  }
  const chosen = [anchor];
  const minDist = new Array(colors.length).fill(Infinity);
  while (chosen.length < n) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < colors.length; i++) {
      let md = Infinity;
      for (const ci of chosen) {
        const p = labs[ci];
        const q = labs[i];
        const d = (p.L - q.L) ** 2 + (p.a - q.a) ** 2 + (p.b - q.b) ** 2;
        if (d < md) md = d;
      }
      minDist[i] = Math.min(minDist[i], md);
      if (minDist[i] > bestD) {
        bestD = minDist[i];
        best = i;
      }
    }
    chosen.push(best);
  }
  return chosen.map((i) => ({ ...colors[i] }));
}

function getActivePalette(brand, size) {
  const full = BEAD_PALETTES[brand].colors;
  if (size >= full.length) return full;
  return buildReducedPalette(full, size);
}

function getLabCache(brand, size) {
  const key = brand + ":" + size;
  if (labCacheMap[key]) return labCacheMap[key];
  const pal = getActivePalette(brand, size);
  const cache = pal.map((c) => rgbToLab(c.r, c.g, c.b));
  labCacheMap[key] = cache;
  return cache;
}

function nearestColorIndex(targetLab, palLab) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palLab.length; i++) {
    const p = palLab[i];
    const dL = targetLab.L - p.L;
    const da = targetLab.a - p.a;
    const db = targetLab.b - p.b;
    const d = dL * dL + da * da + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function sqDist(a, b) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function kmeansRgb(points, k) {
  const n = points.length;
  if (k >= n) {
    return { labels: points.map((_, i) => i), centroids: points.map((p) => ({ r: p.r, g: p.g, b: p.b })) };
  }
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let best = null;
  let bestInertia = Infinity;
  for (let trial = 0; trial < 5; trial++) {
    const centroids = [];
    centroids[0] = { r: points[Math.floor(rnd() * n)].r, g: points[Math.floor(rnd() * n)].g, b: points[Math.floor(rnd() * n)].b };
    const d2 = new Array(n).fill(Infinity);
    while (centroids.length < k) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const dd = sqDist(points[i], centroids[centroids.length - 1]);
        if (dd < d2[i]) d2[i] = dd;
        sum += d2[i];
      }
      if (sum === 0) {
        const idx = Math.floor(rnd() * n);
        centroids.push({ r: points[idx].r, g: points[idx].g, b: points[idx].b });
        continue;
      }
      let target = rnd() * sum, acc = 0, pick = 0;
      for (let i = 0; i < n; i++) {
        acc += d2[i];
        if (acc >= target) { pick = i; break; }
      }
      centroids.push({ r: points[pick].r, g: points[pick].g, b: points[pick].b });
    }
    const labels = new Array(n).fill(0);
    for (let iter = 0; iter < 14; iter++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        let bestC = 0, bestD = Infinity;
        for (let c = 0; c < k; c++) {
          const dd = sqDist(points[i], centroids[c]);
          if (dd < bestD) { bestD = dd; bestC = c; }
        }
        if (labels[i] !== bestC) { labels[i] = bestC; moved = true; }
      }
      const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
      for (let i = 0; i < n; i++) {
        const l = labels[i];
        sums[l].r += points[i].r; sums[l].g += points[i].g; sums[l].b += points[i].b; sums[l].n++;
      }
      for (let c = 0; c < k; c++) {
        if (!sums[c].n) continue;
        centroids[c] = { r: sums[c].r / sums[c].n, g: sums[c].g / sums[c].n, b: sums[c].b / sums[c].n };
      }
      if (!moved && iter > 0) break;
    }
    let inertia = 0;
    for (let i = 0; i < n; i++) inertia += sqDist(points[i], centroids[labels[i]]);
    if (inertia < bestInertia) {
      bestInertia = inertia;
      best = { labels: labels.slice(), centroids: centroids.map((c) => ({ r: c.r, g: c.g, b: c.b })) };
    }
  }
  return best;
}

function detectBackground(grid, rows, cols, tol, edgeAware, grad) {
  const inb = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
  let sr = 0, sg = 0, sb = 0, nb = 0;
  const acc = (cell) => {
    if (!cell.blank && !cell.bg) { sr += cell.r; sg += cell.g; sb += cell.b; nb++; }
  };
  for (let c = 0; c < cols; c++) { acc(grid[0][c]); acc(grid[rows - 1][c]); }
  for (let r = 0; r < rows; r++) { acc(grid[r][0]); acc(grid[r][cols - 1]); }
  if (nb === 0) return;
  sr /= nb; sg /= nb; sb /= nb;
  const tol2 = tol * tol;
  const dist2 = (cell) => {
    const dr = cell.r - sr, dg = cell.g - sg, db = cell.b - sb;
    return dr * dr + dg * dg + db * db;
  };
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const stack = [];
  const tryPush = (r, c) => {
    if (!inb(r, c)) return;
    const cell = grid[r][c];
    if (cell.blank || cell.bg || visited[r][c]) return;
    if (dist2(cell) <= tol2) { visited[r][c] = true; stack.push([r, c]); }
  };
  for (let c = 0; c < cols; c++) { tryPush(0, c); tryPush(rows - 1, c); }
  for (let r = 0; r < rows; r++) { tryPush(r, 0); tryPush(r, cols - 1); }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (!inb(nr, nc)) continue;
      const ncell = grid[nr][nc];
      if (ncell.blank || ncell.bg || visited[nr][nc]) continue;
      if (edgeAware && grad && Math.max(grad[r][c], grad[nr][nc]) > EDGE_BG_THRESH) continue;
      if (dist2(ncell) <= tol2) { visited[nr][nc] = true; stack.push([nr, nc]); }
    }
  }
  let cnt = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (visited[r][c]) { grid[r][c].bg = true; cnt++; }
  if (cnt > 0.85 * rows * cols) {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) grid[r][c].bg = false;
  }
}

function processImage(img, cols, brand, size, maxColors, opts) {
  const palette = getActivePalette(brand, size);
  const palLab = getLabCache(brand, size);
  const rows = Math.max(1, Math.round((cols * img.height) / img.width));
  const tc = document.createElement("canvas");
  tc.width = img.width;
  tc.height = img.height;
  const tctx = tc.getContext("2d");
  tctx.drawImage(img, 0, 0);
  const data = tctx.getImageData(0, 0, img.width, img.height).data;

  const cw = img.width / cols;
  const ch = img.height / rows;
  const grid = [];
  const flat = [];

  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      let R = 0, G = 0, B = 0, n = 0;
      const sx = Math.floor(c * cw);
      const sy = Math.floor(r * ch);
      const ex = Math.floor((c + 1) * cw);
      const ey = Math.floor((r + 1) * ch);
      for (let y = sy; y < ey; y++) {
        const rowOff = y * img.width;
        for (let x = sx; x < ex; x++) {
          const i = (rowOff + x) * 4;
          if (data[i + 3] > 128) {
            R += data[i];
            G += data[i + 1];
            B += data[i + 2];
            n++;
          }
        }
      }
      const ar = n ? R / n : 255;
      const ag = n ? G / n : 255;
      const ab = n ? B / n : 255;
      const cell = { ci: 0, r: ar, g: ag, b: ab, n };
      grid[r][c] = cell;
      flat.push(cell);
    }
  }

  if (opts && opts.removeBg) {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (grid[r][c].n === 0) grid[r][c].bg = true;
    const grad = opts.edgeAware ? gridGradient(grid, rows, cols) : null;
    detectBackground(grid, rows, cols, opts.bgTol || 40, opts.edgeAware, grad);
  }

  const doReduce = maxColors && maxColors >= 2;
  let reduced = false;
  if (doReduce) {
    const distinct = new Set(flat.map((s) => `${s.r},${s.g},${s.b}`));
    if (distinct.size > maxColors) {
      const { labels, centroids } = kmeansRgb(flat, maxColors);
      const sums = Array.from({ length: maxColors }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
      flat.forEach((s, i) => {
        const l = labels[i];
        sums[l].r += s.r; sums[l].g += s.g; sums[l].b += s.b; sums[l].n++;
      });
      const repCi = sums.map((sm) =>
        sm.n === 0 ? 0 : nearestColorIndex(rgbToLab(sm.r / sm.n, sm.g / sm.n, sm.b / sm.n), palLab)
      );
      flat.forEach((s, i) => {
        const ci = repCi[labels[i]];
        s.ci = ci;
        const pc = palette[ci];
        s.r = pc.r; s.g = pc.g; s.b = pc.b;
      });
      reduced = true;
    }
  }
  if (!reduced) {
    flat.forEach((s) => {
      s.ci = s.n ? nearestColorIndex(rgbToLab(s.r, s.g, s.b), palLab) : 0;
    });
  }

  if (opts && opts.outlineMode) {
    const grad = gridGradient(grid, rows, cols);
    const eff = (cell) => (cell.override ? cell.override : { r: cell.r, g: cell.g, b: cell.b });
    const dark = darkestPaletteColor(palette);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell.bg || cell.blank) continue;
        if (grad[r][c] > OUTLINE_THRESH) {
          const e = eff(cell);
          if (0.299 * e.r + 0.587 * e.g + 0.114 * e.b <= 0.299 * dark.r + 0.587 * dark.g + 0.114 * dark.b + 20)
            continue;
          cell.override = { code: dark.code, hex: dark.hex, r: dark.r, g: dark.g, b: dark.b };
          cell.outline = true;
        }
      }
  }

  const counts = new Array(palette.length).fill(0);
  flat.forEach((s) => { if (!s.blank && !s.bg) counts[s.ci]++; });
  return { grid, counts, cols, rows, paletteKey: brand, size, palette };
}

function textOnRgb(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1a1a1a" : "#ffffff";
}

function cellDrawColor(cell, palette) {
  if (cell.override) return { r: cell.override.r, g: cell.override.g, b: cell.override.b };
  if (state.colorMode === "original") return { r: cell.r, g: cell.g, b: cell.b };
  const h = hexToRgb(palette[cell.ci].hex);
  return h;
}

function drawCell(ctx, cell, palette, px, py, cellSize, blueprint) {
  if (cell.blank || cell.bg) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px, py, cellSize, cellSize);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
    return;
  }
  const dc = cellDrawColor(cell, palette);
  const ccx = px + cellSize / 2;
  const ccy = py + cellSize / 2;
  if (blueprint) {
    ctx.fillStyle = `rgb(${dc.r},${dc.g},${dc.b})`;
    ctx.fillRect(px, py, cellSize, cellSize);
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, cellSize, cellSize);
    const effCode = cell.override ? cell.override.code : palette[cell.ci] ? palette[cell.ci].code : "";
    ctx.fillStyle = textOnRgb(dc.r, dc.g, dc.b);
    const fs = Math.floor(cellSize * (effCode.length > 2 ? 0.42 : 0.62));
    ctx.font = `${fs}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(effCode, ccx, ccy);
  } else {
    if (cellSize >= 10) {
      const grad = ctx.createRadialGradient(
        ccx - cellSize * 0.18,
        ccy - cellSize * 0.18,
        cellSize * 0.1,
        ccx,
        ccy,
        cellSize * 0.55
      );
      grad.addColorStop(
        0,
        `rgb(${Math.min(255, dc.r + 40)},${Math.min(255, dc.g + 40)},${Math.min(255, dc.b + 40)})`
      );
      grad.addColorStop(1, `rgb(${dc.r},${dc.g},${dc.b})`);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = `rgb(${dc.r},${dc.g},${dc.b})`;
    }
    ctx.beginPath();
    ctx.arc(ccx, ccy, cellSize * 0.46, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBoard(ctx, result, bx, by, ox, oy, cellSize, blueprint, boardNo, opt = {}) {
  const { grid, cols, rows } = result;
  const palette = result.palette;
  const { bw, bh } = boardDims();
  const x0 = bx * bw;
  const y0 = by * bh;
  const wCells = opt.wCells != null ? opt.wCells : Math.min(bw, cols - x0);
  const hCells = opt.hCells != null ? opt.hCells : Math.min(bh, rows - y0);

  if (opt.border) {
    ctx.strokeStyle = "#9ca3af";
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(ox - 8, oy - 8, wCells * cellSize + 16, hCells * cellSize + 16);
    ctx.setLineDash([]);
  }
  if (opt.label && boardNo) {
    ctx.fillStyle = "#374151";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      `板 ${boardNo}（列 ${x0 + 1}-${x0 + wCells}，行 ${y0 + 1}-${y0 + hCells}）`,
      ox,
      oy - 12
    );
  }

  for (let yy = 0; yy < hCells; yy++) {
    for (let xx = 0; xx < wCells; xx++) {
      drawCell(ctx, grid[y0 + yy][x0 + xx], palette, ox + xx * cellSize, oy + yy * cellSize, cellSize, blueprint);
    }
  }

  if (opt.colLabels && blueprint) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let xx = 0; xx < wCells; xx += 5) {
      ctx.fillText(String(x0 + xx + 1), ox + xx * cellSize, oy + hCells * cellSize + 3);
    }
  }
}

function renderPattern(canvas, result, cellSize, opts = {}) {
  const block = !!opts.block;
  const ghost = opts.ghost || null;
  const blueprint = state.mode === "blueprint";

  const { bw, bh } = boardDims();
  const bxCount = block ? Math.ceil(result.cols / bw) : 1;
  const byCount = block ? Math.ceil(result.rows / bh) : 1;
  const pad = block ? 24 : 0;

  const boardW = (b) => (block ? Math.min(bw, result.cols - b * bw) : result.cols);
  const boardH = (b) => (block ? Math.min(bh, result.rows - b * bh) : result.rows);

  const colX = [];
  let cx = 0;
  for (let b = 0; b < bxCount; b++) {
    colX[b] = cx;
    cx += boardW(b) * cellSize + pad * 2;
  }
  const rowY = [];
  let cy = 0;
  for (let b = 0; b < byCount; b++) {
    rowY[b] = cy;
    cy += boardH(b) * cellSize + pad * 2;
  }

  canvas.width = cx;
  canvas.height = cy;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let boardNo = 0;
  for (let by = 0; by < byCount; by++) {
    for (let bx = 0; bx < bxCount; bx++) {
      boardNo++;
      drawBoard(
        ctx,
        result,
        bx,
        by,
        colX[bx] + pad,
        rowY[by] + pad,
        cellSize,
        blueprint,
        block ? boardNo : 0,
        {
          border: block,
          label: block,
          colLabels: block,
          wCells: boardW(bx),
          hCells: boardH(by),
        }
      );
    }
  }

  if (ghost && !block) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.drawImage(ghost, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  if (!block && (opts.showGrid || opts.showBoards || opts.refOutline || opts.highlightEdits || opts.sel || opts.tempShape)) {
    drawEditOverlays(ctx, result, cellSize, opts);
  }

  if (opts.watermark) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#333";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 6);
    const span = Math.max(canvas.width, canvas.height);
    for (let y = -span; y < span; y += 120) {
      for (let x = -span; x < span; x += 260) {
        ctx.fillText("拼豆图稿平台", x, y);
      }
    }
    ctx.restore();
  }
}

function normSel(s) {
  return {
    r0: Math.min(s.r0, s.r1),
    r1: Math.max(s.r0, s.r1),
    c0: Math.min(s.c0, s.c1),
    c1: Math.max(s.c0, s.c1),
  };
}

function shapeCells(tool, r0, c0, r1, c1, cols, rows) {
  r0 = Math.max(0, Math.min(rows - 1, r0));
  r1 = Math.max(0, Math.min(rows - 1, r1));
  c0 = Math.max(0, Math.min(cols - 1, c0));
  c1 = Math.max(0, Math.min(cols - 1, c1));
  const cells = [];
  const put = (r, c) => {
    if (r >= 0 && r < rows && c >= 0 && c < cols) cells.push({ r, c });
  };
  if (tool === "line") {
    let x0 = c0, y0 = r0, x1 = c1, y1 = r1;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      put(y0, x0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  } else {
    const rmin = Math.min(r0, r1), rmax = Math.max(r0, r1);
    const cmin = Math.min(c0, c1), cmax = Math.max(c0, c1);
    const rr = (rmax - rmin) / 2, cc = (cmax - cmin) / 2;
    for (let r = rmin; r <= rmax; r++) {
      for (let c = cmin; c <= cmax; c++) {
        if (tool === "rect") {
          put(r, c);
        } else {
          if (rr === 0 && cc === 0) { put(r, c); continue; }
          const ny = (r - (rmin + rr)) / (rr || 1);
          const nx = (c - (cmin + cc)) / (cc || 1);
          if (nx * nx + ny * ny <= 1.03) put(r, c);
        }
      }
    }
  }
  return cells;
}

function symCells(r, c) {
  const res = state.result;
  const cr = (res.rows - 1) / 2;
  const cc = (res.cols - 1) / 2;
  const out = [{ r, c }];
  const push = (rr, cc2) => {
    if (rr >= 0 && rr < res.rows && cc2 >= 0 && cc2 < res.cols) out.push({ r: rr, c: cc2 });
  };
  if (state.symmetry === "h" || state.symmetry === "quad") push(r, Math.round(2 * cc - c));
  if (state.symmetry === "v" || state.symmetry === "quad") push(Math.round(2 * cr - r), c);
  if (state.symmetry === "quad") push(Math.round(2 * cr - r), Math.round(2 * cc - c));
  return out;
}

function paintStrokeCell(r, c, erase) {
  const res = state.result;
  const affected = symCells(r, c);
  for (const p of affected) {
    recordChange(p.r, p.c);
    const cell = res.grid[p.r][p.c];
    if (erase) {
      cell.blank = true;
      cell.override = null;
    } else {
      writeColor(cell, editFullPalette[state.editColorIdx]);
    }
  }
  scheduleRedraw();
}

function commitShape() {
  const sh = state.tempShape;
  state.tempShape = null;
  if (!sh) return;
  const res = state.result;
  const cells = shapeCells(sh.tool, sh.r0, sh.c0, sh.r1, sh.c1, res.cols, res.rows);
  strokeChanges = new Map();
  for (const p of cells) {
    const affected = symCells(p.r, p.c);
    for (const a of affected) {
      recordChange(a.r, a.c);
      const cell = res.grid[a.r][a.c];
      writeColor(cell, editFullPalette[state.editColorIdx]);
    }
  }
  commitStroke();
  redraw();
}

function selOp(erase) {
  const s = state.sel;
  if (!s) return;
  const ns = normSel(s);
  const res = state.result;
  strokeChanges = new Map();
  for (let r = ns.r0; r <= ns.r1; r++) {
    for (let c = ns.c0; c <= ns.c1; c++) {
      recordChange(r, c);
      const cell = res.grid[r][c];
      if (erase) {
        cell.blank = true;
        cell.override = null;
      } else {
        writeColor(cell, editFullPalette[state.editColorIdx]);
      }
    }
  }
  commitStroke();
  redraw();
}

function snapshotSel(ns) {
  return { r0: ns.r0, c0: ns.c0, r1: ns.r1, c1: ns.c1 };
}

function copySelection() {
  const s = state.sel;
  if (!s) return;
  const ns = normSel(s);
  const res = state.result;
  const cells = [];
  for (let r = ns.r0; r <= ns.r1; r++) {
    const row = [];
    for (let c = ns.c0; c <= ns.c1; c++) {
      const cell = res.grid[r][c];
      row.push({
        blank: cell.blank,
        bg: cell.bg,
        outline: cell.outline,
        override: cell.override ? { ...cell.override } : null,
        r: cell.r, g: cell.g, b: cell.b, ci: cell.ci,
      });
    }
    cells.push(row);
  }
  clipboard = { h: ns.r1 - ns.r0 + 1, w: ns.c1 - ns.c0 + 1, cells };
}

function pasteSelection() {
  if (!clipboard) return;
  const res = state.result;
  const base = state.sel ? normSel(state.sel) : { r0: 0, c0: 0 };
  const tr0 = Math.max(0, Math.min(res.rows - 1, base.r0));
  const tc0 = Math.max(0, Math.min(res.cols - 1, base.c0));
  strokeChanges = new Map();
  for (let r = 0; r < clipboard.h; r++) {
    for (let c = 0; c < clipboard.w; c++) {
      const tr = tr0 + r;
      const tc = tc0 + c;
      if (tr >= res.rows || tc >= res.cols) continue;
      recordChange(tr, tc);
      const d = res.grid[tr][tc];
      const v = clipboard.cells[r][c];
      d.blank = v.blank;
      d.bg = v.bg;
      d.outline = v.outline;
      d.override = v.override ? { ...v.override } : null;
      d.r = v.r; d.g = v.g; d.b = v.b; d.ci = v.ci;
    }
  }
  commitStroke();
  state.sel = {
    r0: tr0, c0: tc0, r1: Math.min(res.rows - 1, tr0 + clipboard.h - 1), c1: Math.min(res.cols - 1, tc0 + clipboard.w - 1),
  };
  redraw();
}

function applyMove(dr, dc) {
  const snap = moveSnap;
  if (!snap) return;
  const res = state.result;
  const s = normSel(snap);
  const vals = [];
  for (let r = s.r0; r <= s.r1; r++) {
    const row = [];
    for (let c = s.c0; c <= s.c1; c++) {
      const cell = res.grid[r][c];
      row.push({
        blank: cell.blank,
        bg: cell.bg,
        outline: cell.outline,
        override: cell.override ? { ...cell.override } : null,
        r: cell.r, g: cell.g, b: cell.b, ci: cell.ci,
      });
    }
    vals.push(row);
  }
  let nr0 = s.r0 + dr, nc0 = s.c0 + dc, nr1 = s.r1 + dr, nc1 = s.c1 + dc;
  nr0 = Math.max(0, Math.min(res.rows - 1, nr0));
  nr1 = Math.max(0, Math.min(res.rows - 1, nr1));
  nc0 = Math.max(0, Math.min(res.cols - 1, nc0));
  nc1 = Math.max(0, Math.min(res.cols - 1, nc1));
  strokeChanges = new Map();
  for (let r = s.r0; r <= s.r1; r++)
    for (let c = s.c0; c <= s.c1; c++) {
      recordChange(r, c);
      res.grid[r][c].blank = true;
      res.grid[r][c].override = null;
    }
  for (let r = s.r0; r <= s.r1; r++)
    for (let c = s.c0; c <= s.c1; c++) {
      const tr = nr0 + (r - s.r0);
      const tc = nc0 + (c - s.c0);
      if (tr >= 0 && tr < res.rows && tc >= 0 && tc < res.cols) {
        recordChange(tr, tc);
        const d = res.grid[tr][tc];
        const v = vals[r - s.r0][c - s.c0];
        d.blank = v.blank;
      d.bg = v.bg;
      d.outline = v.outline;
        d.override = v.override ? { ...v.override } : null;
        d.r = v.r; d.g = v.g; d.b = v.b; d.ci = v.ci;
      }
    }
  commitStroke();
  redraw();
  state.sel = { r0: nr0, c0: nc0, r1: nr1, c1: nc1 };
}

function transformPattern(kind) {
  const res = state.result;
  if (!res) return;
  const { rows, cols, grid } = res;
  let nb, nr, nc;
  if (kind === "rot90") {
    nr = cols; nc = rows;
    nb = [];
    for (let r = 0; r < nr; r++) {
      const row = [];
      for (let c = 0; c < nc; c++) row.push(grid[rows - 1 - c][r]);
      nb.push(row);
    }
  } else if (kind === "flipH") {
    nb = grid.map((row) => row.slice().reverse());
    nr = rows; nc = cols;
  } else if (kind === "flipV") {
    nb = grid.slice().reverse();
    nr = rows; nc = cols;
  } else {
    return;
  }
  strokeChanges = new Map();
  for (let r = 0; r < nr; r++)
    for (let c = 0; c < nc; c++) recordChange(r, c);
  res.grid = nb;
  res.rows = nr;
  res.cols = nc;
  state.sel = null;
  commitStroke();
  updateBoardInfo();
  redraw();
}

function updateBoardInfo() {
  const res = state.result;
  if (!res) return;
  const { bw, bh } = boardDims();
  const bx = Math.ceil(res.cols / bw);
  const by = Math.ceil(res.rows / bh);
  const el = $("#boardInfo");
  if (el) el.textContent = `板子：${bx * by} 块（${bw}×${bh}） · 画布 ${res.cols}×${res.rows}`;
}

function applyText(startR, startC, text, heightCells) {
  if (!text) return;
  const res = state.result;
  const S = 10;
  const H = Math.max(1, heightCells | 0);
  const fontPx = Math.floor(H * S * 0.95);
  const oc = document.createElement("canvas");
  const octx = oc.getContext("2d");
  octx.font = `bold ${fontPx}px sans-serif`;
  const w = Math.max(1, Math.ceil(octx.measureText(text).width) + 2);
  oc.width = w;
  oc.height = H * S;
  octx.font = `bold ${fontPx}px sans-serif`;
  octx.fillStyle = "#000";
  octx.textBaseline = "top";
  octx.fillText(text, 1, 1);
  const data = octx.getImageData(0, 0, oc.width, oc.height).data;
  strokeChanges = new Map();
  const col = editFullPalette[state.editColorIdx];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < oc.width; c++) {
      const px = c * S + (S >> 1);
      const py = r * S + (S >> 1);
      if (px >= oc.width) continue;
      const alpha = data[(py * oc.width + px) * 4 + 3];
      if (alpha > 128) {
        const gr = startR + r;
        const gc = startC + c;
        if (gr >= 0 && gr < res.rows && gc >= 0 && gc < res.cols) {
          recordChange(gr, gc);
          const cell = res.grid[gr][gc];
          writeColor(cell, col);
        }
      }
    }
  }
  commitStroke();
  redraw();
}

function getEdgeCanvas() {
  const res = state.result;
  const img = state.img;
  if (!img) return null;
  const key = (img.src || "img") + ":" + res.cols + ":" + res.rows;
  if (edgeCache && edgeCache.key === key) return edgeCache.canvas;
  const w = res.cols;
  const h = res.rows;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const lum = (x, y) => {
    const i = (y * w + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = lum(x, y);
      const lx = x > 0 ? lum(x - 1, y) : l;
      const ly = y > 0 ? lum(x, y - 1) : l;
      const g = Math.abs(l - lx) + Math.abs(l - ly);
      const o = (y * w + x) * 4;
      const edge = g > 38;
      const v = edge ? 20 : 255;
      out.data[o] = v;
      out.data[o + 1] = v;
      out.data[o + 2] = v;
      out.data[o + 3] = edge ? 200 : 0;
    }
  }
  ctx.putImageData(out, 0, 0);
  edgeCache = { key, canvas: c };
  return c;
}

function exportBoards() {
  if (!state.result) { setHint("请先生成图纸，再导出"); return; }
  if (!state.pro) {
    openPaywall("分板裁切图（每板一页）为 Pro 功能");
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF 导出需要联网加载 jsPDF 库，请检查网络后重试。");
    return;
  }
  const { jsPDF } = window.jspdf;
  const result = state.result;
  const { cols, rows } = result;
  const { bw, bh } = boardDims();
  const bxCount = Math.ceil(cols / bw);
  const byCount = Math.ceil(rows / bh);
  const total = bxCount * byCount;
  const boardPx = 44;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const margin = 12;
  let n = 0;
  for (let by = 0; by < byCount; by++) {
    for (let bx = 0; bx < bxCount; bx++) {
      n++;
      const c = renderBoardToCanvas(result, bx, by, boardPx, { boardNo: n, total });
      if (n > 1) pdf.addPage();
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2 - 20;
      const wCells = Math.min(bw, cols - bx * bw);
      const hCells = Math.min(bh, rows - by * bh);
      const cellMm = Math.min(availW / wCells, availH / hCells);
      const imgW = wCells * cellMm;
      const imgH = hCells * cellMm;
      pdf.setFontSize(14);
      pdf.setTextColor(20);
      pdf.text(
        `板 ${n} / ${total}（列 ${bx * bw + 1}-${bx * bw + wCells}，行 ${by * bh + 1}-${by * bh + hCells}）`,
        margin,
        margin
      );
      pdf.addImage(
        c.toDataURL("image/png"),
        "PNG",
        margin + (availW - imgW) / 2,
        margin + 16 + (availH - imgH) / 2,
        imgW,
        imgH
      );
    }
  }
  pdf.save("pindou-boards-A4.pdf");
}

function drawEditOverlays(ctx, result, cellSize, opts) {
  const { cols, rows } = result;
  if (opts.showGrid) {
    ctx.strokeStyle = "rgba(15,23,42,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) {
      const x = c * cellSize + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rows * cellSize);
    }
    for (let r = 0; r <= rows; r++) {
      const y = r * cellSize + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(cols * cellSize, y);
    }
    ctx.stroke();
  }
  if (opts.showBoards) {
    const { bw, bh } = boardDims();
    ctx.strokeStyle = "rgba(79,70,229,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let c = 0; c <= cols; c += bw) {
      const x = c * cellSize;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rows * cellSize);
    }
    for (let r = 0; r <= rows; r += bh) {
      const y = r * cellSize;
      ctx.moveTo(0, y);
      ctx.lineTo(cols * cellSize, y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(79,70,229,0.95)";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let n = 0;
    for (let by = 0; by < rows; by += bh)
      for (let bx = 0; bx < cols; bx += bw) {
        n++;
        ctx.fillText("板" + n, bx * cellSize + 3, by * cellSize + 3);
      }
  }
  if (opts.refOutline) {
    const ec = getEdgeCanvas();
    if (ec) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ec, 0, 0, cols * cellSize, rows * cellSize);
      ctx.restore();
    }
  }
  if (opts.tempShape) {
    const cells = shapeCells(
      opts.tempShape.tool,
      opts.tempShape.r0,
      opts.tempShape.c0,
      opts.tempShape.r1,
      opts.tempShape.c1,
      cols,
      rows
    );
    const col = editFullPalette[state.editColorIdx];
    ctx.fillStyle = col.isBg
      ? "rgba(120,120,120,0.4)"
      : `rgba(${col.r},${col.g},${col.b},0.55)`;
    for (const p of cells)
      ctx.fillRect(p.c * cellSize + 1, p.r * cellSize + 1, cellSize - 2, cellSize - 2);
  }
  if (opts.sel) {
    const s = normSel(opts.sel);
    ctx.strokeStyle = "#ff4d4f";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(
      s.c0 * cellSize + 1,
      s.r0 * cellSize + 1,
      (s.c1 - s.c0 + 1) * cellSize - 2,
      (s.r1 - s.r0 + 1) * cellSize - 2
    );
    ctx.setLineDash([]);
  }
  if (opts.highlightEdits) {
    ctx.fillStyle = "rgba(239,77,107,0.42)";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = result.grid[r][c];
        if (cell.override || cell.blank) {
          ctx.fillRect(c * cellSize + 1, r * cellSize + 1, cellSize - 2, cellSize - 2);
        }
      }
    }
  }
}

function renderBoardToCanvas(result, bx, by, cellSize, opts) {
  const { cols, rows } = result;
  const { bw, bh } = boardDims();
  const wCells = Math.min(bw, cols - bx * bw);
  const hCells = Math.min(bh, rows - by * bh);
  const pad = 18;
  const c = document.createElement("canvas");
  c.width = wCells * cellSize + pad * 2;
  c.height = hCells * cellSize + pad * 2;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  const blueprint = state.mode === "blueprint";
  drawBoard(ctx, result, bx, by, pad, pad, cellSize, blueprint, opts.boardNo, {
    border: true,
    label: true,
    colLabels: true,
  });
  const x0 = pad;
  const y0 = pad;
  const w = wCells * cellSize;
  const h = hCells * cellSize;
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1;
  const t = 6;
  const corners = [
    [x0, y0, 1, 1],
    [x0 + w, y0, -1, 1],
    [x0, y0 + h, 1, -1],
    [x0 + w, y0 + h, -1, -1],
  ];
  corners.forEach(([cx, cy, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * t);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * t, cy);
    ctx.stroke();
  });
  return c;
}

function effectiveColor(cell, result) {
  if (cell.blank || cell.bg) return null;
  if (cell.override) return cell.override;
  return result.palette[cell.ci];
}

function writeColor(cell, col) {
  cell.outline = false;
  if (col && col.isBg) {
    cell.bg = true;
    cell.blank = true;
    cell.override = null;
  } else {
    cell.override = { code: col.code, hex: col.hex, r: col.r, g: col.g, b: col.b };
    cell.blank = false;
    cell.bg = false;
  }
}

function tallyByCode(result) {
  const map = new Map();
  for (const row of result.grid) {
    for (const cell of row) {
      const c = effectiveColor(cell, result);
      if (!c) continue;
      const key = c.code;
      if (!map.has(key)) map.set(key, { code: c.code, hex: c.hex, r: c.r, g: c.g, b: c.b, count: 0 });
      map.get(key).count++;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function renderLegend(container, result) {
  const items = tallyByCode(result);
  const total = items.reduce((s, c) => s + c.count, 0);
  container.innerHTML = "";
  const head = document.createElement("div");
  head.className = "legend-head";
  head.textContent = `共 ${result.cols}×${result.rows} = ${total} 颗 · ${items.length} 色`;
  container.appendChild(head);
  const grid = document.createElement("div");
  grid.className = "legend-grid";
  for (const it of items) {
    const cell = document.createElement("div");
    cell.className = "legend-item";
    cell.innerHTML = `<span class="swatch" style="background:${it.hex}"></span>
      <span class="sym">${it.code}</span>
      <span class="lname">${it.code}</span>
      <span class="lcount">×${it.count}</span>`;
    grid.appendChild(cell);
  }
  container.appendChild(grid);
}

function updateInfoPanel() {
  const el = $("#infoPanel");
  const res = state.result;
  if (!el || !res) return;
  const perCm = 0.5;
  const wCm = (res.cols * perCm).toFixed(1);
  const hCm = (res.rows * perCm).toFixed(1);
  const items = tallyByCode(res);
  const placed = items.reduce((s, c) => s + c.count, 0);
  const total = res.cols * res.rows;
  const colors = items.length;
  let bgCount = 0;
  for (const row of res.grid) for (const cell of row) if (cell.bg) bgCount++;
  const packs = Math.max(1, Math.ceil(placed / BEAD_PACK_SIZE));
  const cost = packs * BEAD_PACK_PRICE;
  el.innerHTML =
    `<span><b>尺寸</b> ≈ ${wCm}×${hCm} cm</span>` +
    `<span><b>珠子</b> ${placed}/${total}</span>` +
    `<span><b>颜色</b> ${colors}</span>` +
    (state.removeBg
      ? `<span><b>背景</b> 已去 ${bgCount} 格（不计入珠数）</span>`
      : `<span><b>背景</b> 未去（计入珠数）</span>`) +
    `<span><b>估算用料</b> ≈ ¥${cost}（约 ${packs} 包·5mm混装≈¥9/1000颗）</span>`;
}

function run() {
  if (!state.img) return;
  const result = processImage(state.img, state.cols, state.paletteKey, state.paletteSize, state.maxColors, {
    removeBg: state.removeBg,
    bgTol: state.bgTol,
    edgeAware: state.edgeAware,
    outlineMode: state.outlineMode,
  });
  state.result = result;
  edgeCache = null;
  redraw();
  saveProject();
}

function enableOutputs() {
    ["exportPreview", "exportFull", "exportSvg", "exportPdf", "exportPack", "exportBoards", "exportPixel", "editToggle", "saveDrawingBtn"].forEach(
    (id) => {
      const el = $("#" + id);
      if (el) el.disabled = false;
    }
  );
    const details = document.querySelector(".details");
    if (details) details.classList.add("open");
}

function syncControlsFromState() {
  const set = (id, val) => {
    const el = $("#" + id);
    if (el) el.value = val;
  };
  set("palette", state.paletteKey);
  set("paletteSize", String(state.paletteSize));
  set("colorMode", state.colorMode);
  set("maxColors", String(state.maxColors));
  const rb = $("#removeBg");
  if (rb) rb.checked = state.removeBg;
  const bt = $("#bgTol");
  if (bt) bt.value = String(state.bgTol);
  const ea = $("#edgeAware");
  if (ea) ea.checked = state.edgeAware;
  const om = $("#outlineMode");
  if (om) om.checked = state.outlineMode;
  const pwb = $("#pixelWhiteBg");
  if (pwb) pwb.checked = state.pixelWhiteBg;
  set("cols", String(state.cols));
  set("boardOrientation", state.boardOrientation);
  const modeEl = $("#mode");
  if (modeEl) modeEl.checked = state.mode === "blueprint";
  const ghostEl = $("#ghost");
  if (ghostEl) ghostEl.checked = state.showGhost;
}

function saveProject() {
  try {
    const res = state.result;
    const obj = {
      v: 1,
      p: {
        paletteKey: state.paletteKey,
        paletteSize: state.paletteSize,
        cols: state.cols,
        colorMode: state.colorMode,
        maxColors: state.maxColors,
        boardOrientation: state.boardOrientation,
        removeBg: state.removeBg,
        bgTol: state.bgTol,
        edgeAware: state.edgeAware,
        outlineMode: state.outlineMode,
        pixelWhiteBg: state.pixelWhiteBg,
        mode: state.mode,
        showGhost: state.showGhost,
      },
      img: state._imgData && state._imgData.length < 1800000 ? state._imgData : null,
      grid: res ? res.grid : null,
      gcols: res ? res.cols : null,
      grows: res ? res.rows : null,
    };
    localStorage.setItem(PROJ_KEY, JSON.stringify(obj));
  } catch (e) {}
}

function restoreProject() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(PROJ_KEY));
  } catch (e) {
    return false;
  }
  if (!data || !data.grid) return false;
  Object.assign(state, data.p);
  state.editing = false;
  const palette = getActivePalette(state.paletteKey, state.paletteSize);
  const counts = new Array(palette.length).fill(0);
  for (const row of data.grid) {
    for (const c of row) {
      if (c.ci != null && c.ci < counts.length && !c.blank && !c.bg) counts[c.ci]++;
    }
  }
  state.result = {
    grid: data.grid,
    cols: data.gcols,
    rows: data.grows,
    paletteKey: state.paletteKey,
    size: state.paletteSize,
    palette,
    counts,
  };
  if (data.img) {
    state._imgData = data.img;
    const im = new Image();
    im.onload = () => {
      state.img = im;
      edgeCache = null;
    };
    im.src = data.img;
  }
  syncControlsFromState();
  enableOutputs();
  redraw();
  setHint("已自动恢复上次的工程");
  return true;
}

// ---------------- 图纸库（服务端文件仓库） ----------------
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
async function apiJSON(url, opts) {
  const r = await fetch(url, opts);
  return await r.json();
}
function currentDrawingPayload(extra) {
  const res = state.result;
  const cleanGrid = res
    ? res.grid.map((row) => row.map((c) => {
        const { n, ...rest } = c;
        return rest;
      }))
    : null;
  return Object.assign(
    {
      v: 1,
      p: {
        paletteKey: state.paletteKey,
        paletteSize: state.paletteSize,
        cols: state.cols,
        colorMode: state.colorMode,
        maxColors: state.maxColors,
        boardOrientation: state.boardOrientation,
        removeBg: state.removeBg,
        bgTol: state.bgTol,
        edgeAware: state.edgeAware,
        outlineMode: state.outlineMode,
        pixelWhiteBg: state.pixelWhiteBg,
        mode: state.mode,
        showGhost: state.showGhost,
      },
      grid: cleanGrid,
      gcols: res ? res.cols : null,
      grows: res ? res.rows : null,
      w: res ? (res.cols * 0.5).toFixed(1) : 0,
      h: res ? (res.rows * 0.5).toFixed(1) : 0,
    },
    extra || {}
  );
}
function makeThumb() {
  const src = document.getElementById("preview");
  if (!src || !src.width) return "";
  const max = 240;
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(src, 0, 0, w, h);
  try {
    return c.toDataURL("image/png");
  } catch (e) {
    return "";
  }
}
function applyDrawingData(data) {
  if (!data || !data.grid) return false;
  Object.assign(state, data.p);
  state.editing = false;
  const palette = getActivePalette(state.paletteKey, state.paletteSize);
  const counts = new Array(palette.length).fill(0);
  for (const row of data.grid)
    for (const c of row)
      if (c.ci != null && c.ci < counts.length && !c.blank && !c.bg) counts[c.ci]++;
  state.result = {
    grid: data.grid,
    cols: data.gcols,
    rows: data.grows,
    paletteKey: state.paletteKey,
    size: state.paletteSize,
    palette,
    counts,
  };
  edgeCache = null;
  syncControlsFromState();
  enableOutputs();
  redraw();
  return true;
}
async function saveDrawing() {
  if (!state.result) {
    alert("请先生成一张图纸，再保存到图纸库");
    return;
  }
  const nameEl = $("#libName");
  const tagsEl = $("#libTags");
  const name = (nameEl && nameEl.value ? nameEl.value : "").trim() || "图纸 " + new Date().toLocaleString();
  const tags = tagsEl && tagsEl.value
    ? tagsEl.value.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
    : [];
  const payload = currentDrawingPayload({ name, tags, thumb: makeThumb(), createdAt: Date.now() });
  let savedOk = false;
  let savedId = null;
  try {
    const r = await apiJSON("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) { savedOk = true; savedId = r.id; }
  } catch (e) {}
  if (savedId) payload.id = savedId;
  else payload.id = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  try { await LibraryDB.put(payload); } catch (e) {}
  setHint(savedOk ? "已同步保存到图纸库：" + name : "已保存到本机（离线）：" + name);
  if (nameEl) nameEl.value = "";
  if (tagsEl) tagsEl.value = "";
  loadLibraryList();
}
async function loadDrawing(id) {
  let data = null;
  try {
    data = await apiJSON("/api/library/" + encodeURIComponent(id));
    if (!data || !data.grid) data = null;
  } catch (e) {}
  if (!data) {
    try { data = await LibraryDB.get(id); } catch (e) {}
  }
  if (data && data.grid) {
    applyDrawingData(data);
    closeLibrary();
    setHint("已载入图纸：" + (data.name || id));
  } else {
    alert("载入失败：图纸数据不存在");
  }
}
async function deleteDrawing(id, name) {
  if (!confirm("确定删除图纸「" + name + "」？此操作不可撤销。")) return;
  try { await apiJSON("/api/library/" + encodeURIComponent(id), { method: "DELETE" }); } catch (e) {}
  try { await LibraryDB.del(id); } catch (e) {}
  loadLibraryList();
}
async function renameDrawing(id, name) {
  const nn = prompt("重命名图纸：", name);
  if (nn == null) return;
  const newName = nn.trim() || name;
  try {
    await apiJSON("/api/library/" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
  } catch (e) {}
  try {
    const local = await LibraryDB.get(id);
    if (local) { local.name = newName; await LibraryDB.put(local); }
  } catch (e) {}
  loadLibraryList();
}
async function loadLibraryList() {
  const grid = $("#libraryGrid");
  if (!grid) return;
  grid.innerHTML = '<p class="muted">加载中…</p>';
  let serverList = [];
  let localList = [];
  try {
    const data = await apiJSON("/api/library");
    serverList = Array.isArray(data) ? data : [];
  } catch (e) {}
  try { localList = await LibraryDB.list(); } catch (e) {}
  const merged = new Map();
  for (const m of serverList) merged.set(m.id, m);
  for (const m of localList) { if (!merged.has(m.id)) merged.set(m.id, m); }
  const list = [...merged.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!list.length) {
    grid.innerHTML = '<p class="muted">图纸库还是空的。先生成一张图纸，填好名称，点「保存到图纸库」。<br>图纸会同时保存到本机（离线可用）和服务器。</p>';
    return;
  }
  grid.innerHTML = list
    .map(
      (m) => `
    <div class="lib-card panel">
      <div class="lib-thumb">${m.thumb ? `<img src="${m.thumb}" alt="">` : '<span class="muted small">无预览</span>'}</div>
      <div class="lib-meta">
        <div class="lib-name">${escapeHtml(m.name)}</div>
        <div class="lib-sub muted small">${m.cols}×${m.rows} 格 · ${m.w}×${m.h} cm${
        m.tags && m.tags.length ? " · " + m.tags.map(escapeHtml).join(" / ") : ""
      }${String(m.id).startsWith("local-") ? ' · <span title="仅本机，未同步到服务器" style="color:var(--accent)">&#9679; 本地</span>' : ""}</div>
        <div class="lib-actions">
          <button class="mini-btn" data-load="${m.id}">载入</button>
          <button class="mini-btn" data-rename="${m.id}" data-name="${escapeHtml(m.name)}">重命名</button>
          <button class="mini-btn" data-del="${m.id}" data-name="${escapeHtml(m.name)}">删除</button>
        </div>
      </div>
    </div>`
    )
    .join("");
}
function openLibrary() {
  loadLibraryList();
  const m = $("#libraryModal");
  if (m) m.classList.add("show");
}
function closeLibrary() {
  const m = $("#libraryModal");
  if (m) m.classList.remove("show");
}

function clearProject() {
  try {
    localStorage.removeItem(PROJ_KEY);
  } catch (e) {}
  state.result = null;
  state.img = null;
  state._imgData = null;
  state.editing = false;
  state.paletteKey = "mard";
  state.paletteSize = 291;
  state.cols = 58;
  state.colorMode = "palette";
  state.maxColors = 0;
  state.boardOrientation = "square";
  state.mode = "bead";
  state.showGhost = false;
  syncControlsFromState();
  const pv = $("#preview");
  if (pv) pv.getContext("2d").clearRect(0, 0, pv.width, pv.height);
  const lg = $("#legend");
  if (lg) lg.innerHTML = "";
  const bi = $("#boardInfo");
  if (bi) bi.textContent = "";
  const ip = $("#infoPanel");
  if (ip) ip.innerHTML = "";
    ["exportPreview", "exportFull", "exportSvg", "exportPdf", "exportPack", "exportBoards", "exportPixel", "editToggle"].forEach(
    (id) => {
      const el = $("#" + id);
      if (el) el.disabled = true;
    }
  );
  setHint("已新建，请上传图片或点「示例图」");
  syncEmptyHint();
}

function makeSampleCanvas() {
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = 360;
  const x = c.getContext("2d");
  const sky = x.createLinearGradient(0, 0, 0, 360);
  sky.addColorStop(0, "#7ec8ff");
  sky.addColorStop(0.6, "#bfe3ff");
  sky.addColorStop(1, "#eaf7ff");
  x.fillStyle = sky;
  x.fillRect(0, 0, 360, 360);
  x.fillStyle = "#ffd23f";
  x.beginPath();
  x.arc(290, 70, 38, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#ffe98a";
  x.beginPath();
  x.arc(290, 70, 22, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#ffffff";
  const cloud = (cx, cy, s) => {
    x.beginPath();
    x.arc(cx, cy, 18 * s, 0, 7);
    x.arc(cx + 22 * s, cy, 22 * s, 0, 7);
    x.arc(cx + 46 * s, cy, 16 * s, 0, 7);
    x.fill();
  };
  cloud(70, 70, 1.1);
  cloud(150, 40, 0.8);
  x.fillStyle = "#7bd88f";
  x.beginPath();
  x.moveTo(0, 300);
  x.quadraticCurveTo(120, 230, 200, 290);
  x.quadraticCurveTo(280, 340, 360, 280);
  x.lineTo(360, 360);
  x.lineTo(0, 360);
  x.fill();
  x.fillStyle = "#52c173";
  x.beginPath();
  x.moveTo(0, 330);
  x.quadraticCurveTo(100, 300, 180, 330);
  x.quadraticCurveTo(260, 360, 360, 320);
  x.lineTo(360, 360);
  x.lineTo(0, 360);
  x.fill();
  x.fillStyle = "#4aa3ff";
  x.beginPath();
  x.moveTo(150, 300);
  x.quadraticCurveTo(180, 340, 160, 360);
  x.lineTo(210, 360);
  x.quadraticCurveTo(230, 330, 200, 300);
  x.fill();
  x.fillStyle = "#ff5d73";
  const petal = (px, py, a) => {
    x.save();
    x.translate(px, py);
    x.rotate(a);
    x.beginPath();
    x.ellipse(0, -14, 9, 14, 0, 0, 7);
    x.fill();
    x.restore();
  };
  for (let i = 0; i < 6; i++) petal(80, 250, (i * Math.PI) / 3);
  x.fillStyle = "#ffd23f";
  x.beginPath();
  x.arc(80, 250, 9, 0, 7);
  x.fill();
  x.strokeStyle = "#3a7d34";
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(80, 259);
  x.lineTo(80, 300);
  x.stroke();
  return c;
}

function loadSample() {
  const c = makeSampleCanvas();
  const url = c.toDataURL();
  const im = new Image();
  im.onload = () => {
    state.img = im;
    state._imgData = url;
    $("#runBtn").disabled = false;
    setHint("已加载示例图，可改参数或点生成");
    syncEmptyHint();
    run();
  };
  im.src = url;
}

function hasEdits() {
  if (state.editing) return true;
  const res = state.result;
  if (!res) return false;
  for (const row of res.grid) {
    for (const cell of row) {
      if (cell.blank) return true;
      if (cell.override && !cell.outline) return true;
    }
  }
  return false;
}

function reprocess() {
  if (hasEdits() && !confirm("重新识别会丢失当前的手动编辑，确定继续吗？")) return;
  run();
}

function syncEmptyHint() {
  const h = $("#emptyHint");
  if (h) h.style.display = (state.img || state.result) ? "none" : "";
}

function redraw() {
  const result = state.result;
  if (!result) return;
  const cellSize = Math.max(8, Math.floor(560 / result.cols));
  previewCellSize = cellSize;
  renderPattern($("#preview"), result, cellSize, {
    block: false,
    ghost: state.showGhost ? state.img : null,
    showGrid: state.editing && state.showGrid,
    showBoards: state.editing && state.showBoards,
    refOutline: state.editing && state.refOutline,
    highlightEdits: state.editing && state.highlightEdits,
    tempShape: state.editing ? state.tempShape : null,
    sel: state.editing ? state.sel : null,
  });
  renderLegend($("#legend"), result);
  updateInfoPanel();
  updateBoardInfo();
    ["exportPreview", "exportFull", "exportSvg", "exportPdf", "exportPack", "exportBoards", "exportPixel", "editToggle"].forEach(
    (id) => ($("#" + id).disabled = false)
  );
  applyView();
  syncEmptyHint();
}

function paintCellOnCanvas(r, c) {
  const canvas = $("#preview");
  const ctx = canvas.getContext("2d");
  const cell = state.result.grid[r][c];
  const s = previewCellSize;
  const px = c * s;
  const py = r * s;
  ctx.fillStyle = "#fff";
  ctx.fillRect(px, py, s, s);
  drawCell(ctx, cell, state.result.palette, px, py, s, state.mode === "blueprint");
}

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onerror = () => setHint("图片加载失败，请换一张或检查文件格式");
    img.onload = () => {
      state.img = img;
      state._imgData = e.target.result;
      $("#runBtn").disabled = false;
      $("#hint").textContent = `已载入：${img.width}×${img.height}px`;
      syncEmptyHint();
      run();
    };
    img.src = e.target.result;
  };
  reader.onerror = () => setHint("读取文件失败，请重试");
  reader.readAsDataURL(file);
}

function download(href, name) {
  const link = document.createElement("a");
  link.download = name;
  link.href = href;
  link.click();
}

function exportPreview() {
  if (!state.result) return;
  const c = document.createElement("canvas");
  renderPattern(c, state.result, 14, { block: false, watermark: true });
  download(c.toDataURL("image/png"), "pindou-preview-watermark.png");
}

function exportFull() {
  if (!state.result) { setHint("请先生成图纸，再导出"); return; }
  if (!state.pro) {
    openPaywall("完整高清图（无水印）为 Pro 功能");
    return;
  }
  const c = document.createElement("canvas");
  renderPattern(c, state.result, 24, { block: false, watermark: false });
  download(c.toDataURL("image/png"), "pindou-full.png");
}

function exportPixelPng() {
  if (!state.result) return;
  const res = state.result;
  const scale = 12;
  const c = document.createElement("canvas");
  c.width = res.cols * scale;
  c.height = res.rows * scale;
  const ctx = c.getContext("2d");
  if (state.pixelWhiteBg) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
  } else {
    ctx.clearRect(0, 0, c.width, c.height);
  }
  for (let r = 0; r < res.rows; r++) {
    for (let c2 = 0; c2 < res.cols; c2++) {
      const cell = res.grid[r][c2];
      if (cell.blank || cell.bg) continue;
      const dc = effectiveColor(cell, res);
      if (!dc) continue;
      ctx.fillStyle = "rgb(" + dc.r + "," + dc.g + "," + dc.b + ")";
      ctx.fillRect(c2 * scale, r * scale, scale, scale);
    }
  }
  download(c.toDataURL("image/png"), "pindou-pixel.png");
}

function buildSvg(result) {
  const { grid, cols, rows } = result;
  const palette = result.palette;
  const s = 20;
  const W = cols * s;
  const H = rows * s;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  parts.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const x = c * s;
      const y = r * s;
      if (cell.blank || cell.bg) {
        parts.push(
          `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#fff" stroke="#dcdcdc" stroke-width="1"/>`
        );
        continue;
      }
      const dc = cellDrawColor(cell, palette);
      parts.push(
        `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="rgb(${dc.r},${dc.g},${dc.b})" stroke="#dcdcdc" stroke-width="1"/>`
      );
      const tcol = textOnRgb(dc.r, dc.g, dc.b);
      const effCode = cell.override ? cell.override.code : palette[cell.ci] ? palette[cell.ci].code : "";
      parts.push(
        `<text x="${x + s / 2}" y="${y + s / 2}" font-size="${effCode.length > 2 ? s * 0.42 : s * 0.62}" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" fill="${tcol}">${effCode}</text>`
      );
    }
  }
  parts.push("</svg>");
  return parts.join("");
}

function exportSvg() {
  if (!state.result) { setHint("请先生成图纸，再导出"); return; }
  if (!state.pro) {
    openPaywall("矢量 SVG（无水印）为 Pro 功能");
    return;
  }
  const blob = new Blob([buildSvg(state.result)], { type: "image/svg+xml" });
  download(URL.createObjectURL(blob), "pindou-pattern.svg");
}

function renderLegendPage(pdf, result) {
  const palette = result.palette;
  const items = result.counts
    .map((c, i) => ({ ...palette[i], count: c }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  pdf.setFontSize(14);
  pdf.setTextColor(20);
  pdf.text("材料清单（色号 × 数量）", 14, 16);
  const colX = [14, 110];
  const top = 26;
  const rowH = 7;
  const rowsPerCol = Math.floor((285 - top) / rowH);
  let idx = 0;
  for (const it of items) {
    const col = Math.floor(idx / rowsPerCol);
    const row = idx % rowsPerCol;
    if (idx > 0 && row === 0) {
      pdf.addPage();
      pdf.setFontSize(14);
      pdf.setTextColor(20);
      pdf.text("材料清单（续）", 14, 16);
    }
    const x = colX[col % 2];
    const y = top + row * rowH;
    pdf.setFillColor(it.r, it.g, it.b);
    pdf.rect(x, y - 4, 5, 5, "F");
    pdf.setFontSize(10);
    pdf.setTextColor(20);
    pdf.text(`${it.code} ${it.hex} ×${it.count}`, x + 7, y);
    idx++;
  }
}

function exportPdf() {
  if (!state.result) { setHint("请先生成图纸，再导出"); return; }
  if (!state.pro) {
    openPaywall("分块打印 PDF（A4 分页）为 Pro 功能");
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF 导出需要联网加载 jsPDF 库，请检查网络后重试，或改用 SVG 导出。");
    return;
  }
  const { jsPDF } = window.jspdf;
  const result = state.result;
  const { cols, rows } = result;
  const { bw, bh } = boardDims();
  const bxCount = Math.ceil(cols / bw);
  const byCount = Math.ceil(rows / bh);
  const total = bxCount * byCount;
  const boardPx = 24;
  const pageW = 210;
  const pageH = 297;
  const margin = 10;
  const landscape = bw >= bh;
  const colsPerPage = bw === bh ? 2 : landscape ? 1 : 3;
  const rowsPerPage = bw === bh ? 3 : landscape ? 4 : 2;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  const cellMm = Math.min(availW / colsPerPage / bw, availH / rowsPerPage / bh);

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFontSize(12);
  pdf.setTextColor(20);
  const orientLabel =
    state.boardOrientation === "h"
      ? "横向 58×29"
      : state.boardOrientation === "v"
      ? "竖向 29×58"
      : state.boardOrientation === "big"
      ? "大方板 58×58"
      : "正方 29×29";
  pdf.text(`拼豆图稿 · 分块打印（共 ${total} 块，${orientLabel}，A4）`, margin, margin);

  let placed = 0;
  for (let by = 0; by < byCount; by++) {
    for (let bx = 0; bx < bxCount; bx++) {
      const k = by * bxCount + bx + 1;
      const pos = placed % (colsPerPage * rowsPerPage);
      if (placed > 0 && pos === 0) pdf.addPage();
      const pc = pos % colsPerPage;
      const pr = Math.floor(pos / colsPerPage);
      const c = renderBoardToCanvas(result, bx, by, boardPx, { boardNo: k, total });
      const wCells = Math.min(bw, cols - bx * bw);
      const hCells = Math.min(bh, rows - by * bh);
      const imgW = wCells * cellMm;
      const imgH = hCells * cellMm;
      const cellW = availW / colsPerPage;
      const cellH = availH / rowsPerPage;
      const x = margin + pc * cellW + (cellW - imgW) / 2;
      const y = margin + pr * cellH + (cellH - imgH) / 2 + 6;
      pdf.addImage(c.toDataURL("image/png"), "PNG", x, y, imgW, imgH);
      placed++;
    }
  }
  pdf.addPage();
  renderLegendPage(pdf, result);
  pdf.save("pindou-blocks-A4.pdf");
}

function exportPack() {
  if (!state.result) return;
  const res = state.result;
  const { bw, bh } = boardDims();
  const bxCount = Math.ceil(res.cols / bw);
  const boardOf = (r, c) => Math.floor(c / bw) + Math.floor(r / bh) * bxCount + 1;
  const items = tallyByCode(res);
  const boardsByCode = {};
  for (let r = 0; r < res.rows; r++)
    for (let c = 0; c < res.cols; c++) {
      const ec = effectiveColor(res.grid[r][c], res);
      if (!ec) continue;
      (boardsByCode[ec.code] = boardsByCode[ec.code] || new Set()).add(boardOf(r, c));
    }
  const lines = ["Symbol,Code,Hex,Count,Boards,BuyLink"];
  items.forEach((it) => {
    const bs = boardsByCode[it.code]
      ? Array.from(boardsByCode[it.code])
          .sort((a, b) => a - b)
          .join("/")
      : "";
    lines.push(`${it.code},${it.code},${it.hex},${it.count},${bs},${AFFILIATE(it.code, it.hex)}`);
  });
  const total = items.reduce((s, c) => s + c.count, 0);
  lines.push("", `TOTAL,${total}`, `BOARDS,${bxCount * Math.ceil(res.rows / bh)}`);
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  download(URL.createObjectURL(blob), "pindou-material-pack.csv");
}

function openPaywall(reason) {
  const el = $("#paywall");
  const r = $("#paywallReason");
  if (r) r.textContent = reason || "";
  if (el) {
    el.classList.add("show");
    el.style.display = "flex";
    el.style.zIndex = "2147483647";
  }
}

function applyView() {
  const canvas = $("#preview");
  const wrap = $(".canvas-wrap");
  if (!canvas.width) return;
  let scale;
  if (state.zoom === "fit") {
    const avail = wrap.clientWidth - 24;
    scale = Math.min(avail / canvas.width, 1);
    if (!isFinite(scale) || scale <= 0) scale = 1;
  } else {
    scale = Number(state.zoom) || 1;
  }
  canvas.style.width = Math.round(canvas.width * scale) + "px";
  canvas.style.height = Math.round(canvas.height * scale) + "px";
  $("#zoomLabel").textContent = Math.round(scale * 100) + "%";
}

function setZoom(v) {
  state.zoom = v;
  applyView();
}

const ICONS = {
  brush: '<path d="M4 20l3-1 9-9-3-3-9 9-1 3z"/><path d="M14 7l3 3"/>',
  eraser: '<path d="M5 14l5-5 6 6-4 4H9z"/><path d="M9 19h11"/>',
  eyedropper: '<path d="M17 3l4 4-9 9-4 1 1-4z"/><path d="M14 6l4 4"/>',
  bucket: '<path d="M12 3s6 6 6 10a6 6 0 0 1-12 0c0-4 6-10 6-10z"/>',
  line: '<path d="M5 19L19 5"/>',
  square: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  select: '<path d="M5 5h4M19 5h-4M5 19h4M19 19h-4"/><rect x="8" y="8" width="8" height="8" stroke-dasharray="3 2"/>',
  text: '<path d="M6 5h12M12 5v14"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  pen: '<path d="M5 19l1-4L16 5l3 3L9 18l-4 1z"/><path d="M14 7l3 3"/>',
  undo: '<path d="M8 7L3 12l5 5"/><path d="M3 12h11a5 5 0 0 1 0 10"/>',
  redo: '<path d="M16 7l5 5-5 5"/><path d="M21 12H10a5 5 0 0 0 0 10"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  pdf: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 16h6"/>',
  package: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  grid: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M4 14h16M9 4v16M14 4v16"/>',
  board: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  outline: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2"/>',
  flipH: '<path d="M12 3v18"/><path d="M7 8L3 12l4 4"/><path d="M17 8l4 4-4 4"/>',
  flipV: '<path d="M3 12h18"/><path d="M8 7L12 3l4 4"/><path d="M8 17l4 4 4-4"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 5v6h-6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  paste: '<path d="M9 4h6v3H9z"/><path d="M5 8h14v12H5z"/>',
  trash: '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  magic: '<path d="M4 20l7-7"/><path d="M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  sparkles: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 2-1 2-2 0-1-1-2-1-3 0-2 2-3 4-3a7 7 0 0 0-7-7z"/><circle cx="8" cy="9" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="9" r="1"/>',
  theme: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>',
  tabs: '<path d="M4 6h7v5H4zM13 6h7v5h-7zM4 14h16v4H4z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
};

const PIX = {
  image: ["........", ".######.", ".#....#.", ".#.##.#.", ".#.##.#.", ".#....#.", ".######.", "........"],
  sparkles: ["...#....", "...#....", ".##.##..", "#######.", ".##.##..", "...#....", "...#....", "........"],
  palette: ["..####..", ".#....#.", "#.#..#.#", "#.#..#.#", "#.#..#.#", ".#....#.", "..####..", "........"],
  pen: [".....##.", "....##..", "...##...", "..##....", ".##.....", "##......", ".##.....", "........"],
  file: [".#####..", ".#...#.#", ".#...#.#", ".#.#.#..", ".#.#.#..", ".#...#.#", ".#####..", "........"],
  layers: ["...##...", "..####..", ".######.", "..####..", ".######.", "..####..", ".######.", "........"],
  download: ["...##...", "...##...", "...##...", "...##...", ".######.", "..####..", "...##...", "........"],
  code: [".#....#.", ".##..##.", "#.#..#.#", "#.#..#.#", "#.#..#.#", ".##..##.", ".#....#.", "........"],
  pdf: [".#####..", ".#...#..", ".#.#.#..", ".#.#.#..", ".#.#.#..", ".#...#..", ".#####..", "........"],
  package: ["..####..", ".######.", "########", "#.####.#", "########", ".######.", "..####..", "........"],
  grid: [".#.#.#.#", "########", ".#.#.#.#", "########", ".#.#.#.#", "########", ".#.#.#.#", "........"],
  magic: [".#......", ".##.....", ".###....", "#######.", ".###....", ".##.....", ".#......", "........"],
  undo: ["##......", ".##.....", "..##....", "....##..", "..##....", ".##.....", "##......", "........"],
  redo: ["......##", ".....##.", "....##..", "..##....", "....##..", ".....##.", "......##", "........"],
  board: [".######.", ".#....#.", ".#.##.#.", ".#.##.#.", ".#.##.#.", ".#....#.", ".######.", "........"],
};

function pxIcon(name, cls) {
  const rows = PIX[name];
  if (!rows) return null;
  const h = rows.length;
  const w = rows[0].length;
  let rects = "";
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "#" || row[x] === "1") {
        rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      }
    }
  }
  return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 ${w} ${h}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

function svgIcon(name, cls) {
  const p = pxIcon(name, cls);
  if (p) return p;
  const inner = ICONS[name] || "";
  return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function applyIcons() {
  const strip = /^[‌﻿\s​ \u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25A0}-\u{25FF}\u{25CE}\u{25A1}\u{2295}\u{25C6}\u{25CB}]+/u;
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.getAttribute("data-icon");
    const label = (el.textContent || "").replace(strip, "").trim();
    el.innerHTML = svgIcon(name) + (label ? `<span class="lbl">${label}</span>` : "");
  });
}

function applyTheme(name) {
  document.body.setAttribute("data-theme", name);
  try {
    localStorage.setItem("pindou-theme", name);
  } catch (e) {}
  document.querySelectorAll(".theme-pick .seg").forEach((b) => {
    b.classList.toggle("active", b.dataset.theme === name);
  });
}

function init() {
  const saved = (() => {
    try {
      return localStorage.getItem("pindou-theme");
    } catch (e) {
      return null;
    }
  })();
  applyTheme(saved || "pixel");

  const pal = $("#palette");
  for (const key of Object.keys(BEAD_PALETTES)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = BEAD_PALETTES[key].label;
    pal.appendChild(opt);
  }
  pal.value = state.paletteKey;
  pal.addEventListener("change", (e) => {
    state.paletteKey = e.target.value;
    if (state.result) reprocess();
  });

  const sizeSel = $("#paletteSize");
  for (const n of [24, 80, 150, 221, 291]) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n === 291 ? "291（全部）" : `${n} 色`;
    sizeSel.appendChild(opt);
  }
  sizeSel.value = state.paletteSize;
  sizeSel.addEventListener("change", (e) => {
    state.paletteSize = parseInt(e.target.value, 10);
    if (state.result) reprocess();
  });

  const modeSel = $("#colorMode");
  modeSel.value = state.colorMode;
  modeSel.addEventListener("change", (e) => {
    state.colorMode = e.target.value;
    if (state.result) redraw();
  });

  const maxColorsSel = $("#maxColors");
  maxColorsSel.value = String(state.maxColors);
  maxColorsSel.addEventListener("change", (e) => {
    state.maxColors = parseInt(e.target.value, 10) || 0;
    if (state.result) reprocess();
  });

  const removeBgEl = $("#removeBg");
  if (removeBgEl) {
    removeBgEl.checked = state.removeBg;
    removeBgEl.addEventListener("change", (e) => {
      state.removeBg = e.target.checked;
      if (state.result) reprocess();
    });
  }
  const bgTolEl = $("#bgTol");
  if (bgTolEl) {
    bgTolEl.value = String(state.bgTol);
    bgTolEl.addEventListener("input", (e) => {
      state.bgTol = parseInt(e.target.value, 10) || 40;
      if (state.result) reprocess();
    });
  }
  const edgeAwareEl = $("#edgeAware");
  if (edgeAwareEl) {
    edgeAwareEl.checked = state.edgeAware;
    edgeAwareEl.addEventListener("change", (e) => {
      state.edgeAware = e.target.checked;
      if (state.result) reprocess();
    });
  }
  const outlineModeEl = $("#outlineMode");
  if (outlineModeEl) {
    outlineModeEl.checked = state.outlineMode;
    outlineModeEl.addEventListener("change", (e) => {
      state.outlineMode = e.target.checked;
      if (state.result) reprocess();
    });
  }
  const pixelWhiteBgEl = $("#pixelWhiteBg");
  if (pixelWhiteBgEl) {
    pixelWhiteBgEl.checked = state.pixelWhiteBg;
    pixelWhiteBgEl.addEventListener("change", (e) => {
      state.pixelWhiteBg = e.target.checked;
      saveProject();
    });
  }

  const controlsToggle = document.querySelector(".controls-toggle");
  if (controlsToggle) {
    controlsToggle.addEventListener("click", () => {
      document.querySelector(".controls")?.classList.toggle("collapsed");
    });
  }
  const detailsToggle = document.querySelector(".details-toggle");
  if (detailsToggle) {
    detailsToggle.addEventListener("click", () => {
      document.querySelector(".details")?.classList.toggle("open");
    });
  }

  const sideEl = document.querySelector(".side");
  const exportMenuBtn = document.getElementById("exportMenuBtn");
  if (exportMenuBtn && sideEl) {
    exportMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sideEl.classList.toggle("export-open");
    });
    sideEl.querySelectorAll(".actions button").forEach((b) => {
      b.addEventListener("click", () => sideEl.classList.remove("export-open"));
    });
    document.addEventListener("click", (e) => {
      if (!sideEl.classList.contains("export-open")) return;
      if (sideEl.contains(e.target) && e.target !== exportMenuBtn) return;
      sideEl.classList.remove("export-open");
    });
  }

  $("#cols").addEventListener("change", (e) => {
    state.cols = parseInt(e.target.value, 10);
    if (state.result) reprocess();
  });
  $("#mode").addEventListener("change", (e) => {
    state.mode = e.target.checked ? "blueprint" : "bead";
    if (state.result) redraw();
  });
  $("#ghost").addEventListener("change", (e) => {
    state.showGhost = e.target.checked;
    if (state.result) redraw();
  });
  $("#boardOrientation").addEventListener("change", (e) => {
    state.boardOrientation = e.target.value;
  });
  $("#file").addEventListener("change", (e) => {
    if (e.target.files[0]) loadImage(e.target.files[0]);
  });
  const conv = document.querySelector('.tabpanel[data-tab="convert"]');
  if (conv) {
    conv.addEventListener("dragover", (e) => {
      e.preventDefault();
      conv.classList.add("drag-over");
    });
    conv.addEventListener("dragleave", () => conv.classList.remove("drag-over"));
    conv.addEventListener("drop", (e) => {
      e.preventDefault();
      conv.classList.remove("drag-over");
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && f.type && f.type.startsWith("image/")) loadImage(f);
    });
  }
  window.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) loadImage(f);
        break;
      }
    }
  });
  $("#sampleBtn").addEventListener("click", loadSample);
  $("#newBtn").addEventListener("click", clearProject);
  $("#runBtn").addEventListener("click", run);

  $("#exportPreview").addEventListener("click", exportPreview);
  $("#exportPixel").addEventListener("click", exportPixelPng);
  $("#exportFull").addEventListener("click", exportFull);
  $("#exportSvg").addEventListener("click", exportSvg);
  $("#exportPdf").addEventListener("click", exportPdf);
  $("#exportPack").addEventListener("click", exportPack);
  $("#upgradePro").addEventListener("click", () => openPaywall("升级 Pro 解锁：去水印完整图、矢量 SVG、A4 分块打印 PDF、分板裁切图"));

  $("#zoomFit").addEventListener("click", () => setZoom("fit"));
  $("#zoomIn").addEventListener("click", () => {
    const s = (typeof state.zoom === "number" ? state.zoom : 1) * 1.25;
    setZoom(s);
  });
  $("#zoomOut").addEventListener("click", () => {
    const s = (typeof state.zoom === "number" ? state.zoom : 1) / 1.25;
    setZoom(s);
  });
  $("#zoom100").addEventListener("click", () => setZoom(1));
  window.addEventListener("resize", () => {
    if (state.zoom === "fit") applyView();
  });

  const canvas = $("#preview");
  const wrap = $(".canvas-wrap");
  let dragging = false;
  let lx = 0;
  let ly = 0;
  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
    canvas.style.cursor = "grabbing";
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    canvas.style.cursor = "";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    wrap.scrollLeft -= e.clientX - lx;
    wrap.scrollTop -= e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const s = (typeof state.zoom === "number" ? state.zoom : 1) * (e.deltaY < 0 ? 1.1 : 0.9);
      state.zoom = s;
      applyView();
    },
    { passive: false }
  );

  let touchMode = null;
  let lastTouch = null;
  let lastDist = 0;
  const touchDist = (e) => {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.hypot(dx, dy);
  };
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (state.editing) {
        touchMode = null;
        return;
      }
      if (e.touches.length === 1) {
        touchMode = "pan";
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        touchMode = "pinch";
        lastDist = touchDist(e);
      }
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (!state.result) return;
      if (touchMode === "pan" && e.touches.length === 1) {
        const t = e.touches[0];
        wrap.scrollLeft -= t.clientX - lastTouch.x;
        wrap.scrollTop -= t.clientY - lastTouch.y;
        lastTouch = { x: t.clientX, y: t.clientY };
        e.preventDefault();
      } else if (touchMode === "pinch" && e.touches.length === 2) {
        const d = touchDist(e);
        if (lastDist) {
          const s = (typeof state.zoom === "number" ? state.zoom : 1) * (d / lastDist > 1 ? 1.1 : 0.9);
          state.zoom = s;
          applyView();
        }
        lastDist = d;
        e.preventDefault();
      }
    },
    { passive: false }
  );
  canvas.addEventListener("touchend", () => {
    touchMode = null;
    lastDist = 0;
  });

  $("#unlockPro").addEventListener("click", () => {
    state.pro = true;
    const pw = $("#paywall");
    if (pw) { pw.classList.remove("show"); pw.style.display = ""; pw.style.zIndex = ""; }
    if (state.result) run();
  });
  $("#paywallClose").addEventListener("click", () => {
    const pw = $("#paywall");
    if (pw) { pw.classList.remove("show"); pw.style.display = ""; pw.style.zIndex = ""; }
  });
  $("#paywall").addEventListener("click", (e) => {
    if (e.target === $("#paywall")) {
      $("#paywall").classList.remove("show");
      $("#paywall").style.display = "";
      $("#paywall").style.zIndex = "";
    }
  });

  // 图纸库
  const openLibBtn = $("#openLibrary");
  if (openLibBtn) openLibBtn.addEventListener("click", openLibrary);
  const saveDrawBtn = $("#saveDrawingBtn");
  if (saveDrawBtn)
    saveDrawBtn.addEventListener("click", () => {
      if (!state.result) {
        alert("请先生成一张图纸，再保存到图纸库");
        return;
      }
      openLibrary();
      setTimeout(() => {
        const n = $("#libName");
        if (n) n.focus();
      }, 60);
    });
  const libSave = $("#libSave");
  if (libSave) libSave.addEventListener("click", saveDrawing);
  const libClose = $("#libraryClose");
  if (libClose) libClose.addEventListener("click", closeLibrary);
  const libModal = $("#libraryModal");
  if (libModal) {
    libModal.addEventListener("click", (e) => {
      if (e.target === libModal) closeLibrary();
    });
  }
  const libGrid = $("#libraryGrid");
  if (libGrid) {
    libGrid.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.dataset.load) loadDrawing(t.dataset.load);
      else if (t.dataset.del) deleteDrawing(t.dataset.del, t.dataset.name || "");
      else if (t.dataset.rename) renameDrawing(t.dataset.rename, t.dataset.name || "");
    });
  }

  document.querySelectorAll(".tabbtn").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );
  $("#swatchSize").addEventListener("change", renderSwatch);
  $("#swatchSearch").addEventListener("input", renderSwatch);
  $("#aiGen").addEventListener("click", aiGenerate);
  $("#aiToPattern").addEventListener("click", aiToPattern);

  document.querySelectorAll(".ai-preset").forEach((b) =>
    b.addEventListener("click", () => applyPreset(b.dataset.preset))
  );
  document.querySelectorAll(".prompt-tpl").forEach((b) =>
    b.addEventListener("click", () => insertPrompt(b.dataset.ins))
  );
  initEditListeners();
  applyIcons();
  document.querySelectorAll(".theme-pick .seg").forEach((b) => {
    b.addEventListener("click", () => applyTheme(b.dataset.theme));
  });

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (!state.editing) return;
    const map = {
      b: "paint",
      e: "erase",
      i: "pick",
      g: "fill",
      l: "line",
      r: "rect",
      o: "ellipse",
      s: "select",
      t: "text",
      v: "view",
    };
    const tool = map[e.key.toLowerCase()];
    if (tool) {
      setTool(tool);
      e.preventDefault();
      return;
    }
    if (e.key.toLowerCase() === "x") {
      selectEditColor(0);
      setTool("paint");
      e.preventDefault();
    }
  });

  if (!restoreProject()) loadSample();

  const ah = document.querySelector(".actions-hint");
  if (!window.jspdf || !window.jspdf.jsPDF) {
    if (ah) ah.insertAdjacentHTML("afterbegin", "⚠ PDF 库未加载，PDF 导出暂不可用（联网后刷新即可）。");
  }

  const helpBtn = $("#helpBtn");
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      console.log("[helpBtn] clicked, Tutorial=", typeof Tutorial);
      try { Tutorial.start(); } catch(e) { console.error(e); alert("教程加载失败: " + e.message); }
    });
  }
  try { Tutorial.init(); } catch(e) { console.error("Tutorial.init error:", e); }
}

function insertPrompt(text) {
  const ta = $("#aiPrompt");
  const start = ta.selectionStart || 0;
  const end = ta.selectionEnd || 0;
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  const sep = before && !before.endsWith(" ") ? ", " : "";
  ta.value = before + sep + text + after;
  const pos = (before + sep + text).length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
}

const AI_PRESETS = {
  anime: {
    negative: "low quality, blurry, deformed, extra digits, watermark, text",
    steps: 28,
    cfg: 7,
    sampler: "dpmpp_2m",
    scheduler: "karras",
    size: 512,
    style: "",
  },
  illustration: {
    negative: "low quality, blurry, deformed, photo, watermark",
    steps: 30,
    cfg: 6.5,
    sampler: "dpmpp_2m",
    scheduler: "karras",
    size: 768,
    style: "flat vector, bold colors",
  },
  pixel: {
    negative: "blurry, smooth, anti-aliased, gradient, realistic, high detail",
    steps: 20,
    cfg: 8,
    sampler: "euler",
    scheduler: "normal",
    size: 512,
    style: "pixel art",
  },
  realistic: {
    negative: "cartoon, anime, illustration, painting, drawing, low quality",
    steps: 32,
    cfg: 5,
    sampler: "dpmpp_2m_sde",
    scheduler: "karras",
    size: 768,
    style: "",
  },
};

function applyPreset(name) {
  const p = AI_PRESETS[name];
  if (!p) return;
  $("#aiNegative").value = p.negative;
  $("#aiSteps").value = p.steps;
  $("#aiCfg").value = p.cfg;
  $("#aiSampler").value = p.sampler;
  $("#aiScheduler").value = p.scheduler;
  $("#aiSize").value = p.size;
  $("#aiStyle").value = p.style;
}

function switchTab(name) {
  document.querySelectorAll(".tabpanel").forEach((p) => {
    p.hidden = p.dataset.tab !== name;
  });
  document.querySelectorAll(".tabbtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  if (name === "swatch") renderSwatch();
  if (name === "ai") {
    loadProviderLabel();
    if ($("#aiProvider").value === "comfy") loadComfyModels();
  }
}

async function loadComfyModels() {
  const sel = $("#aiModel");
  try {
    const r = await fetch("/api/comfy-models");
    const j = await r.json();
    if (j.ok && Array.isArray(j.models)) {
      const cur = sel.value;
      sel.innerHTML = '<option value="">（自动选第一个）</option>';
      for (const m of j.models) {
        const o = document.createElement("option");
        o.value = m;
        o.textContent = m;
        sel.appendChild(o);
      }
      sel.value = cur;
    }
  } catch (e) {
    /* ignore */
  }
}

function renderSwatch() {
  const size = parseInt($("#swatchSize").value, 10);
  const pal = getActivePalette(state.paletteKey, size);
  const q = ($("#swatchSearch").value || "").trim().toLowerCase();
  const grid = $("#swatchGrid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const c of pal) {
    if (q && !c.code.toLowerCase().includes(q) && !c.hex.toLowerCase().includes(q))
      continue;
    const el = document.createElement("div");
    el.className = "swatch-card";
    el.innerHTML = `<span class="swatch-big" style="background:${c.hex}"></span>
      <span class="sw-code">${c.code}</span>
      <span class="sw-hex">${c.hex}</span>`;
    frag.appendChild(el);
  }
  grid.appendChild(frag);
  $("#swatchCount").textContent =
    `共 ${pal.length} 色` + (q ? `（匹配 ${grid.children.length}）` : "");
}

async function loadProviderLabel() {
  try {
    const r = await fetch("/api/ai-provider");
    const j = await r.json();
    $("#aiProviderLabel").textContent = j.provider;
  } catch (e) {
    $("#aiProviderLabel").textContent = "（后端未启动）";
  }
}

async function aiGenerate() {
  const prompt = $("#aiPrompt").value.trim();
  if (!prompt) {
    $("#aiStatus").textContent = "请输入描述";
    return;
  }
  const style = $("#aiStyle").value;
  const provider = $("#aiProvider").value;
  const full = [prompt, style].filter(Boolean).join(", ");
  const model = $("#aiModel").value;
  const negative = $("#aiNegative").value;
  const steps = $("#aiSteps").value;
  const cfgScale = $("#aiCfg").value;
  const sampler = $("#aiSampler").value;
  const scheduler = $("#aiScheduler").value;
  const size = $("#aiSize").value;
  $("#aiStatus").textContent = "生成中（" + provider + "）…";
  $("#aiGen").disabled = true;
  try {
    const r = await fetch("/api/ai-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: full,
        provider,
        model,
        negative,
        steps,
        cfg: cfgScale,
        sampler,
        scheduler,
        size,
      }),
    });
    const j = await r.json();
    if (!j.ok) {
      $("#aiStatus").textContent = "失败：" + (j.error || "未知");
    } else {
      $("#aiImg").src = j.image;
      $("#aiImg").hidden = false;
      $("#aiToPattern").hidden = false;
      $("#aiStatus").textContent = "生成完成（" + provider + "），可一键转入图稿";
      state.aiImage = j.image;
    }
  } catch (e) {
    $("#aiStatus").textContent = "请求失败：" + e.message;
  } finally {
    $("#aiGen").disabled = false;
  }
}

function aiToPattern() {
  if (!state.aiImage) return;
  const img = new Image();
  img.onload = () => {
    state.img = img;
    state._imgData = state.aiImage;
    $("#runBtn").disabled = false;
    $("#hint").textContent = "已载入 AI 生成图";
    switchTab("convert");
    run();
  };
  img.src = state.aiImage;
}

// ============ manual edit system ============
function buildEditPalette() {
  editFullPalette = [BG_BEAD, ...getActivePalette(state.paletteKey, 291)];
  editCodeIndex = {};
  editFullPalette.forEach((c, i) => (editCodeIndex[c.code] = i));
  renderEditPalette("");
  if (state.editColorIdx <= 0) state.editColorIdx = 1;
  if (state.editColorIdx >= editFullPalette.length) state.editColorIdx = 1;
  selectEditColor(state.editColorIdx);
}

function renderEditPalette(q) {
  const grid = $("#editPalette");
  if (!grid) return;
  const filter = (q || "").trim().toLowerCase();
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let i = 0; i < editFullPalette.length; i++) {
    const c = editFullPalette[i];
    if (
      filter &&
      !c.code.toLowerCase().includes(filter) &&
      !(c.hex && c.hex.toLowerCase().includes(filter))
    )
      continue;
    const el = document.createElement("div");
    el.className = "ep-swatch" + (i === state.editColorIdx ? " selected" : "");
    if (c.isBg) {
      el.style.background =
        "repeating-conic-gradient(#ffffff 0% 25%, #c9ccd1 0% 50%) 50% / 12px 12px";
      el.title = "背景（留空·不计入珠数）· 快捷键 X";
    } else {
      el.style.background = c.hex;
      el.title = c.code + " " + c.hex;
    }
    el.addEventListener("click", () => {
      selectEditColor(i);
      if (state.editTool === "pick" || state.editTool === "view") setTool("paint");
    });
    frag.appendChild(el);
  }
  grid.appendChild(frag);
}

function selectEditColor(idx) {
  if (idx < 0 || idx >= editFullPalette.length) return;
  state.editColorIdx = idx;
  const c = editFullPalette[idx];
  const sw = $("#editSwatch");
  if (sw) {
    if (c.isBg) {
      sw.style.background =
        "repeating-conic-gradient(#ffffff 0% 25%, #c9ccd1 0% 50%) 50% / 16px 16px";
      $("#editColorName").textContent = "背景";
      $("#editColorCode").textContent = "留空·不计入珠数";
    } else {
      sw.style.background = c.hex;
      $("#editColorName").textContent = c.code;
      $("#editColorCode").textContent = c.hex;
    }
  }
  const items = document.querySelectorAll("#editPalette .ep-swatch");
  items.forEach((e, i) => e.classList.toggle("selected", i === idx));
}

function setTool(name) {
  state.editTool = name;
  document.querySelectorAll(".tool-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tool === name)
  );
  const canvas = $("#preview");
  if (canvas) canvas.style.cursor = name === "view" ? "help" : "crosshair";
}

function enterEdit() {
  if (!state.result) return;
  state.editing = true;
  state.colorMode = "palette";
  const cm = $("#colorMode");
  if (cm) cm.value = "palette";
  const mode = $("#mode");
  if (mode) mode.checked = false;
  state.mode = "bead";
  state.showGrid = true;
  state.showBoards = true;
  state.refOutline = false;
  state.sel = null;
  state.tempShape = null;
  const gt = $("#gridToggle");
  if (gt) gt.checked = true;
  const bt = $("#boardToggle");
  if (bt) bt.checked = true;
  const ro = $("#refOutline");
  if (ro) ro.checked = false;
  const sm = $("#symMode");
  if (sm) sm.value = "none";
  state.symmetry = "none";
  $("#editPanel").hidden = false;
  $("#editToggle").textContent = "✎ 退出编辑";
  $("#editToggle").classList.add("active");
  buildEditPalette();
  setTool(state.editTool);
  const native = previewCellSize || Math.max(8, Math.floor(560 / state.result.cols));
  const z = Math.max(2, Math.min(6, Math.round(22 / native)));
  setZoom(z);
  updateBoardInfo();
  renderLegend($("#legend"), state.result);
}

function exitEdit() {
  state.editing = false;
  state.sel = null;
  state.tempShape = null;
  $("#editPanel").hidden = true;
  $("#editToggle").textContent = "✎ 编辑";
  $("#editToggle").classList.remove("active");
  hideHover();
  redraw();
}

function gridCoordFromEvent(e) {
  const canvas = $("#preview");
  const rect = canvas.getBoundingClientRect();
  const cols = state.result.cols;
  const rows = state.result.rows;
  if (!rect.width || !rect.height) return null;
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * cols);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * rows);
  if (x < 0 || x >= cols || y < 0 || y >= rows) return null;
  return { r: y, c: x };
}

function recordChange(r, c) {
  if (!strokeChanges) return;
  const key = r + "," + c;
  if (strokeChanges.has(key)) return;
  const cell = state.result.grid[r][c];
  strokeChanges.set(key, {
    r,
    c,
    prevOverride: cell.override ? { ...cell.override } : null,
    prevBlank: !!cell.blank,
    prevBg: !!cell.bg,
  });
}

function applyToolAt(r, c) {
  const cell = state.result.grid[r][c];
  if (state.editTool === "view") return;
  if (state.editTool === "pick") {
    const col = effectiveColor(cell, state.result);
    if (col) {
      const idx = editCodeIndex[col.code];
      if (idx != null) selectEditColor(idx);
    }
    setTool("paint");
    return;
  }
  if (state.editTool === "fill") {
    floodFill(r, c);
    return;
  }
  if (state.editTool === "paint" || state.editTool === "erase") {
    paintStrokeCell(r, c, state.editTool === "erase");
  }
}

function floodFill(r, c) {
  const result = state.result;
  const target = effectiveColor(result.grid[r][c], result);
  const targetCode = target ? target.code : null;
  const col = editFullPalette[state.editColorIdx];
  if (!col.isBg && targetCode === col.code) return;
  strokeChanges = new Map();
  const stack = [[r, c]];
  const seen = new Set();
  while (stack.length) {
    const [y, x] = stack.pop();
    const key = y + "," + x;
    if (seen.has(key)) continue;
    seen.add(key);
    if (y < 0 || y >= result.rows || x < 0 || x >= result.cols) continue;
    const cc = result.grid[y][x];
    const ec = effectiveColor(cc, result);
    if ((ec ? ec.code : null) !== targetCode) continue;
    recordChange(y, x);
    if (col.isBg) {
      cc.bg = true;
      cc.blank = true;
      cc.override = null;
    } else {
      cc.outline = false;
      cc.override = { code: col.code, hex: col.hex, r: col.r, g: col.g, b: col.b };
      cc.blank = false; cc.bg = false;
    }
    stack.push([y + 1, x], [y - 1, x], [y, x + 1], [y, x - 1]);
  }
  commitStroke();
  redraw();
}

function commitStroke() {
  if (strokeChanges && strokeChanges.size) {
    undoStack.push(strokeChanges);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }
  strokeChanges = null;
  updateEditButtons();
  saveProject();
}

function updateEditButtons() {
  const ub = $("#undoBtn");
  const rb = $("#redoBtn");
  if (ub) ub.disabled = !undoStack.length;
  if (rb) rb.disabled = !redoStack.length;
}

function undoEdit() {
  if (!undoStack.length || !state.result) return;
  const stroke = undoStack.pop();
  const cur = new Map();
  for (const ch of stroke.values()) {
    const cell = state.result.grid[ch.r][ch.c];
    cur.set(ch.r + "," + ch.c, {
      override: cell.override ? { ...cell.override } : null,
      blank: !!cell.blank,
      bg: !!cell.bg,
    });
  }
  for (const ch of stroke.values()) {
    const cell = state.result.grid[ch.r][ch.c];
    cell.override = ch.prevOverride ? { ...ch.prevOverride } : null;
    cell.blank = ch.prevBlank;
    cell.bg = ch.prevBg;
  }
  redoStack.push(cur);
  updateEditButtons();
  redraw();
}

function redoEdit() {
  if (!redoStack.length || !state.result) return;
  const stroke = redoStack.pop();
  const cur = new Map();
  for (const ch of stroke.values()) {
    const cell = state.result.grid[ch.r][ch.c];
    cur.set(ch.r + "," + ch.c, {
      override: cell.override ? { ...cell.override } : null,
      blank: !!cell.blank,
      bg: !!cell.bg,
    });
  }
  for (const ch of stroke.values()) {
    const cell = state.result.grid[ch.r][ch.c];
    cell.override = ch.override ? { ...ch.override } : null;
    cell.blank = ch.blank;
    cell.bg = ch.bg;
  }
  undoStack.push(cur);
  updateEditButtons();
  redraw();
}

function showHover(e, pos) {
  const canvas = $("#preview");
  const rect = canvas.getBoundingClientRect();
  const wrap = $(".canvas-wrap").getBoundingClientRect();
  const s = (rect.width / canvas.width) * previewCellSize;
  const box = $("#hoverBox");
  box.style.left = rect.left - wrap.left + pos.c * s + "px";
  box.style.top = rect.top - wrap.top + pos.r * s + "px";
  box.style.width = s + "px";
  box.style.height = s + "px";
  box.hidden = false;
  const cell = state.result.grid[pos.r][pos.c];
  const col = effectiveColor(cell, state.result);
  const tip = $("#cellTip");
  tip.textContent = `(${pos.c + 1}, ${pos.r + 1})  ${
    cell.bg ? "背景(留空)" : cell.blank ? "空白" : col ? col.code + " " + col.hex : "—"
  }`;
  tip.hidden = false;
  tip.style.left = e.clientX - wrap.left + 12 + "px";
  tip.style.top = e.clientY - wrap.top + 12 + "px";
}

function hideHover() {
  const box = $("#hoverBox");
  const tip = $("#cellTip");
  if (box) box.hidden = true;
  if (tip) tip.hidden = true;
}

function openBulk(fromCode) {
  const sel = $("#bulkFrom");
  const to = $("#bulkTo");
  if (!sel.options.length) {
    editFullPalette.forEach((c) => {
      const label = c.isBg ? `${c.code} 背景` : `${c.code} ${c.hex}`;
      const o1 = document.createElement("option");
      o1.value = c.code;
      o1.textContent = label;
      sel.appendChild(o1);
      const o2 = document.createElement("option");
      o2.value = c.code;
      o2.textContent = label;
      to.appendChild(o2);
    });
  }
  if (fromCode) sel.value = fromCode;
  updateBulkPreview();
  $("#bulkModal").classList.add("show");
}

function updateBulkPreview() {
  const result = state.result;
  if (!result) return;
  const from = $("#bulkFrom").value;
  const to = $("#bulkTo").value;
  let count = 0;
  for (const row of result.grid)
    for (const cell of row) {
      const c = effectiveColor(cell, result);
      if (from === "BG" ? !!cell.bg : c && c.code === from) count++;
    }
  $("#bulkPreview").textContent = `将把 ${from} 共 ${count} 颗 → ${to}`;
}

function applyBulk() {
  const result = state.result;
  if (!result) return;
  const from = $("#bulkFrom").value;
  const toCode = $("#bulkTo").value;
  const idx = editCodeIndex[toCode];
  if (idx == null) return;
  const col = editFullPalette[idx];
  strokeChanges = new Map();
  for (let r = 0; r < result.rows; r++)
    for (let c = 0; c < result.cols; c++) {
      const cell = result.grid[r][c];
      const ec = effectiveColor(cell, result);
      const match = from === "BG" ? !!cell.bg : ec && ec.code === from;
      if (match) {
        recordChange(r, c);
        if (col.isBg) {
          cell.bg = true;
          cell.blank = true;
          cell.override = null;
        } else {
          cell.outline = false;
          cell.override = { code: col.code, hex: col.hex, r: col.r, g: col.g, b: col.b };
          cell.blank = false; cell.bg = false;
        }
      }
    }
  commitStroke();
  redraw();
  $("#bulkModal").classList.remove("show");
}

function showTextPopover(clientX, clientY) {
  const pop = $("#textPopover");
  if (!pop) return;
  pop.hidden = false;
  const w = pop.offsetWidth || 240;
  const h = pop.offsetHeight || 90;
  let x = clientX + 8;
  let y = clientY + 8;
  if (x + w > window.innerWidth) x = window.innerWidth - w - 8;
  if (y + h > window.innerHeight) y = window.innerHeight - h - 8;
  pop.style.left = x + "px";
  pop.style.top = y + "px";
  const inp = $("#textInput");
  if (inp) {
    inp.value = inp.value || "ABC";
    inp.focus();
    inp.select();
  }
}

function hideTextPopover() {
  const pop = $("#textPopover");
  if (pop) pop.hidden = true;
}

function confirmText() {
  const inp = $("#textInput");
  const sizeSel = $("#textSize");
  const text = inp ? inp.value : "";
  const h = sizeSel ? parseInt(sizeSel.value, 10) : 7;
  if (textStart && text) applyText(textStart.r, textStart.c, text, h);
  textStart = null;
  hideTextPopover();
}

function initEditListeners() {
  const canvas = $("#preview");
  let isDrawing = false;

  if (canvas) {
    canvas.addEventListener("pointerdown", (e) => {
      if (!state.editing || !state.result) return;
      if (state.editTool === "view") {
        isDrawing = false;
        return;
      }
      e.preventDefault();
      const pos = gridCoordFromEvent(e);
      if (!pos) return;
      if (state.editTool === "text") {
        textStart = pos;
        showTextPopover(e.clientX, e.clientY);
        return;
      }
      if (state.editTool === "line" || state.editTool === "rect" || state.editTool === "ellipse") {
        isDrawing = true;
        dragMode = "shape";
        strokeChanges = new Map();
        state.tempShape = { tool: state.editTool, r0: pos.r, c0: pos.c, r1: pos.r, c1: pos.c };
        if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
        redraw();
        return;
      }
      if (state.editTool === "select") {
        const ns = state.sel ? normSel(state.sel) : null;
        if (ns && pos.r >= ns.r0 && pos.r <= ns.r1 && pos.c >= ns.c0 && pos.c <= ns.c1) {
          isDrawing = true;
          dragMode = "move";
          moveSnap = snapshotSel(ns);
          state._moveStart = pos;
        } else {
          isDrawing = true;
          dragMode = "marquee";
          state.sel = { r0: pos.r, c0: pos.c, r1: pos.r, c1: pos.c };
        }
        if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
        redraw();
        return;
      }
      isDrawing = true;
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      if (state.editTool === "fill") {
        strokeChanges = new Map();
        applyToolAt(pos.r, pos.c);
        isDrawing = false;
        redraw();
        return;
      }
      if (state.editTool === "pick") {
        applyToolAt(pos.r, pos.c);
        isDrawing = false;
        redraw();
        return;
      }
      strokeChanges = new Map();
      applyToolAt(pos.r, pos.c);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!state.editing || !state.result) return;
      const pos = gridCoordFromEvent(e);
      if (!pos) {
        hideHover();
        return;
      }
      showHover(e, pos);
      if (!isDrawing) return;
      if (dragMode === "shape" && state.tempShape) {
        state.tempShape.r1 = pos.r;
        state.tempShape.c1 = pos.c;
        redraw();
      } else if (dragMode === "marquee" && state.sel) {
        state.sel.r1 = pos.r;
        state.sel.c1 = pos.c;
        redraw();
      } else if (dragMode === "move" && moveSnap && state._moveStart) {
        const s = normSel(moveSnap);
        const dr = pos.r - state._moveStart.r;
        const dc = pos.c - state._moveStart.c;
        state.sel = {
          r0: s.r0 + dr, c0: s.c0 + dc, r1: s.r1 + dr, c1: s.c1 + dc,
        };
        redraw();
      } else if (state.editTool === "paint" || state.editTool === "erase") {
        applyToolAt(pos.r, pos.c);
      }
    });
    canvas.addEventListener("pointerup", () => {
      if (!isDrawing) return;
      isDrawing = false;
      if (dragMode === "shape") {
        commitShape();
      } else if (dragMode === "move" && moveSnap && state._moveStart) {
        const s = normSel(moveSnap);
        const cur = normSel(state.sel);
        applyMove(cur.r0 - s.r0, cur.c0 - s.c0);
        moveSnap = null;
        state._moveStart = null;
      } else if (strokeChanges) {
        commitStroke();
      }
      dragMode = null;
      renderLegend($("#legend"), state.result);
      updateBoardInfo();
    });
    canvas.addEventListener("pointerleave", hideHover);
    canvas.addEventListener("contextmenu", (e) => {
      if (!state.editing || !state.result) return;
      e.preventDefault();
      const pos = gridCoordFromEvent(e);
      if (!pos) return;
      if (
        state.editTool === "view" ||
        state.editTool === "line" ||
        state.editTool === "rect" ||
        state.editTool === "ellipse" ||
        state.editTool === "select"
      )
        return;
      strokeChanges = new Map();
      recordChange(pos.r, pos.c);
      const cell = state.result.grid[pos.r][pos.c];
      cell.blank = true;
      cell.override = null;
      paintCellOnCanvas(pos.r, pos.c);
      commitStroke();
      renderLegend($("#legend"), state.result);
    });
  }

  $("#editToggle").addEventListener("click", () =>
    state.editing ? exitEdit() : enterEdit()
  );
  $("#editPaletteSearch").addEventListener("input", (e) =>
    renderEditPalette(e.target.value)
  );
  document.querySelectorAll(".tool-btn").forEach((b) =>
    b.addEventListener("click", () => setTool(b.dataset.tool))
  );
  $("#undoBtn").addEventListener("click", undoEdit);
  $("#redoBtn").addEventListener("click", redoEdit);
  $("#bulkBtn").addEventListener("click", () => openBulk());
  $("#bulkFrom").addEventListener("change", updateBulkPreview);
  $("#bulkTo").addEventListener("change", updateBulkPreview);
  $("#bulkApplyBtn").addEventListener("click", applyBulk);
  $("#bulkClose").addEventListener("click", () =>
    $("#bulkModal").classList.remove("show")
  );
  const legend = $("#legend");
  if (legend)
    legend.addEventListener("click", (e) => {
      const item = e.target.closest(".legend-item");
      if (item && state.editing) openBulk(item.querySelector(".lname").textContent);
    });

  $("#gridToggle").addEventListener("change", (e) => {
    state.showGrid = e.target.checked;
    redraw();
  });
  $("#boardToggle").addEventListener("change", (e) => {
    state.showBoards = e.target.checked;
    redraw();
  });
  $("#refOutline").addEventListener("change", (e) => {
    state.refOutline = e.target.checked;
    redraw();
  });
  $("#highlightEdits").addEventListener("change", (e) => {
    state.highlightEdits = e.target.checked;
    redraw();
  });
  $("#symMode").addEventListener("change", (e) => {
    state.symmetry = e.target.value;
  });
  $("#flipH").addEventListener("click", () => transformPattern("flipH"));
  $("#flipV").addEventListener("click", () => transformPattern("flipV"));
  $("#rot90").addEventListener("click", () => transformPattern("rot90"));
  $("#selFill").addEventListener("click", () => selOp(false));
  $("#selDel").addEventListener("click", () => selOp(true));
  $("#selClear").addEventListener("click", () => {
    state.sel = null;
    redraw();
  });
  $("#selCopy").addEventListener("click", copySelection);
  $("#selPaste").addEventListener("click", pasteSelection);
  $("#textOk").addEventListener("click", confirmText);
  $("#textCancel").addEventListener("click", () => {
    textStart = null;
    hideTextPopover();
  });
  const textInput = $("#textInput");
  if (textInput)
    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmText();
      } else if (e.key === "Escape") {
        textStart = null;
        hideTextPopover();
      }
    });
  $("#exportBoards").addEventListener("click", exportBoards);

  document.addEventListener("keydown", (e) => {
    if (!state.editing || !state.result) return;
    const t = e.target.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redoEdit();
      else undoEdit();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redoEdit();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (state.sel) {
        e.preventDefault();
        selOp(true);
      }
      return;
    }
    if (e.key === "Escape") {
      state.sel = null;
      state.tempShape = null;
      redraw();
      return;
    }
    const map = {
      b: "paint", e: "erase", i: "pick", g: "fill", v: "view",
      l: "line", r: "rect", o: "ellipse", s: "select", t: "text",
    };
    if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  });
}

document.addEventListener("DOMContentLoaded", init);
