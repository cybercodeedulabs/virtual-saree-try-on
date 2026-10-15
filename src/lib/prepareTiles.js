// Turns marked regions of a saree photo into clean, repeatable fabric tiles.
// All work happens in the browser on CPU canvases; nothing is uploaded anywhere.

const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    // cap very large phone photos so preparation stays quick
    const MAX = 2400;
    const s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = makeCanvas(img.naturalWidth * s, img.naturalHeight * s);
    ctx2d(c).drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Crop an axis-aligned box drawn on the straightened (rotated) photo.
 * view: { cw, ch, scale, angle } — how the photo is shown on screen; box in screen pixels.
 */
export function cropStraightened(photo, view, box, maxSide = 1400) {
  const w = Math.abs(box.x1 - box.x0) / view.scale;
  const h = Math.abs(box.y1 - box.y0) / view.scale;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const out = makeCanvas(w * k, h * k);
  const g = ctx2d(out);
  const x0 = Math.min(box.x0, box.x1), y0 = Math.min(box.y0, box.y1);
  g.imageSmoothingQuality = 'high';
  g.scale(k, k);
  g.translate((view.cw / 2 - x0) / view.scale, (view.ch / 2 - y0) / view.scale);
  g.rotate(view.angle);
  g.drawImage(photo, -photo.width / 2, -photo.height / 2);
  return out;
}

/**
 * Remove large-scale light and shadow (window light, folds, sheen) while keeping the weave and motifs.
 * mode 'ratio' scales brightness only; 'colour' also removes slow colour shifts (silk sheen).
 */
export function evenLighting(src, strength = 1, detail = 28, mode = 'ratio') {
  const w = src.width, h = src.height;
  // detail: how many times smaller the light map is; lower = removes finer sheen (keep above motif size)
  const small = makeCanvas(Math.max(2, w / detail), Math.max(2, h / detail));
  const sg = ctx2d(small);
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(src, 0, 0, small.width, small.height);
  const blur = makeCanvas(w, h);
  const bg = ctx2d(blur);
  bg.filter = 'blur(6px)';
  bg.imageSmoothingQuality = 'high';
  bg.drawImage(small, 0, 0, w, h);
  const out = makeCanvas(w, h);
  const og = ctx2d(out);
  og.drawImage(src, 0, 0);
  const d = og.getImageData(0, 0, w, h);
  const b = bg.getImageData(0, 0, w, h).data;
  // reference brightness = median of the blurred image
  const lums = [];
  for (let i = 0; i < b.length; i += 4 * 64) lums.push(b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114);
  lums.sort((x, y) => x - y);
  const ref = lums[lums.length >> 1] || 128;
  if (mode === 'colour') {
    // reference colour = per-channel median of the light map
    const ch = [[], [], []];
    for (let i = 0; i < b.length; i += 4 * 64) { ch[0].push(b[i]); ch[1].push(b[i + 1]); ch[2].push(b[i + 2]); }
    const med = ch.map((a) => a.sort((x, y) => x - y)[a.length >> 1] ?? 128);
    for (let i = 0; i < d.data.length; i += 4) {
      for (let k = 0; k < 3; k++) d.data[i + k] = Math.max(0, Math.min(255, d.data[i + k] + (med[k] - b[i + k]) * strength));
    }
    og.putImageData(d, 0, 0);
    return out;
  }
  for (let i = 0; i < d.data.length; i += 4) {
    const l = b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114 + 1;
    const f = 1 + (ref / l - 1) * strength;
    d.data[i] = Math.min(255, d.data[i] * f);
    d.data[i + 1] = Math.min(255, d.data[i + 1] * f);
    d.data[i + 2] = Math.min(255, d.data[i + 2] * f);
  }
  og.putImageData(d, 0, 0);
  return out;
}

/** Cross-fade opposite edges so the tile repeats without visible seams. axes: 'x', 'y' or 'xy'. */
export function seamless(src, axes = 'xy', frac = 0.14) {
  let c = src;
  const blendX = (inp) => {
    const w = inp.width, h = inp.height, f = Math.max(2, Math.round(w * frac));
    const out = makeCanvas(w - f, h);
    const g = ctx2d(out);
    g.drawImage(inp, 0, 0);
    const a = ctx2d(inp).getImageData(0, 0, w, h).data;
    const d = g.getImageData(0, 0, w - f, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < f; x++) {
        const t = x / f, o = (y * (w - f) + x) * 4, left = (y * w + x) * 4, right = (y * w + (w - f + x)) * 4;
        for (let k = 0; k < 3; k++) d.data[o + k] = a[right + k] * (1 - t) + a[left + k] * t;
      }
    }
    g.putImageData(d, 0, 0);
    return out;
  };
  const transpose = (inp) => {
    const out = makeCanvas(inp.height, inp.width);
    const g = ctx2d(out);
    g.setTransform(0, 1, 1, 0, 0, 0);
    g.drawImage(inp, 0, 0);
    return out;
  };
  if (axes.includes('x')) c = blendX(c);
  if (axes.includes('y')) c = transpose(blendX(transpose(c)));
  return c;
}

