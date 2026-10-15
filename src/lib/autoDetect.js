// Finds the body fabric, border and pallu in a saree photo without any input from the customer.
// Works on a small copy of the photo (about 320 px), so it takes well under a second on a kiosk.
//
// The result uses the same region format as the manual preparation screen (FabricPrep):
//   regions[key] = { box: {x0,y0,x1,y1} in photo pixels around the photo centre after straightening, angle: degrees }
// so staff can open the manual screen with everything already marked and correct it.
//
// What it does, in order:
//   1. background: colours along the photo frame, flooded inwards (also transparent pixels)
//   2. saree pixels: foreground minus grey/white/black parts (mannequin, dress form, shadows)
//   3. body colour: the most common saree colour (shading ignored)
//   4. border: the angle at which non-body pixels form the longest straight band
//   5. body tile: the largest square of body colour, straightened to the border
//   6. pallu: the largest textured square that is neither body nor that border
// Limits: grey, black or white sarees, photos with a busy background, and heavily folded sarees
// can be detected wrongly; staff can correct them with Adjust.

const SMALL = 320;

// ---------- colour ----------
function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const LIN = new Float32Array(256).map((_, i) => srgbToLinear(i));
function labOf(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// deterministic random numbers, so the same photo always gives the same result
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function kmeans(points, dims, k, iters = 12, weights = null) {
  const n = points.length / dims;
  if (n === 0) return { centres: [], labels: new Int32Array(0), counts: [] };
  k = Math.min(k, n);
  const rand = rng(12345);
  const centres = [];
  const w = weights ?? new Float32Array(dims).fill(1);
  const dist = (i, c) => { let d = 0; for (let j = 0; j < dims; j++) { const t = (points[i * dims + j] - c[j]) * w[j]; d += t * t; } return d; };
  centres.push(Array.from(points.subarray(0, dims)));
  const best = new Float32Array(n).fill(Infinity);
  while (centres.length < k) {                                  // k-means++ seeding
    let sum = 0;
    for (let i = 0; i < n; i++) { best[i] = Math.min(best[i], dist(i, centres[centres.length - 1])); sum += best[i]; }
    let r = rand() * sum, pick = n - 1;
    for (let i = 0; i < n; i++) { r -= best[i]; if (r <= 0) { pick = i; break; } }
    centres.push(Array.from(points.subarray(pick * dims, pick * dims + dims)));
  }
  const labels = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    const sums = centres.map(() => new Float64Array(dims + 1));
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = dist(i, centres[c]); if (d < bd) { bd = d; bi = c; } }
      labels[i] = bi;
      const s = sums[bi]; for (let j = 0; j < dims; j++) s[j] += points[i * dims + j]; s[dims]++;
    }
    for (let c = 0; c < k; c++) if (sums[c][dims]) for (let j = 0; j < dims; j++) centres[c][j] = sums[c][j] / sums[c][dims];
  }
  const counts = centres.map(() => 0);
  for (let i = 0; i < n; i++) counts[labels[i]]++;
  return { centres, labels, counts };
}

// ---------- masks ----------
function integral(mask, w, h) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += mask[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  return (x0, y0, x1, y1) => I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
}

function largestComponents(mask, w, h, keepFrac = 0.2) {
  const lab = new Int32Array(w * h).fill(-1), sizes = [];
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const id = sizes.length; let sp = 0, n = 0;
    stack[sp++] = i; lab[i] = id;
    while (sp) {
      const p = stack[--sp]; n++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && lab[p - 1] < 0) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && lab[p + 1] < 0) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && lab[p - w] < 0) { lab[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && lab[p + w] < 0) { lab[p + w] = id; stack[sp++] = p + w; }
    }
    sizes.push(n);
  }
  const big = Math.max(0, ...sizes);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && sizes[lab[i]] >= big * keepFrac) out[i] = 1;
  return out;
}

// sample a per-pixel array onto a grid rotated by `ang` (same convention as canvas rotate in FabricPrep)
function rotateGrid(src, w, h, ang, D) {
  const out = new Uint8Array(D * D), c = Math.cos(ang), s = Math.sin(ang);
  for (let v = 0; v < D; v++) {
    for (let u = 0; u < D; u++) {
      const U = u - D / 2 + 0.5, V = v - D / 2 + 0.5;
      const x = Math.round(c * U + s * V + w / 2 - 0.5), y = Math.round(-s * U + c * V + h / 2 - 0.5);
      if (x >= 0 && y >= 0 && x < w && y < h) out[v * D + u] = src[y * w + x];
    }
  }
  return out;
}

