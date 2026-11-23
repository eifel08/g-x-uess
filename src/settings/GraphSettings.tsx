import { useEffect, useRef, useState } from 'react';
import type { Settings } from './useSettings';
import './GraphSettings.css';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

/** Gear button + popover for graph settings (angle units, points of interest). */
export function GraphSettings({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="graph-settings" ref={ref}>
      <button
        type="button"
        className={`zoom-controls__btn${open ? ' is-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Graph settings"
        aria-expanded={open}
        title="Graph settings"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3.5 6h13M3.5 14h13" />
          <circle cx="7.5" cy="6" r="2" />
          <circle cx="12.5" cy="14" r="2" />
        </svg>
      </button>
      {open && (
        <div className="graph-settings__popover" role="dialog" aria-label="Graph settings">
          <div className="graph-settings__row">
            <span className="graph-settings__label">Angles</span>
            <div className="segmented" role="radiogroup" aria-label="Angle unit">
              {(['rad', 'deg'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={settings.angleMode === mode}
                  className="segmented__option"
                  onClick={() => onChange({ angleMode: mode })}
                >
                  {mode === 'rad' ? 'Radians' : 'Degrees'}
                </button>
              ))}
            </div>
          </div>
          <label className="graph-settings__row graph-settings__check">
            <span className="graph-settings__label">Points of interest</span>
            <input
              type="checkbox"
              checked={settings.showPointsOfInterest}
              onChange={(e) => onChange({ showPointsOfInterest: e.target.checked })}
            />
          </label>
          <p className="graph-settings__hint">Intercepts and intersections of visible curves.</p>
        </div>
      )}
    </div>
  );
}