/** Rotate by 90 degree steps and optionally flip vertically. */
export function orient(src, quarterTurns = 0, flipV = false) {
  const q = ((quarterTurns % 4) + 4) % 4;
  const out = q % 2 ? makeCanvas(src.height, src.width) : makeCanvas(src.width, src.height);
  const g = ctx2d(out);
  g.translate(out.width / 2, out.height / 2);
  if (flipV) g.scale(1, -1);
  g.rotate((q * Math.PI) / 2);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/** A few representative colours from a tile, for blouse suggestions. */
export function dominantColours(src, n = 3) {
  const s = makeCanvas(32, 32);
  const g = ctx2d(s);
  g.drawImage(src, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const key = `${d[i] >> 5},${d[i + 1] >> 5},${d[i + 2] >> 5}`;
    const b = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; b.n++;
    buckets.set(key, b);
  }
  return [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, n)
    .map((b) => toHex(b.r / b.n, b.g / b.n, b.b / b.n));
}

export const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  return toHex(((n >> 16) & 255) * f, ((n >> 8) & 255) * f, (n & 255) * f);
}

export const toBlob = (canvas, q = 0.9) => new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));

/** Borders: even out brightness along the length only, so the gold/colour bands keep their contrast. */
export function evenAlong(src) {
  const w = src.width, h = src.height;
  const out = makeCanvas(w, h);
  const g = ctx2d(out);
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, w, h);
  const col = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) { const i = (y * w + x) * 4; s += d.data[i] * 0.299 + d.data[i + 1] * 0.587 + d.data[i + 2] * 0.114; }
    col[x] = s / h;
  }
  // smooth over ~1/8 of the length so the weave texture survives
  const r = Math.max(2, Math.round(w / 16)), sm = new Float32Array(w);
  for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const j = x + k; if (j >= 0 && j < w) { s += col[j]; n++; } } sm[x] = s / n; }
  const mean = sm.reduce((a, b) => a + b, 0) / w;
  for (let x = 0; x < w; x++) {
    const f = mean / (sm[x] + 1);
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      d.data[i] = Math.min(255, d.data[i] * f); d.data[i + 1] = Math.min(255, d.data[i + 1] * f); d.data[i + 2] = Math.min(255, d.data[i + 2] * f);
    }
  }
  g.putImageData(d, 0, 0);
  return out;
}

/** Average colour of a tile (for the base colour under border/pallu tiles). */
export function averageColour(src) {
  const s = makeCanvas(8, 8);
  const g = ctx2d(s);
  g.drawImage(src, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  return toHex(r / 64, gg / 64, b / 64);
}

/**
 * Build the body/border/pallu tiles from marked regions (manual or automatic).
 * regions[key] = { box, angle (deg) }; skipped[key] = true leaves that part out.
 */
export function makeTiles(photo, regions, opt, skipped = {}) {
  const crop = (k) => {
    const r = regions[k];
    if (!photo || !r || skipped[k]) return null;
    return cropStraightened(photo, { cw: 0, ch: 0, scale: 1, angle: (r.angle * Math.PI) / 180 }, r.box);
  };
  const t = {};
  const b = crop('body');
  if (b) t.body = seamless(opt.even ? evenLighting(b, 1, 10, 'colour') : b, 'xy');
  const br = crop('border');
  if (br) t.border = seamless(evenAlong(orient(br, opt.borderTurn ?? 0, opt.borderFlip)), 'x', 0.08);
  const p = crop('pallu');
  if (p) t.pallu = seamless(opt.even ? evenLighting(orient(p, opt.palluTurn), 0.85) : orient(p, opt.palluTurn), 'xy');
  return t;
}

/** Blouse colours that go with the saree: darker body shades first, then border and pallu colours. */
export function blouseSuggestions(tiles) {
  const out = [];
  if (tiles.body) { const c = dominantColours(tiles.body, 1)[0]; out.push(shade(c, 0.85), shade(c, 0.6)); }
  if (tiles.border) out.push(...dominantColours(tiles.border, 2));
  if (tiles.pallu) out.push(shade(dominantColours(tiles.pallu, 1)[0], 0.7));
  out.push('#2f4a33', '#5c0b1d');
  return [...new Set(out)].slice(0, 7);
}

/** The record the app shows, saves (IndexedDB) and downloads. */
export async function buildRecord({ tiles, opt, name, blouse }) {
  const id = `prep-${Date.now()}`;
  const chip = makeCanvas(300, 380), g = chip.getContext('2d');
  const bodySide = 150;
  for (let y = 0; y < 380; y += bodySide) for (let x = 0; x < 300; x += bodySide) g.drawImage(tiles.body, x, y, bodySide, bodySide);
  if (tiles.border) {
    const bh = 96, bw = (tiles.border.width / tiles.border.height) * bh;
    for (let x = 0; x < 300; x += bw) g.drawImage(tiles.border, x, 380 - bh, bw, bh);
  }
  return {
    id, name: name.trim() || 'Saree from photo', blouse, savedAt: Date.now(),
    body: { blob: await toBlob(tiles.body), tileCm: opt.bodyCm },
    border: tiles.border ? { blob: await toBlob(tiles.border), heightCm: opt.borderCm, color: averageColour(tiles.border) } : null,
    pallu: tiles.pallu ? { blob: await toBlob(tiles.pallu), tileCm: opt.palluCm, color: averageColour(tiles.pallu) } : null,
    chip: await toBlob(chip, 0.85),
  };
}