/**
 * Analyse a small RGBA image. Returns regions in small-image pixels (rotated frame) plus colours.
 * Exported separately so it can be tested without a browser.
 */
export function analyse({ data, width: w, height: h }) {
  const N = w * h;
  const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);
  for (let i = 0; i < N; i++) { const [l, a, b] = labOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); L[i] = l; A[i] = a; B[i] = b; }
  const chroma = (i) => Math.hypot(A[i], B[i]);
  const alpha = (i) => data[i * 4 + 3];

  // 1. background
  const frame = [];
  for (let x = 0; x < w; x++) for (const y of [0, 1, 2, h - 3, h - 2, h - 1]) frame.push(y * w + x);
  for (let y = 3; y < h - 3; y++) for (const x of [0, 1, 2, w - 3, w - 2, w - 1]) frame.push(y * w + x);
  const opaqueFrame = frame.filter((i) => alpha(i) > 127);
  const fp = new Float32Array(opaqueFrame.length * 3);
  opaqueFrame.forEach((i, j) => { fp[j * 3] = L[i]; fp[j * 3 + 1] = A[i]; fp[j * 3 + 2] = B[i]; });
  const fk = kmeans(fp, 3, 4, 8);
  // a colour is background only if it covers much of the frame (a draped saree often touches the bottom edge)
  const bgCentres = fk.centres.filter((_, c) => fk.counts[c] > opaqueFrame.length * 0.2);
  const bgLike = (i) => {
    if (alpha(i) <= 127) return true;
    for (const c of bgCentres) { const d = Math.hypot((L[i] - c[0]) * 0.6, A[i] - c[1], B[i] - c[2]); if (d < 13) return true; }
    return false;
  };
  let bg = new Uint8Array(N);
  const queue = [];
  for (const i of frame) if (bgLike(i)) { bg[i] = 1; queue.push(i); }
  while (queue.length) {
    const p = queue.pop(), x = p % w, y = (p / w) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
      if (q >= 0 && !bg[q] && bgLike(q)) { bg[q] = 1; queue.push(q); }
    }
  }
  // 2. saree pixels: not background, not neutral (mannequin, dress form, floor, shadow)
  const sareeMask = (bgMask) => {
    const fgM = Uint8Array.from(bgMask, (v) => 1 - v);
    let m = Uint8Array.from({ length: N }, (_, i) => (fgM[i] && chroma(i) > 9 ? 1 : 0));
    let n = m.reduce((x, y) => x + y, 0);
    const nFg = fgM.reduce((x, y) => x + y, 0);
    if (n < N * 0.04) { m = fgM; n = nFg; }                                    // grey/white/black saree
    const kept = largestComponents(m, w, h, 0.15);
    return { fg: fgM, fgCount: nFg, saree: kept, before: n, count: kept.reduce((x, y) => x + y, 0) };
  };
  let S = sareeMask(bg);
  // a close-up of the fabric has no background: the flood swallows almost the whole photo,
  // or leaves only scattered motifs
  const bgFrac = bg.reduce((a, b) => a + b, 0) / N;
  const closeUp = bgFrac > 0.92 || S.count < N * 0.03 || S.count < S.before * 0.5;
  if (closeUp) { bg = Uint8Array.from({ length: N }, (_, i) => (alpha(i) <= 127 ? 1 : 0)); S = sareeMask(bg); }
  const { fg, fgCount } = S;
  const saree = S.saree, sareeCount = S.count;
  const mannequinFrac = fgCount ? (fgCount - sareeCount) / fgCount : 0;
  // draped on a mannequin or dress form: the top of the foreground (head, neck) is mostly neutral
  let draped = false;
  {
    let top = h, bottom = 0;
    for (let i = 0; i < N; i++) if (fg[i]) { const y = (i / w) | 0; top = Math.min(top, y); bottom = Math.max(bottom, y); }
    let n = 0, neutral = 0;
    for (let y = top; y < top + (bottom - top) * 0.15; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (fg[i]) { n++; if (!saree[i]) neutral++; } }
    draped = n > 0 && neutral / n > 0.5;
  }

  // 3. body colour: most common hue among saree pixels (lightness down-weighted so folds do not split it)
  const idx = []; for (let i = 0; i < N; i++) if (saree[i]) idx.push(i);
  const pts = new Float32Array(idx.length * 3);
  idx.forEach((i, j) => { pts[j * 3] = L[i]; pts[j * 3 + 1] = A[i]; pts[j * 3 + 2] = B[i]; });
  const km = kmeans(pts, 3, 6, 12, Float32Array.from([0.35, 1, 1]));
  // local texture: lightness spread in a 5 x 5 neighbourhood
  const tex = new Float32Array(N);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x; if (!saree[i]) continue;
    let s1 = 0, s2 = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const v = L[i + dy * w + dx]; s1 += v; s2 += v * v; }
    tex[i] = Math.sqrt(Math.max(0, s2 / 25 - (s1 / 25) ** 2));
  }
  // group clusters of the same hue (lighter/darker = sheen and folds of one colour)
  const K = km.centres.length, group = new Int32Array(K).fill(-1), groups = [];
  // same hue = same dye: shading changes lightness and chroma but hardly the hue angle
  const sameHue = (p, q) => {
    const cp = Math.hypot(p[1], p[2]), cq = Math.hypot(q[1], q[2]);
    if (Math.hypot(p[1] - q[1], p[2] - q[2]) < 10) return true;
    if (cp < 12 || cq < 12) return false;
    let dh = Math.abs(Math.atan2(p[2], p[1]) - Math.atan2(q[2], q[1])) * 180 / Math.PI;
    if (dh > 180) dh = 360 - dh;
    // shading keeps chroma roughly in proportion to lightness; zari or a second dye does not
    const sat = Math.abs(Math.log((cp / Math.max(5, p[0])) / (cq / Math.max(5, q[0]))));
    return dh < 30 && sat < 0.25;
  };
  const byCount = km.counts.map((n, c) => [n, c]).sort((x, y) => y[0] - x[0]).map(([, c]) => c);
  for (const c of byCount) {
    if (group[c] >= 0) continue;
    group[c] = groups.length; const g = [c];
    for (const d of byCount) if (group[d] < 0 && sameHue(km.centres[c], km.centres[d])) { group[d] = groups.length; g.push(d); }
    groups.push(g);
  }
  const gStats = groups.map(() => ({ n: 0, t: 0 }));
  idx.forEach((i, j) => { const g = gStats[group[km.labels[j]]]; g.n++; g.t += tex[i]; });
  // the body is a large, plain colour; a brocade pallu can be as large but is busy
  // gold/silver zari (muted yellow) is almost always border or pallu, rarely the body
  const zari = (c) => c[0] > 40 && c[1] > -6 && c[1] < 14 && c[2] > 6 && c[2] < 40 && c[2] > c[1];
  const gScore = gStats.map((g, k) => g.n / (1 + ((g.t / Math.max(1, g.n)) / 5) ** 2) * (zari(km.centres[groups[k][0]]) ? 0.4 : 1));
  const bodyGroup = gScore.indexOf(Math.max(...gScore));
  const isBodyCluster = km.centres.map((_, k) => group[k] === bodyGroup);
  const bodyC = { L: 0, a: 0, b: 0, n: 0 };
  km.centres.forEach((c, k) => { if (isBodyCluster[k]) { bodyC.L += c[0] * km.counts[k]; bodyC.a += c[1] * km.counts[k]; bodyC.b += c[2] * km.counts[k]; bodyC.n += km.counts[k]; } });
  bodyC.L /= bodyC.n; bodyC.a /= bodyC.n; bodyC.b /= bodyC.n;
  const body = new Uint8Array(N);
  idx.forEach((i, j) => { if (isBodyCluster[km.labels[j]]) body[i] = 1; });
  const nonBody = Uint8Array.from({ length: N }, (_, i) => (saree[i] && !body[i] ? 1 : 0));

  // saree extent, for the minimum border length
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let i = 0; i < N; i++) if (saree[i]) { const x = i % w, y = (i / w) | 0; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const longSide = Math.max(maxX - minX, maxY - minY) + 1;

  // 4. border: the longest straight edge where body fabric meets other saree fabric,
  // then the band of other fabric along that edge, as far as its colour stays the same.
  const D = Math.ceil(Math.hypot(w, h));
  // thin body-coloured lines inside a border are not body fabric: open the mask (erode, then dilate)
  const morph = (src, r, erode) => {
    const out = new Uint8Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = erode ? 1 : 0;
      for (let dy = -r; dy <= r && v === (erode ? 1 : 0); dy++) for (let dx = -r; dx <= r; dx++) {
        const X = x + dx, Y = y + dy;
        const s2 = X < 0 || Y < 0 || X >= w || Y >= h ? 0 : src[Y * w + X];
        if (erode && !s2) { v = 0; break; }
        if (!erode && s2) { v = 1; break; }
      }
      out[y * w + x] = v;
    }
    return out;
  };
  const bodyOpen = morph(morph(body, 2, true), 2, false);
  const outside = Uint8Array.from({ length: N }, (_, i) => (saree[i] && !bodyOpen[i] ? 1 : 0));
  const lum = new Uint8Array(N); for (let i = 0; i < N; i++) lum[i] = Math.min(255, Math.max(0, L[i] * 2.55));
  const q = (v, lo, hi) => Math.max(0, Math.min(255, Math.round(((v - lo) / (hi - lo)) * 255)));
  const Aq = new Uint8Array(N), Bq = new Uint8Array(N);
  for (let i = 0; i < N; i++) { Aq[i] = q(A[i], -100, 100); Bq[i] = q(B[i], -100, 100); }
  const deq = (v) => (v / 255) * 200 - 100;
  const edgeGap = Math.max(3, Math.round(longSide * 0.04));
  const edgeAt = (deg) => {
    const ang = (deg * Math.PI) / 180;
    const bR = rotateGrid(bodyOpen, w, h, ang, D), nR = rotateGrid(outside, w, h, ang, D);
    const found = [];
    for (const T of [false, true]) {
      const at = (g, r, c) => (T ? g[c * D + r] : g[r * D + c]);
      for (const dir of [1, -1]) {               // dir 1: body on the low-row side
        let best = { score: 0 };
        for (let r = 4; r < D - 4; r++) {
          let run = 0, bestRun = 0, bs = 0, cs = 0, miss = 0;
          for (let c = 0; c < D; c++) {
            const on = (at(bR, r - dir, c) || at(bR, r - 2 * dir, c) || at(bR, r - 3 * dir, c))
              && (at(nR, r, c) || at(nR, r + dir, c) || at(nR, r + 2 * dir, c));
            if (on) { if (run === 0) cs = c; run += 1 + miss; miss = 0; if (run > bestRun) { bestRun = run; bs = cs; } }
            else if (run > 0 && miss < edgeGap) miss++;   // sheen or a fold can cross the border
            else { run = 0; miss = 0; }
          }
          if (bestRun > best.score) best = { score: bestRun, deg, T, dir, row: r, c0: bs, c1: bs + bestRun };
        }
        if (best.score) found.push(best);
      }
    }
    return found;
  };
  // candidate edges, longest first; refine each one's angle
  let cands = [];
  for (let d = -45; d <= 45; d += 3) cands.push(...edgeAt(d));
  cands.sort((x, y) => y.score - x.score);
  const picked = [];
  for (const c of cands) {
    if (c.score < longSide * 0.25 || picked.length >= 8) break;
    if (picked.some((p) => p.T === c.T && p.dir === c.dir && Math.abs(p.deg - c.deg) <= 6)) continue;
    picked.push(c);
  }
  const tried = [];
  const measure = (e0) => {
    let edge = e0;
    for (let d = e0.deg - 2; d <= e0.deg + 2; d += 0.5) for (const e of edgeAt(d)) if (e.T === e0.T && e.dir === e0.dir && e.score > edge.score) edge = e;
    const ang = (edge.deg * Math.PI) / 180, T = edge.T, dir = edge.dir;
    const at = (g, r, c) => (T ? g[c * D + r] : g[r * D + c]);
    const nR = rotateGrid(outside, w, h, ang, D), lR = rotateGrid(lum, w, h, ang, D), aR = rotateGrid(Aq, w, h, ang, D), bR2 = rotateGrid(Bq, w, h, ang, D);
    const c0 = edge.c0 + Math.round((edge.c1 - edge.c0) * 0.05), c1 = edge.c1 - Math.round((edge.c1 - edge.c0) * 0.05);
    const rowStat = (r) => {
      let n = 0, l = 0, a = 0, b = 0;
      for (let c = c0; c < c1; c++) if (at(nR, r, c)) { n++; l += at(lR, r, c) / 2.55; a += deq(at(aR, r, c)); b += deq(at(bR2, r, c)); }
      return { frac: n / Math.max(1, c1 - c0), l: l / Math.max(1, n), a: a / Math.max(1, n), b: b / Math.max(1, n) };
    };
    // width of the band across each column, from the edge to where body fabric or background starts again
    const cap = Math.round(longSide * 0.16);
    const first = edge.row;
    const widths = [], motifGap = Math.max(2, Math.round(longSide * 0.02));
    for (let c = c0; c < c1; c++) {
      let j = 0, lead = 0, miss = 0, wdt = 0;
      while (lead < 3 && !at(nR, first + dir * j, c)) { j++; lead++; }
      for (; Math.abs(j) <= cap + 1; j++) {
        if (at(nR, first + dir * j, c)) { wdt += 1 + miss; miss = 0; } else if (++miss > motifGap) break;   // leaves and motifs inside the border
      }
      widths.push(wdt);
    }
    widths.sort((x, y) => x - y);
    const med = widths[widths.length >> 1] ?? 0;
    let r = first + dir * Math.max(0, Math.min(cap, med) - 1);
    if (Math.abs(r - first) + 1 >= cap) {
      // ...or, when another fabric (pallu, a fold) lies against it, where the colour changes:
      // a patterned border averages to a steady colour along its length, a new region does not
      r = first;
      let mean = rowStat(first), n = 1;
      while (Math.abs(r + dir - first) < cap) {
        const st = rowStat(r + dir);
        if (st.frac < 0.55 || Math.hypot((st.l - mean.l) * 0.5, st.a - mean.a, st.b - mean.b) > 20) break;
        r += dir; n++;
        mean = { l: mean.l + (st.l - mean.l) / n, a: mean.a + (st.a - mean.a) / n, b: mean.b + (st.b - mean.b) / n };
      }
    }
    const lo = Math.min(first, r), hi = Math.max(first, r), thick = hi - lo + 1;
    tried.push({ deg: edge.deg, run: edge.score, thick, capped: thick >= cap });
    // reaching the cap means a whole region (pallu, other half of a fold), not a border
    if (thick < 3 || thick >= cap) return null;
    return { r0: lo, r1: hi + 1, c0, c1, length: c1 - c0, thick, bodyFirst: dir === 1, deg: edge.deg, T };
  };
  // the longest edge whose band has a plausible border width (about 3 cm or more)
  let band = null;
  for (const e of picked) {
    const b2 = measure(e);
    if (b2 && b2.thick >= Math.max(3, longSide * 0.025) && (!band || b2.length > band.length)) band = b2;
  }
  const angleDeg = band ? band.deg : 0;
  const ang = (angleDeg * Math.PI) / 180;
  const T = band ? band.T : false;

  // everything below works in the rotated frame; `at(g, r, c)` reads rows/cols swapped when the band is vertical
  const sareeR = rotateGrid(saree, w, h, ang, D), bodyR = rotateGrid(body, w, h, ang, D), nonR = rotateGrid(nonBody, w, h, ang, D);
  const lumR = rotateGrid(lum, w, h, ang, D);
  const at = (g, r, c) => (T ? g[c * D + r] : g[r * D + c]);
  const toBox = (r0, r1, c0, c1) => (T ? { x0: r0, x1: r1, y0: c0, y1: c1 } : { x0: c0, x1: c1, y0: r0, y1: r1 });

  let border = null;
  if (band) {
    // include a sliver of body so the tile starts in the body fabric
    const r0 = band.bodyFirst ? Math.max(0, band.r0 - 1) : band.r0, r1 = band.bodyFirst ? band.r1 : Math.min(D, band.r1 + 1);
    border = { r0, r1, c0: band.c0, c1: band.c1, bodyFirst: band.bodyFirst };
  }

  // 5. body tile: the largest square that is (nearly) all body colour, preferring evenly lit fabric
  const bodyMaskR = new Uint8Array(D * D), bodyIntegral = (() => {
    for (let r = 0; r < D; r++) for (let c = 0; c < D; c++) bodyMaskR[r * D + c] = at(bodyR, r, c);
    return integral(bodyMaskR, D, D);
  })();
  const lumG = new Float32Array(D * D), lum2 = new Float32Array(D * D);
  for (let r = 0; r < D; r++) for (let c = 0; c < D; c++) { const v = at(lumR, r, c); lumG[r * D + c] = v; lum2[r * D + c] = v * v; }
  const lumI = integral(lumG, D, D), lum2I = integral(lum2, D, D);
  const varOf = (x0, y0, s) => { const n = s * s, m = lumI(x0, y0, x0 + s, y0 + s) / n; return lum2I(x0, y0, x0 + s, y0 + s) / n - m * m; };
  // pallu (no target): the largest square that qualifies.
  // body (target lightness): trade size against unevenness, so a smaller flat piece beats a large pleated one.
  const findSquare = (Isum, frac, maxS, minS, avoid, target = null) => {
    let overall = null;
    for (let s = maxS; s >= minS; s = Math.floor(s * 0.92)) {
      let best = null;
      const step = Math.max(1, s >> 3);
      for (let y = 0; y + s <= D; y += step) {
        for (let x = 0; x + s <= D; x += step) {
          if (avoid && avoid(x, y, s)) continue;
          if (Isum(x, y, x + s, y + s) < frac * s * s) continue;
          const m = lumI(x, y, x + s, y + s) / (s * s);
          if (target != null && Math.abs(m - target) > 22) continue;      // in shadow or a sheen
          const v = varOf(x, y, s) + (target == null ? 0 : 0.5 * (m - target) ** 2);
          if (!best || v < best.v) best = { x, y, s, v };
        }
      }
      if (best && target == null) return best;
      if (best) {
        const score = best.s * Math.exp(-Math.sqrt(Math.max(0, varOf(best.x, best.y, best.s))) / 30);
        if (!overall || score > overall.score) overall = { ...best, score };
      }
    }
    return overall;
  };
  const inBorder = border
    ? (x, y, s) => !(x + s <= border.c0 || x >= border.c1 || y + s <= border.r0 - 2 || y >= border.r1 + 2)
    : null;
  const maxBody = Math.round(longSide * 0.4);
  const bodyL = []; for (let i = 0; i < N; i += 3) if (body[i]) bodyL.push(L[i]);
  bodyL.sort((x, y) => x - y);
  const target = (bodyL[Math.floor(bodyL.length * 0.65)] ?? 50) * 2.55;  // well-lit lightness of the body colour
  let bodySq = findSquare(bodyIntegral, 0.88, maxBody, 14, inBorder, target) ?? findSquare(bodyIntegral, 0.7, maxBody, 10, inBorder, target)
    ?? findSquare(bodyIntegral, 0.7, maxBody, 10, inBorder);

  // 6. pallu: largest textured non-body square away from the border, unlike the border
  let pallu = null;
  {
    const cand = new Uint8Array(D * D);
    for (let r = 0; r < D; r++) for (let c = 0; c < D; c++) cand[r * D + c] = at(nonR, r, c) && at(sareeR, r, c) ? 1 : 0;
    const candI = integral(cand, D, D);
    const minS = Math.max(16, Math.round((bodySq?.s ?? 20) * 0.6));
    const sq = findSquare(candI, 0.8, Math.round(longSide * 0.45), minS, inBorder);
    if (sq) {
      // texture: a pallu has a pattern; a plain area or a shadow does not
      const sd = Math.sqrt(Math.max(0, varOf(sq.x, sq.y, sq.s)));
      // colour make-up must differ from the border (otherwise it is another run of the border)
      const hist = (x0, y0, x1, y1) => {
        const H = new Float32Array(64); let n = 0;
        for (let r = y0; r < y1; r++) for (let c = x0; c < x1; c++) {
          const rr = T ? c : r, cc = T ? r : c;
          // map rotated-frame cell back to the small image
          const U = cc - D / 2 + 0.5, V = rr - D / 2 + 0.5, co = Math.cos(ang), si = Math.sin(ang);
          const x = Math.round(co * U + si * V + w / 2 - 0.5), y = Math.round(-si * U + co * V + h / 2 - 0.5);
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const i = y * w + x;
          const ai = Math.max(0, Math.min(7, Math.floor((A[i] + 64) / 16))), bi = Math.max(0, Math.min(7, Math.floor((B[i] + 64) / 16)));
          H[ai * 8 + bi]++; n++;
        }
        return H.map((v) => v / Math.max(1, n));
      };
      let similar = 0;
      if (border) {
        const hp = hist(sq.x, sq.y, sq.x + sq.s, sq.y + sq.s), hb = hist(border.c0, border.r0, border.c1, border.r1);
        for (let k = 0; k < 64; k++) similar += Math.min(hp[k], hb[k]);
      }
      if (sd > 14 && similar < 0.75) pallu = { ...sq, sd, similar };
    }
  }

  return {
    size: { w, h, D },
    tried, groups: groups.map((g, k) => [g.map((c) => km.centres[c].map(Math.round).join('/')).join(' '), gStats[k].n, +(gStats[k].t / Math.max(1, gStats[k].n)).toFixed(1)]), bodyGroup,
    closeUp, draped, mannequinFrac, longSide, sareeCount,
    angleDeg, turn: T ? 1 : 0,
    body: bodySq && { ...toBox(bodySq.y, bodySq.y + bodySq.s, bodySq.x, bodySq.x + bodySq.s), s: bodySq.s },
    border: border && { ...toBox(border.r0, border.r1, border.c0, border.c1), thick: border.r1 - border.r0, bodyFirst: border.bodyFirst },
    pallu: pallu && { ...toBox(pallu.y, pallu.y + pallu.s, pallu.x, pallu.x + pallu.s), s: pallu.s, sd: pallu.sd, similar: pallu.similar },
    bodyLab: [bodyC.L, bodyC.a, bodyC.b],
  };
}

