// Builds a full saree image on the 5.5 m template from a small fabric swatch.
// Layout (image, top to bottom): top border | body | hem border.
// Left to right: the saree length; the last 16% is the pallu.
import { TEMPLATE } from '../config';

const imageCache = new Map();

export function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not load image: ${src}`));
        img.src = src;
      }),
    );
  }
  return imageCache.get(src);
}

function scaledTile(img, widthPx, heightPx) {
  const w = Math.max(1, Math.round(widthPx));
  const h = Math.max(1, Math.round(heightPx ?? (img.height * w) / img.width));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  return c;
}

// Deep, saturated tone derived from the swatch: used when a border colour is 'auto'.
function autoBorderColour(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const g = c.getContext('2d', { willReadFrequently: true }); // CPU canvas: reading it back must not stall the GPU
  g.drawImage(img, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  // weight saturated pixels more so the motif colour wins over the ground
  let r = 0, gg = 0, b = 0, wsum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    const w = 0.15 + (mx - mn) / 255;
    r += d[i] * w; gg += d[i + 1] * w; b += d[i + 2] * w; wsum += w;
  }
  r /= wsum; gg /= wsum; b /= wsum;
  const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  const k = 62 / Math.max(lum, 1); // pull down to a rich, dark tone
  const to = (v) => Math.round(Math.min(255, v * k)).toString(16).padStart(2, '0');
  return `#${to(r)}${to(gg)}${to(b)}`;
}

function zariBand(g, x, y, w, h, zari) {
  g.fillStyle = zari;
  g.fillRect(x, y + h * 0.12, w, Math.max(2, h * 0.05));
  g.fillRect(x, y + h * 0.83, w, Math.max(2, h * 0.05));
  // a row of small diamonds through the middle
  const s = h * 0.16, mid = y + h * 0.475;
  for (let cx = x + s; cx < x + w; cx += s * 2.6) {
    g.beginPath();
    g.moveTo(cx, mid - s); g.lineTo(cx + s * 0.7, mid); g.lineTo(cx, mid + s); g.lineTo(cx - s * 0.7, mid);
    g.closePath(); g.fill();
  }
}

/**
 * @param {object} swatch   catalogue swatch spec
 * @param {number} width    output width in px (4096 desktop, 2048 low-end)
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function composeSaree(swatch, width = 4096) {
  const W = width;
  const H = Math.round(W / TEMPLATE.aspect);
  const pxPerM = W / TEMPLATE.lengthM;
  const cm = (v) => (v / 100) * pxPerM;

  const bodyImg = await loadImage(swatch.body.src);
  const borderImg = swatch.border?.src ? await loadImage(swatch.border.src) : null;
  const palluImg = swatch.pallu?.src ? await loadImage(swatch.pallu.src) : null;

  const needAuto = !swatch.border?.color || swatch.border.color === 'auto';
  const borderColour = needAuto ? autoBorderColour(bodyImg) : swatch.border.color;
  const palluColour = !swatch.pallu?.color || swatch.pallu.color === 'auto' ? borderColour : swatch.pallu.color;
  const zari = swatch.border?.zari ?? '#cfa957';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';

  // 1. body: repeating tile at true scale
  const bodyTile = scaledTile(bodyImg, cm(swatch.body.tileCm));
  g.fillStyle = g.createPattern(bodyTile, 'repeat');
  g.fillRect(0, 0, W, H);

  // 2. pallu zone
  const x0 = Math.round(TEMPLATE.palluStartU * W);
  g.fillStyle = palluColour;
  g.fillRect(x0, 0, W - x0, H);
  const pTileSrc = palluImg ?? bodyImg;
  const pTile = scaledTile(pTileSrc, cm(swatch.pallu?.tileCm ?? swatch.body.tileCm * 1.6));
  const pPat = g.createPattern(pTile, 'repeat');
  pPat.setTransform(new DOMMatrix().translate(x0, 0));
  g.save();
  g.globalAlpha = swatch.pallu?.opacity ?? 0.5;
  g.fillStyle = pPat;
  g.fillRect(x0, 0, W - x0, H);
  g.restore();
  // zari stripes where the pallu begins and at the very end
  g.fillStyle = zari;
  for (const [off, w] of [[0, 1.6], [2.6, 0.5], [4.0, 3.2], [8.0, 0.5]]) g.fillRect(x0 + cm(off), 0, cm(w), H);
  for (const [off, w] of [[3.0, 2.2], [6.0, 0.5]]) g.fillRect(W - cm(off) - cm(w), 0, cm(w), H);

  // 3. borders along both long edges (hem at the bottom of the image)
  const bh = Math.round(cm(swatch.border?.heightCm ?? 11));
  const drawBand = (y, flip) => {
    g.save();
    if (flip) { g.translate(0, y + bh); g.scale(1, -1); } else { g.translate(0, y); }
    g.fillStyle = borderColour;
    g.fillRect(0, 0, W, bh);
    if (borderImg) {
      const t = scaledTile(borderImg, (borderImg.width * bh) / borderImg.height, bh);
      g.fillStyle = g.createPattern(t, 'repeat-x');
      g.fillRect(0, 0, W, bh);
    } else {
      zariBand(g, 0, 0, W, bh, zari);
    }
    // zari line on the inner edge of the border
    g.fillStyle = zari;
    g.fillRect(0, 0, W, Math.max(2, bh * 0.035));
    g.restore();
  };
  drawBand(H - bh, false); // hem border: outer edge at the bottom
  drawBand(0, true);       // top border: mirrored, outer edge at the top

  return canvas;
}
