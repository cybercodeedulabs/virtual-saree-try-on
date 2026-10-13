import * as THREE from 'three';
import { composeSaree, loadImage } from './composeSaree';

// Saree textures are expensive to build, so each one is made once and reused.
const cache = new Map();

let settings = { width: 4096, anisotropy: 8 };

/** Call once with the renderer so textures match the device. */
export function configureTextures(gl) {
  const maxSize = gl.capabilities.maxTextureSize;
  const lowEnd =
    maxSize < 4096 ||
    (typeof navigator !== 'undefined' && (navigator.deviceMemory ?? 8) <= 4) ||
    (typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches);
  settings = {
    width: lowEnd ? 2048 : 4096,
    anisotropy: Math.min(8, gl.capabilities.getMaxAnisotropy()),
  };
}

function finish(tex) {
  tex.flipY = false;                       // glTF UV convention
  tex.colorSpace = THREE.SRGBColorSpace;   // replaces the removed sRGBEncoding
  tex.anisotropy = settings.anisotropy;    // keeps borders sharp at grazing angles
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

async function build(item) {
  if (item.template) {
    const img = await loadImage(item.template);
    return finish(new THREE.Texture(img));
  }
  const canvas = await composeSaree(item.swatch, settings.width);
  return finish(new THREE.CanvasTexture(canvas));
}

export function getSareeTexture(item) {
  if (!cache.has(item.id)) {
    const p = build(item).catch((err) => {
      cache.delete(item.id); // allow a retry
      throw err;
    });
    cache.set(item.id, p);
  }
  return cache.get(item.id);
}

/** Build the rest of the collection in the background so switching is instant. */
export function warmCollection(items) {
  const queue = [...items];
  const next = () => {
    const item = queue.shift();
    if (!item) return;
    getSareeTexture(item).catch(() => {}).finally(() => {
      const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 120));
      idle(next);
    });
  };
  next();
}

/** Free a customer upload once it is no longer on the mannequin. */
export async function releaseSaree(item) {
  if (!item?.isUpload || !cache.has(item.id)) return;
  const p = cache.get(item.id);
  cache.delete(item.id);
  try { (await p).dispose(); } catch { /* already gone */ }
  if (item.chip?.startsWith('blob:')) URL.revokeObjectURL(item.chip);
}
