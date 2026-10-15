import { useRef } from 'react';
import { FAMILIES } from '../data/catalog';

const MAX_UPLOAD_MB = 15;

export default function CollectionPanel({ items, uploads, activeId, family, onFamily, onSelect, onUpload, onRemoveSaved, allowUpload, uploadError }) {
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return onUpload(null, 'Choose a photo file (JPG, PNG or WebP).');
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return onUpload(null, `That photo is over ${MAX_UPLOAD_MB} MB. Choose a smaller one.`);
    onUpload(file);
  };

  return (
    <section className="collection" aria-label="Collection">
      <div className="collection-head">
        <h2>Collection</h2>
        <div className="families" role="group" aria-label="Filter by colour">
          {FAMILIES.map((f) => (
            <button key={f} type="button" className="pill" aria-pressed={family === f} onClick={() => onFamily(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <ul className="chips">
        {[...uploads, ...items].map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="chip"
              aria-pressed={activeId === s.id}
              onClick={() => onSelect(s)}
              title={s.name}
            >
              <img src={s.chip} alt="" loading="lazy" draggable="false" />
              <span className="chip-name">{s.name}</span>
              <span className="chip-fabric">{s.fabric}</span>
            </button>
            {s.isSaved && allowUpload && (
              <button type="button" className="chip-remove" onClick={() => onRemoveSaved(s)}>Remove</button>
            )}
          </li>
        ))}
        {items.length === 0 && uploads.length === 0 && <li className="empty">No sarees in this colour yet. Choose All to see the full collection.</li>}
      </ul>

      {allowUpload && (
        <div className="upload">
          <button type="button" className="upload-btn" onClick={() => fileRef.current?.click()}>
            Try a saree from a photo
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFile} />
          <p className="upload-hint">The saree is draped straight away: body, border and pallu are found automatically. Product photos and phone pictures both work.</p>
          {uploadError && <p className="upload-error" role="alert">{uploadError}</p>}
        </div>
      )}
    </section>
  );
}
