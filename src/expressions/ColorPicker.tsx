import { useEffect, useRef } from 'react';
import { PALETTE } from './model';

interface Props {
  value: string;
  onChange: (color: string) => void;
  onClose: () => void;
}

export function ColorPicker({ value, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // Clicks on the toggle button are handled by the button itself.
      const toggle = ref.current?.parentElement?.querySelector('button');
      if (!ref.current?.contains(e.target as Node) && !toggle?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="color-picker" role="radiogroup" aria-label="Curve color">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color === value}
          aria-label={color}
          className="color-picker__swatch"
          style={{ background: color }}
          onClick={() => {
            onChange(color);
            onClose();
          }}
        />
      ))}
      <label className="color-picker__custom" title="Custom color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom color" />
      </label>
    </div>
  );
}
