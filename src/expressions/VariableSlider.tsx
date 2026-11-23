import { useEffect, useRef, useState } from 'react';
import { niceStep, type SliderBounds } from './slider';

interface Props {
  name: string;
  value: number;
  bounds: SliderBounds;
  onValue: (value: number) => void;
  onBounds: (bounds: SliderBounds) => void;
}

/** Seconds for one sweep from min to max while playing. */
const SWEEP_SECONDS = 4;

/**
 * Desmos-style slider under a `name = number` row: play/pause, editable
 * min and max, and a range input. Playing bounces between min and max.
 */
export function VariableSlider({ name, value, bounds, onValue, onBounds }: Props) {
  const [playing, setPlaying] = useState(false);
  const live = useRef({ value, bounds, onValue, direction: 1 });
  live.current = { ...live.current, value, bounds, onValue };

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const { value: v, bounds: b, onValue: set } = live.current;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let next = v + live.current.direction * ((b.max - b.min) / SWEEP_SECONDS) * dt;
      if (next >= b.max) {
        next = b.max;
        live.current.direction = -1;
      } else if (next <= b.min) {
        next = b.min;
        live.current.direction = 1;
      }
      set(Math.round(next / b.step) * b.step);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const editBound = (which: 'min' | 'max', text: string) => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) return;
    const next = { ...bounds, [which]: n };
    if (next.max <= next.min) return;
    onBounds({ ...next, step: niceStep(next.max - next.min) });
  };

  return (
    <div className="var-slider">
      <button
        type="button"
        className="var-slider__play"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? `Pause ${name}` : `Play ${name}`}
        title={playing ? 'Pause' : 'Animate'}
      >
        {playing ? (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7 5v10M13 5v10" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7 4.5v11l8.5-5.5Z" />
          </svg>
        )}
      </button>
      <BoundInput label={`Minimum of ${name}`} value={bounds.min} onCommit={(t) => editBound('min', t)} />
      <input
        type="range"
        className="var-slider__range"
        aria-label={name}
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={value}
        onChange={(e) => {
          setPlaying(false);
          onValue(Number(e.target.value));
        }}
      />
      <BoundInput label={`Maximum of ${name}`} value={bounds.max} onCommit={(t) => editBound('max', t)} />
    </div>
  );
}

/** Small number field that commits on blur or Enter. */
function BoundInput({ label, value, onCommit }: { label: string; value: number; onCommit: (text: string) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="var-slider__bound"
      aria-label={label}
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
