import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModelViewer from './components/ModelViewer';
import { VIEWS } from './components/views';
import ProductPanel from './components/ProductPanel';
import CollectionPanel from './components/CollectionPanel';
import StageControls from './components/StageControls';
import { CATALOG, sareeFromUpload } from './data/catalog';
import { SHOWROOM } from './config';
import { releaseSaree, warmCollection } from './lib/sareeTextures';
import { QA, QAOverlay } from './components/QAProbe';

const params = new URLSearchParams(window.location.search);
const KIOSK = params.has('kiosk');
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
  const lastInput = useRef(0);

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
      if (KIOSK && idle > SHOWROOM.attractAfterMs) setAttract(true);
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
      if (e.target instanceof HTMLInputElement) return;
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

  // ---- customer fabric photos ----
  const handleUpload = (file, message) => {
    setUploadError(message ?? null);
    if (!file) return;
    const saree = sareeFromUpload(URL.createObjectURL(file));
    setUploads((prev) => {
      const next = [saree, ...prev];
      next.slice(3).forEach(releaseSaree); // keep the last three
      return next.slice(0, 3);
    });
    select(saree);
  };

  const handleError = useCallback(
    (err) => {
      console.error(err);
      if (item.isUpload) {
        setUploadError('That photo could not be read. Try a JPG or PNG taken in good light.');
        setUploads((prev) => prev.filter((u) => u.id !== item.id));
        releaseSaree(item);
        setItem(CATALOG[0]);
      } else {
        setError(`${item.name} could not be shown. Choose another saree from the collection.`);
      }
    },
    [item],
  );

  return (
    <div className={`app ${KIOSK ? 'is-kiosk' : ''}`}>
      <div className="stage">
        <ModelViewer
          item={item}
          view={view}
          viewNonce={viewNonce}
          autoRotate={userRotate || idleRotate}
          onUserInteract={markInput}
          onDraping={setDraping}
          onError={handleError}
        />
      </div>

      <header className="brand">
        <img src="/logo.webp" alt="" width="44" height="66" />
        <span>{SHOWROOM.storeName}</span>
      </header>

      <aside className="left">
        <ProductPanel key={item.id} item={item} draping={draping} index={index} total={CATALOG.length} />
      </aside>

      <aside className="right">
        <CollectionPanel
          items={items}
          uploads={uploads}
          activeId={item.id}
          family={family}
          onFamily={setFamily}
          onSelect={select}
          onUpload={handleUpload}
          allowUpload={!KIOSK}
          uploadError={uploadError}
        />
      </aside>

      <StageControls
        view={view}
        onView={goView}
        rotating={userRotate || idleRotate}
        onToggleRotate={() => { setIdleRotate(false); setUserRotate((r) => !(r || idleRotate)); }}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        fullscreen={fullscreen}
        onToggleFullscreen={canFullscreen ? toggleFullscreen : null}
      />

      {QA && <QAOverlay />}

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
