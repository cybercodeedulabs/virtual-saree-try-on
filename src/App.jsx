import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModelViewer from './components/ModelViewer';
import { VIEWS } from './components/views';
import ProductPanel from './components/ProductPanel';
import CollectionPanel from './components/CollectionPanel';
import StageControls from './components/StageControls';
import { CATALOG, sareeFromPrepared } from './data/catalog';
import FabricPrep from './components/FabricPrep';
import { deleteSaree, listSarees, saveSaree } from './lib/savedSarees';
import { blouseSuggestions, buildRecord, loadPhoto, makeTiles } from './lib/prepareTiles';
import { autoDetect } from './lib/autoDetect';
import { SHOWROOM } from './config';
import { releaseSaree, warmCollection } from './lib/sareeTextures';
import { QA, QAOverlay } from './components/QAProbe';

const params = new URLSearchParams(window.location.search);
const KIOSK = params.has('kiosk');
const STAFF = params.has('staff');            // ?kiosk=1&staff=1 shows saree preparation on the kiosk
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;
const VIEW_KEYS = Object.keys(VIEWS);

export default function App() {
  const [family, setFamily] = useState('All');
  const [item, setItem] = useState(CATALOG[0]);
  const [uploads, setUploads] = useState([]);
  const [view, setView] = useState('front');
  const [viewNonce, setViewNonce] = useState(0);
  const [userRotate, setUserRotate] = useState(!reducedMotion);
  const [idleRotate, setIdleRotate] = useState(false);
  const [attract, setAttract] = useState(false);
  const [draping, setDraping] = useState(false);
  const [error, setError] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [prepFile, setPrepFile] = useState(null);
  const [prepInit, setPrepInit] = useState(null);   // automatic result handed to the manual screen (Adjust)
  const [reading, setReading] = useState(false);    // detecting the saree in a photo
  const [autoInfo, setAutoInfo] = useState(null);   // last automatic drape: what was found, for Adjust / Save
  const [saved, setSaved] = useState([]);
  const lastInput = useRef(0);
  const prepOpen = useRef(false);
  useEffect(() => { prepOpen.current = Boolean(prepFile); }, [prepFile]);

  const items = useMemo(
    () => (family === 'All' ? CATALOG : CATALOG.filter((s) => s.family === family)),
    [family],
  );
  const index = CATALOG.findIndex((s) => s.id === item.id);

  const goView = useCallback((v) => {
    setView(v);
    setViewNonce((n) => n + 1); // re-applies the same view after the user has moved the camera
  }, []);

  const select = useCallback((s) => {
    setError(null);
    setItem(s);
  }, []);

  const step = useCallback(
    (dir) => {
      const list = items.length ? items : CATALOG;
      const i = list.findIndex((s) => s.id === item.id);
      select(list[(i + dir + list.length) % list.length]);
    },
    [items, item.id, select],
  );

  // ---- inactivity: start turning, then (kiosk) cycle through the collection ----
  const markInput = useCallback(() => {
    lastInput.current = performance.now();
    setIdleRotate(false);
    setAttract(false);
  }, []);

  useEffect(() => {
    lastInput.current = performance.now();
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, markInput, { passive: true }));
    const t = setInterval(() => {
      const idle = performance.now() - lastInput.current;
      if (!reducedMotion && idle > SHOWROOM.idleRotateAfterMs) setIdleRotate(true);
      if (KIOSK && !prepOpen.current && idle > SHOWROOM.attractAfterMs) setAttract(true);
    }, 1000);
    return () => {
      clearInterval(t);
      events.forEach((e) => window.removeEventListener(e, markInput));
    };
  }, [markInput]);

  useEffect(() => {
    if (!attract) return;
    setFamily('All');
    goView('front');
    const t = setInterval(() => {
      setItem((cur) => CATALOG[(CATALOG.findIndex((s) => s.id === cur.id) + 1) % CATALOG.length]);
    }, SHOWROOM.attractCycleMs);
    return () => clearInterval(t);
  }, [attract, goView]);

  // build every saree in the background so switching is instant on the floor
  useEffect(() => {
    const t = setTimeout(() => warmCollection(CATALOG), 1500);
    return () => clearTimeout(t);
  }, []);

  // ---- keyboard: arrows change saree, 1-5 change view ----
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || prepOpen.current) return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (/^[1-5]$/.test(e.key)) goView(VIEW_KEYS[+e.key - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, goView]);

  // ---- acceptance tests (?qa=1 only) ----
  useEffect(() => {
    if (QA) window.__qa = Object.assign(window.__qa ?? {}, { select, catalog: CATALOG, goView });
  }, [select, goView]);

  // ---- kiosk hardening ----
  useEffect(() => {
    if (!KIOSK) return;
    const block = (e) => e.preventDefault();
    window.addEventListener('contextmenu', block);
    return () => window.removeEventListener('contextmenu', block);
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // ---- sarees prepared from photos ----
  useEffect(() => {
    let live = true;
    listSarees().then((recs) => live && setSaved(recs.map((r) => sareeFromPrepared(r, { saved: true }))));
    return () => { live = false; };
  }, []);

  // A photo is draped straight away: body, border and pallu are found automatically.
  // The manual screen (Adjust) is only needed when the result is not right.
  const handleUpload = async (file, message) => {
    setUploadError(message ?? null);
    if (!file) return;
    setAutoInfo(null);
    setReading(true);
    try {
      const photo = await loadPhoto(file);
      await new Promise((r) => setTimeout(r, 30));            // let "Reading your photo" paint first
      const det = autoDetect(photo);
      if (QA) window.__qaDetect = det;
      const name = nameFromFile(file);
      if (!det) {
        setUploadError('The saree could not be found in that photo automatically. Mark it on the photo instead.');
        setPrepInit(null);
        setPrepFile(file);
        return;
      }
      const tiles = makeTiles(photo, det.regions, det.opt, det.skipped);
      const blouse = blouseSuggestions(tiles)[0];
      const record = await buildRecord({ tiles, opt: det.opt, name, blouse });
      await applyPrepared(record, { save: false });
      setAutoInfo({ file, det, name, blouse, record, border: Boolean(tiles.border), pallu: Boolean(tiles.pallu) });
    } catch (err) {
      console.error(err);
      setUploadError('That photo could not be opened. Try a JPG or PNG.');
    } finally {
      setReading(false);
    }
  };

  const adjustAuto = () => {
    if (!autoInfo) return;
    setPrepInit({ initial: autoInfo.det, name: autoInfo.name, blouse: autoInfo.blouse });
    setPrepFile(autoInfo.file);
    setAutoInfo(null);
  };

  const saveAuto = async () => {
    if (!autoInfo) return;
    const { record } = autoInfo;
    setAutoInfo(null);
    try {
      await saveSaree(record);
      const saree = sareeFromPrepared(record, { saved: true });
      setUploads((prev) => prev.filter((u) => u.id !== record.id));
      setSaved((prev) => [saree, ...prev]);
      select(saree);
    } catch {
      setUploadError('This device would not allow saving. The saree is shown for this visit only.');
    }
  };

  const applyPrepared = async (record, { save }) => {
    setPrepFile(null);
    setPrepInit(null);
    let saree;
    if (save) {
      try {
        await saveSaree(record);
        saree = sareeFromPrepared(record, { saved: true });
        setSaved((prev) => [saree, ...prev]);
      } catch {
        setUploadError('This device would not allow saving. The saree is shown for this visit only.');
      }
    }
    if (!saree) {
      saree = sareeFromPrepared(record);
      setUploads((prev) => {
        const next = [saree, ...prev];
        next.slice(3).forEach(releaseSaree); // keep the last three
        return next.slice(0, 3);
      });
    }
    select(saree);
  };

  const removeSaved = async (s) => {
    await deleteSaree(s.id).catch(() => {});
    setSaved((prev) => prev.filter((x) => x.id !== s.id));
    if (item.id === s.id) setItem(CATALOG[0]);
    releaseSaree(s);
  };

  const handleError = useCallback(
    (err) => {
      console.error(err);
      if (item.isUpload || item.isSaved) {
        setUploadError('That saree could not be shown. Prepare it again from the photo.');
        setUploads((prev) => prev.filter((u) => u.id !== item.id));
        setItem(CATALOG[0]);
      } else {
        setError(`${item.name} could not be shown. Choose another saree from the collection.`);
      }
    },
    [item],
  );

  return (
    <div className={`app ${KIOSK ? 'is-kiosk' : ''}`}>
      <div className="stage" inert={Boolean(prepFile)}>
        <ModelViewer
          item={item}
          view={view}
          viewNonce={viewNonce}
          autoRotate={userRotate || idleRotate}
          paused={Boolean(prepFile)}
          onUserInteract={markInput}
          onDraping={setDraping}
          onError={handleError}
        />
      </div>

      <header className="brand" inert={Boolean(prepFile)}>
        <img src="/logo.webp" alt="" width="44" height="66" />
        <span>{SHOWROOM.storeName}</span>
      </header>

      <aside className="left" inert={Boolean(prepFile)}>
        <ProductPanel key={item.id} item={item} draping={draping} index={index} total={CATALOG.length} />
      </aside>

      <aside className="right" inert={Boolean(prepFile)}>
        <CollectionPanel
          items={items}
          uploads={[...uploads, ...saved]}
          onRemoveSaved={removeSaved}
          activeId={item.id}
          family={family}
          onFamily={setFamily}
          onSelect={select}
          onUpload={handleUpload}
          allowUpload={!KIOSK || STAFF}
          uploadError={uploadError}
        />
      </aside>

      <StageControls
        inert={Boolean(prepFile)}
        view={view}
        onView={goView}
        rotating={userRotate || idleRotate}
        onToggleRotate={() => { setIdleRotate(false); setUserRotate((r) => !(r || idleRotate)); }}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        fullscreen={fullscreen}
        onToggleFullscreen={canFullscreen ? toggleFullscreen : null}
      />

      {prepFile && (
        <FabricPrep
          file={prepFile}
          initial={prepInit?.initial}
          initialName={prepInit?.name}
          initialBlouse={prepInit?.blouse}
          onClose={() => { setPrepFile(null); setPrepInit(null); }}
          onApply={applyPrepared}
          canSave
        />
      )}

      {QA && <QAOverlay />}

      {reading && (
        <div className="toast" role="status">
          <span>Reading your photo: finding the body, border and pallu</span>
        </div>
      )}

      {autoInfo && !reading && !prepFile && (
        <div className="toast toast-auto" role="status">
          <span>
            Draped from your photo.
            {!autoInfo.border && ' No border found: a matching plain border is used.'}
            {!autoInfo.pallu && ' No separate pallu found: the body fabric is used for the pallu.'}
          </span>
          <button type="button" onClick={saveAuto}>Save</button>
          <button type="button" onClick={adjustAuto}>Adjust</button>
          <button type="button" onClick={() => setAutoInfo(null)} aria-label="Close">Close</button>
        </div>
      )}

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

// "IMG_2041.jpg" -> "Saree from photo"; "kanchi-pink-silk.webp" -> "Kanchi pink silk"
function nameFromFile(file) {
  const base = (file?.name ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
  if (!base || /^(img|dsc|pxl|image|photo|whatsapp|screenshot)\b/i.test(base) || /^\d/.test(base) || base.length > 40) return 'Saree from photo';
  return base.charAt(0).toUpperCase() + base.slice(1);
}
