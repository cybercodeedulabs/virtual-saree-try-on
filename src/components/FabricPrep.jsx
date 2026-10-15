// Prepare a saree from a product photo: mark body, border and pallu, then try it on.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { blouseSuggestions, buildRecord as makeRecord, loadPhoto, makeCanvas, makeTiles } from '../lib/prepareTiles';

const STEPS = [
  { key: 'body', label: 'Body fabric', required: true,
    tip: 'Drag a box over plain body fabric. Include a few motifs, avoid folds, shadows and the background.' },
  { key: 'border', label: 'Border',
    tip: 'Drag a box along a straight run of the border, from the body fabric to the saree edge.' },
  { key: 'pallu', label: 'Pallu',
    tip: 'Drag a box inside the pallu design, away from the tassels and the background.' },
  { key: 'finish', label: 'Blouse and finish' },
];
const COLOURS = { body: '#f1e8d8', border: '#cfa957', pallu: '#e58bb0' };
const MIN_PX = 40;

// initial: optional result of autoDetect ({ regions, opt, skipped }) so everything starts already marked
export default function FabricPrep({ file, initial, initialName, initialBlouse, onClose, onApply, canSave }) {
  const [photo, setPhoto] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [angle, setAngle] = useState(initial?.regions?.body?.angle ?? 0); // degrees, shared starting point for every step
  const [regions, setRegions] = useState(initial?.regions ?? {}); // key -> { box (centred photo px), angle }
  const [skipped, setSkipped] = useState(initial?.skipped ?? {});
  const [opt, setOpt] = useState({ bodyCm: 30, even: true, borderCm: 12, borderFlip: false, palluCm: 40, palluTurn: 0, ...initial?.opt });
  const [blouse, setBlouse] = useState(initialBlouse ?? null);
  const [name, setName] = useState(initialName ?? 'Saree from photo');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const stageRef = useRef(null), canvasRef = useRef(null), viewRef = useRef(null), drag = useRef(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const step = STEPS[stepIdx];

  useEffect(() => {
    let live = true;
    loadPhoto(file).then((c) => live && setPhoto(c)).catch(() => live && setLoadError('That photo could not be opened. Try a JPG or PNG.'));
    return () => { live = false; };
  }, [file]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // when moving to a step that already has a region, show its own straightening
  useEffect(() => {
    const r = regions[step.key];
    if (r) setAngle(r.angle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  // ---------- draw photo + marked boxes ----------
  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !photo) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr; c.height = size.h * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    const rad = (angle * Math.PI) / 180;
    // fit the rotated photo
    const bw = Math.abs(photo.width * Math.cos(rad)) + Math.abs(photo.height * Math.sin(rad));
    const bh = Math.abs(photo.width * Math.sin(rad)) + Math.abs(photo.height * Math.cos(rad));
    const scale = Math.min(size.w / bw, size.h / bh) * 0.96;
    viewRef.current = { cw: size.w, ch: size.h, scale, angle: rad };
    g.save();
    g.translate(size.w / 2, size.h / 2); g.rotate(rad); g.scale(scale, scale);
    g.drawImage(photo, -photo.width / 2, -photo.height / 2);
    g.restore();
    const toScreen = (b) => ({ x: size.w / 2 + b.x0 * scale, y: size.h / 2 + b.y0 * scale, w: (b.x1 - b.x0) * scale, h: (b.y1 - b.y0) * scale });
    const active = drag.current?.box ?? regions[step.key]?.box;
    if (active && step.key !== 'finish') {
      const s = toScreen(norm(active));
      g.fillStyle = 'rgba(15,8,18,0.55)';
      g.fillRect(0, 0, size.w, s.y); g.fillRect(0, s.y + s.h, size.w, size.h - s.y - s.h);
      g.fillRect(0, s.y, s.x, s.h); g.fillRect(s.x + s.w, s.y, size.w - s.x - s.w, s.h);
    }
    // other marked regions (only those drawn at the same straightening are exact)
    for (const k of ['body', 'border', 'pallu']) {
      const r = k === step.key ? (drag.current ? { box: drag.current.box } : regions[k]) : regions[k];
      if (!r || (k !== step.key && Math.abs(r.angle - angle) > 0.01)) continue;
      const s = toScreen(norm(r.box));
      g.strokeStyle = COLOURS[k]; g.lineWidth = k === step.key ? 2.5 : 1.5;
      g.setLineDash(k === step.key ? [] : [6, 5]);
      g.strokeRect(s.x, s.y, s.w, s.h);
      g.setLineDash([]);
      g.fillStyle = COLOURS[k]; g.font = '600 13px Mukta, sans-serif';
      g.fillText(STEPS.find((x) => x.key === k).label, s.x + 6, s.y - 6 < 12 ? s.y + 16 : s.y - 6);
    }
  }, [photo, size, angle, regions, step.key]);
  useEffect(draw, [draw]);

  // ---------- pointer: draw a box (mouse, pen or finger) ----------
  const toPhoto = (e) => {
    const r = canvasRef.current.getBoundingClientRect(), v = viewRef.current;
    return { x: (e.clientX - r.left - v.cw / 2) / v.scale, y: (e.clientY - r.top - v.ch / 2) / v.scale };
  };
  const onDown = (e) => {
    if (step.key === 'finish' || !photo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPhoto(e);
    drag.current = { box: { x0: p.x, y0: p.y, x1: p.x, y1: p.y } };
    setNote(null);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const p = toPhoto(e);
    drag.current.box = { ...drag.current.box, x1: p.x, y1: p.y };
    draw();
  };
  const onUp = () => {
    if (!drag.current) return;
    const box = norm(drag.current.box);
    drag.current = null;
    if (box.x1 - box.x0 < MIN_PX || box.y1 - box.y0 < MIN_PX) { setNote('Draw a larger box.'); draw(); return; }
    setRegions((r) => ({ ...r, [step.key]: { box, angle } }));
    setSkipped((s) => ({ ...s, [step.key]: false }));
    // border length should run left to right in the tile: tall boxes get turned
    if (step.key === 'border') setOpt((o) => ({ ...o, borderTurn: box.y1 - box.y0 > box.x1 - box.x0 ? 1 : 0 }));
  };

  // ---------- tiles ----------
  const tiles = useMemo(() => makeTiles(photo, regions, opt, skipped), [photo, regions, opt, skipped]);
  const suggestions = useMemo(() => blouseSuggestions(tiles), [tiles]);
  const blouseColour = blouse ?? suggestions[0] ?? '#3b2a3f';

  // ---------- previews ----------
  const preview = useMemo(() => {
    const k = step.key;
    const src = tiles[k];
    if (!src) return null;
    const W = 320;
    if (k === 'body') {                                   // 2 x 2 repeat shows any seam
      const c = makeCanvas(W, W), g = c.getContext('2d'), s = W / 2;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.drawImage(src, x * s, y * s, s, s);
      return c.toDataURL('image/jpeg', 0.85);
    }
    const h = Math.round((src.height / src.width) * (W / 2));
    const c = makeCanvas(W, Math.max(40, h)), g = c.getContext('2d');
    g.drawImage(src, 0, 0, W / 2, c.height); g.drawImage(src, W / 2, 0, W / 2, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }, [tiles, step.key]);

  // ---------- finish ----------
  const buildRecord = () => makeRecord({ tiles, opt, name, blouse: blouseColour });

  const finish = async (mode) => {
    if (!tiles.body) { setStepIdx(0); setNote('Mark the body fabric first.'); return; }
    setBusy(true);
    try {
      const rec = await buildRecord();
      if (mode === 'download') await downloadForCatalogue(rec);
      else onApply(rec, { save: mode === 'save' });
    } finally {
      setBusy(false);
    }
  };

  const canNext = step.key === 'body' ? Boolean(regions.body) : true;
  const next = () => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  const skip = () => { setSkipped((s) => ({ ...s, [step.key]: true })); next(); };

  const status = (s) => {
    if (s.key === 'finish') return '';
    if (regions[s.key] && !skipped[s.key]) return 'Marked';
    if (skipped[s.key]) return 'Skipped';
    return s.required ? 'Required' : 'Optional';
  };

  return (
    <div className="prep" role="dialog" aria-modal="true" aria-label="Prepare a saree from a photo">
      <div className="prep-stage" ref={stageRef}>
        {!photo && !loadError && <p className="prep-wait">Opening photo</p>}
        {loadError && <p className="prep-wait">{loadError}</p>}
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Saree photo. Drag to mark a region."
        />
      </div>

      <div className="prep-panel">
        <div className="prep-head">
          <h2>Prepare saree from photo</h2>
          <button type="button" className="prep-close" onClick={onClose}>Cancel</button>
        </div>

        <ol className="prep-steps">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <button type="button" aria-current={i === stepIdx ? 'step' : undefined} onClick={() => setStepIdx(i)} disabled={i > 0 && !regions.body}>
                <span>{s.label}</span><em>{status(s)}</em>
              </button>
            </li>
          ))}
        </ol>

        {step.key !== 'finish' ? (
          <div className="prep-body">
            <p className="prep-tip">{step.tip}</p>
            <label className="prep-field">
              <span>Straighten photo <output>{angle}°</output></span>
              <input type="range" min="-30" max="30" step="0.5" value={angle} onChange={(e) => setAngle(+e.target.value)} />
            </label>

            {step.key === 'body' && (
              <label className="prep-field">
                <span>Size of one repeat on the saree <output>{opt.bodyCm} cm</output></span>
                <input type="range" min="8" max="80" value={opt.bodyCm} onChange={(e) => setOpt({ ...opt, bodyCm: +e.target.value })} />
              </label>
            )}
            {step.key === 'border' && (
              <>
                <label className="prep-field">
                  <span>Border width <output>{opt.borderCm} cm</output></span>
                  <input type="range" min="3" max="30" step="0.5" value={opt.borderCm} onChange={(e) => setOpt({ ...opt, borderCm: +e.target.value })} />
                </label>
                <button type="button" className="prep-btn" disabled={!regions.border} onClick={() => setOpt({ ...opt, borderFlip: !opt.borderFlip })}>
                  Flip so the saree edge is at the bottom
                </button>
              </>
            )}
            {step.key === 'pallu' && (
              <>
                <label className="prep-field">
                  <span>Size of the pallu pattern <output>{opt.palluCm} cm</output></span>
                  <input type="range" min="10" max="90" value={opt.palluCm} onChange={(e) => setOpt({ ...opt, palluCm: +e.target.value })} />
                </label>
                <button type="button" className="prep-btn" disabled={!regions.pallu} onClick={() => setOpt({ ...opt, palluTurn: (opt.palluTurn + 1) % 4 })}>
                  Turn pattern 90°
                </button>
              </>
            )}
            {step.key !== 'border' && (
              <label className="prep-check">
                <input type="checkbox" checked={opt.even} onChange={(e) => setOpt({ ...opt, even: e.target.checked })} />
                Even out light and shadow
              </label>
            )}

            {preview && (
              <figure className="prep-preview">
                <img src={preview} alt="" />
                <figcaption>
                  {step.key === 'body' && 'Repeated 2 × 2. If you see dark patches, seams or background, draw the box again further inside the fabric.'}
                  {step.key === 'border' && 'The saree edge should be along the bottom.'}
                  {step.key === 'pallu' && 'Pallu pattern as it will repeat.'}
                </figcaption>
              </figure>
            )}
            {note && <p className="upload-error" role="alert">{note}</p>}

            <div className="prep-nav">
              {stepIdx > 0 && <button type="button" className="prep-btn" onClick={() => setStepIdx(stepIdx - 1)}>Back</button>}
              {!step.required && <button type="button" className="prep-btn" onClick={skip}>Skip</button>}
              <button type="button" className="prep-btn is-primary" disabled={!canNext} onClick={next}>Next</button>
            </div>
          </div>
        ) : (
          <div className="prep-body">
            <label className="prep-field">
              <span>Name</span>
              <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="prep-field">
              <span>Blouse colour</span>
              <div className="prep-swatches" role="group" aria-label="Blouse colour">
                {suggestions.map((c) => (
                  <button key={c} type="button" style={{ background: c }} aria-pressed={blouseColour === c} aria-label={c} onClick={() => setBlouse(c)} />
                ))}
                <label className="prep-custom" title="Any colour">
                  <input type="color" value={blouseColour} onChange={(e) => setBlouse(e.target.value)} />
                </label>
              </div>
            </div>
            {!regions.border || skipped.border ? <p className="prep-tip">No border marked: a plain border in a matching colour will be used.</p> : null}
            {!regions.pallu || skipped.pallu ? <p className="prep-tip">No pallu marked: the body fabric will be used for the pallu.</p> : null}
            <div className="prep-nav is-stacked">
              <button type="button" className="prep-btn is-primary" disabled={busy} onClick={() => finish('try')}>Try on mannequin</button>
              {canSave && <button type="button" className="prep-btn" disabled={busy} onClick={() => finish('save')}>Save to this device</button>}
              {canSave && <button type="button" className="prep-btn" disabled={busy} onClick={() => finish('download')}>Download for catalogue</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function norm(b) {
  return { x0: Math.min(b.x0, b.x1), y0: Math.min(b.y0, b.y1), x1: Math.max(b.x0, b.x1), y1: Math.max(b.y0, b.y1) };
}

// Files a developer adds to public/catalog/<id>/, plus the matching catalog.js entry.
async function downloadForCatalogue(rec) {
  const slug = rec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'saree';
  const files = [['body.jpg', rec.body.blob], ['chip.jpg', rec.chip]];
  if (rec.border) files.push(['border.jpg', rec.border.blob]);
  if (rec.pallu) files.push(['pallu.jpg', rec.pallu.blob]);
  const p = `/catalog/${slug}`;
  const entry = `  {
    id: '${slug}',
    name: '${rec.name.replace(/'/g, "\\'")}',
    fabric: '',
    colour: '',
    family: '',
    code: null,
    price: null,
    blouse: '${rec.blouse}',
    chip: '${p}/chip.jpg',
    swatch: {
      body: { src: '${p}/body.jpg', tileCm: ${rec.body.tileCm} },
      border: ${rec.border ? `{ src: '${p}/border.jpg', color: '${rec.border.color}', zari: '#cfa957', heightCm: ${rec.border.heightCm} }` : `{ color: 'auto', zari: '#cfa957', heightCm: 11 }`},
      pallu: ${rec.pallu ? `{ src: '${p}/pallu.jpg', tileCm: ${rec.pallu.tileCm}, color: '${rec.pallu.color}', opacity: 1 }` : `{ tileCm: ${rec.body.tileCm * 1.5}, color: 'auto', opacity: 0.5 }`},
    },
  },
`;
  files.push([`${slug}-catalog-entry.txt`, new Blob([`Copy the images to public/catalog/${slug}/ and paste this into CATALOG in src/data/catalog.js:\n\n${entry}`], { type: 'text/plain' })]);
  for (const [fname, blob] of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname.endsWith('.txt') ? fname : `${slug}-${fname}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    await new Promise((r) => setTimeout(r, 350));
  }
}
