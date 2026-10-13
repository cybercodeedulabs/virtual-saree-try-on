// Showroom-wide settings. Change these instead of editing components.
export const SHOWROOM = {
  storeName: 'Virtual Saree Try-On',
  // Shown under the product name. Set to null to hide prices everywhere.
  currency: '₹',
  // Kiosk behaviour (also forced on with ?kiosk=1 in the URL)
  idleRotateAfterMs: 20_000,   // start turning the mannequin after this much inactivity
  attractAfterMs: 75_000,      // then start cycling through the collection
  attractCycleMs: 9_000,       // time each saree stays on the mannequin in attract mode
};

// On-site tuning without a rebuild, in seconds: ?kiosk=1&idle=20&attract=75&cycle=9
{
  const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const sec = (k) => (q.has(k) && Number(q.get(k)) > 0 ? Number(q.get(k)) * 1000 : null);
  SHOWROOM.idleRotateAfterMs = sec('idle') ?? SHOWROOM.idleRotateAfterMs;
  SHOWROOM.attractAfterMs = sec('attract') ?? SHOWROOM.attractAfterMs;
  SHOWROOM.attractCycleMs = sec('cycle') ?? SHOWROOM.attractCycleMs;
}

export const MODEL_URL = '/models/saree_showroom.glb';

// The saree UV template (see docs/saree_uv_layout_guide.png).
// One image = the full 5.5 m x 1.15 m length of fabric.
export const TEMPLATE = {
  lengthM: 5.5,
  widthM: 1.15,
  palluStartU: 0.84, // pallu design zone: last 16% of the length (hangs down the back)
  aspect: 4096 / 856,
};
