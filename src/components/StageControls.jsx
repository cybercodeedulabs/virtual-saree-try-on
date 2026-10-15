import { VIEWS } from './views';

export default function StageControls({ inert, view, onView, rotating, onToggleRotate, onPrev, onNext, fullscreen, onToggleFullscreen }) {
  return (
    <nav className="stage-controls" aria-label="Mannequin view" inert={inert}>
      <button type="button" className="ctl ctl-step" onClick={onPrev} aria-label="Previous saree">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <div className="views" role="group" aria-label="Camera">
        {Object.entries(VIEWS).map(([key, v]) => (
          <button key={key} type="button" className="ctl" aria-pressed={view === key} onClick={() => onView(key)}>
            {v.label}
          </button>
        ))}
      </div>
      <button type="button" className="ctl" aria-pressed={rotating} onClick={onToggleRotate}>
        {rotating ? 'Stop turning' : 'Turn'}
      </button>
      {onToggleFullscreen && (
        <button type="button" className="ctl" aria-pressed={fullscreen} onClick={onToggleFullscreen}>
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      )}
      <button type="button" className="ctl ctl-step" onClick={onNext} aria-label="Next saree">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
    </nav>
  );
}