/**
 * Detect regions on a loaded photo (canvas from loadPhoto) and convert them to FabricPrep regions and options.
 * Returns null when no saree fabric can be found.
 */
export function autoDetect(photo) {
  const s = Math.min(1, SMALL / Math.max(photo.width, photo.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(photo.width * s)); c.height = Math.max(1, Math.round(photo.height * s));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(photo, 0, 0, c.width, c.height);
  const res = analyse(g.getImageData(0, 0, c.width, c.height));
  return toPrep(res, photo.width / c.width, c.width, c.height);
}

/** Convert analyse() output (small rotated-grid pixels) to FabricPrep regions (photo pixels around the centre). */
export function toPrep(res, k, w, h) {
  if (!res.body) return null;
  const D = res.size.D;
  // rotated grid cell -> rotated frame centred on the photo centre, in photo pixels
  const box = (b) => ({ x0: (b.x0 - D / 2) * k, x1: (b.x1 - D / 2) * k, y0: (b.y0 - D / 2) * k, y1: (b.y1 - D / 2) * k });
  // real-world scale: a saree on a mannequin is about 1.4 m tall in the photo; a flat or folded saree
  // usually shows about 1 m along its longest side, a close-up of the fabric about 40 cm.
  // Only an estimate; staff can correct it with Adjust.
  const cmPerPx = (res.draped ? 140 : res.closeUp ? 40 : 100) / res.longSide;
  const clamp = (v, a, b) => Math.round(Math.max(a, Math.min(b, v)) * 2) / 2;
  const angle = res.angleDeg;
  const regions = { body: { box: box(res.body), angle } };
  const opt = {
    bodyCm: clamp(res.body.s * cmPerPx, 10, 60),
    even: true,
    borderCm: 12, borderTurn: 0, borderFlip: false,
    palluCm: 40, palluTurn: 0,
  };
  if (res.border) {
    regions.border = { box: box(res.border), angle };
    opt.borderCm = clamp(res.border.thick * cmPerPx, 3, 25);
    opt.borderTurn = res.turn;
    // tile edge must end up at the bottom: see orient() in prepareTiles (rotate, then flip)
    opt.borderFlip = !res.border.bodyFirst;
  }
  if (res.pallu) {
    regions.pallu = { box: box(res.pallu), angle };
    opt.palluCm = clamp(res.pallu.s * cmPerPx * 1.2, 20, 80);
    opt.palluTurn = res.turn;
  }
  return { regions, opt, skipped: { border: !res.border, pallu: !res.pallu }, debug: res, size: { w, h } };
}
