// Sarees prepared by staff, kept on this device (IndexedDB). Survives reloads and offline use.
const DB = 'saree-showroom', STORE = 'prepared', VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

/** record: { id, name, blouse, body:{blob,tileCm}, border?:{blob,heightCm}|null, pallu?:{blob,tileCm}|null, savedAt } */
export const saveSaree = (record) => tx('readwrite', (s) => s.put(record));
export const deleteSaree = (id) => tx('readwrite', (s) => s.delete(id));
export async function listSarees() {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.savedAt - a.savedAt));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return []; // private mode or storage blocked: the feature still works for this visit
  }
}
