import type { ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function ZoomControls({ onZoomIn, onZoomOut, onReset, children }: Props) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" className="zoom-controls__btn" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v12M4 10h12" />
        </svg>
      </button>
      <button type="button" className="zoom-controls__btn" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 10h12" />
        </svg>
      </button>
      <button type="button" className="zoom-controls__btn" onClick={onReset} aria-label="Reset view" title="Reset view">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3.5 9.5 10 4l6.5 5.5M5.5 8v8h9V8" />
        </svg>
      </button>
      {children}
    </div>
  );
}
