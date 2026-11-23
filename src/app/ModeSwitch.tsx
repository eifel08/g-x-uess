interface Props {
  mode: '2d' | '3d';
  onChange: (mode: '2d' | '3d') => void;
}

/** 2D / 3D segmented switch in the sidebar header. */
export function ModeSwitch({ mode, onChange }: Props) {
  return (
    <div className="segmented mode-switch" role="radiogroup" aria-label="Graph mode">
      {(['2d', '3d'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className="segmented__option"
          onClick={() => onChange(m)}
        >
          {m.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
