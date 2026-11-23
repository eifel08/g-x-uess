import { useEffect, useRef, useState } from 'react';
import { isPlottable, type RowResult } from '../math/types';
import { ColorPicker } from './ColorPicker';
import { effectiveBounds, formatSliderValue, parseSliderRow, undefinedVariable } from './slider';
import { VariableSlider } from './VariableSlider';
import type { ExpressionItem } from './model';

interface Props {
  item: ExpressionItem;
  index: number;
  result: RowResult | undefined;
  inputRef: (el: HTMLInputElement | null) => void;
  /** While the on-screen keypad is open, suppress the phone's native keyboard. */
  keypadOpen: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (patch: Partial<Omit<ExpressionItem, 'id'>>) => void;
  onRemove: () => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onNavigate: (delta: -1 | 1) => void;
  /** Adds a `name = 1` row with a slider, for an undefined variable used here. */
  onAddSlider?: (name: string) => void;
  placeholder?: string;
  /** Game mode: submit this row as a guess for f(x). Set only when the row can be submitted. */
  onSubmit?: () => void;
  /** Game mode: why this function row can't be submitted (Submit shows disabled). */
  submitBlocked?: string;
  /** Game mode: result of this row's latest submission (hidden once the row is edited). */
  feedback?: { correct: boolean; message: string };
}

/** How long typing must pause before errors appear for the focused row. */
const ERROR_DELAY_MS = 900;

export function ExpressionRow({
  item,
  index,
  result,
  inputRef,
  keypadOpen,
  onFocus,
  onBlur,
  onChange,
  onRemove,
  onEnter,
  onBackspaceEmpty,
  onNavigate,
  onAddSlider,
  placeholder = 'Type a guess, e.g. g(x) = 2x + 1',
  onSubmit,
  submitBlocked,
  feedback,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [settled, setSettled] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const timer = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleText = (text: string) => {
    onChange({ text });
    setSettled(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSettled(true), ERROR_DELAY_MS);
  };

  const isCurve = isPlottable(result);
  const error = result?.kind === 'error' && (!focused || settled) ? result.message : null;
  const value = result?.kind === 'value' ? result.value : null;
  // `a = 3` → slider; `y = a x` with a undefined → offer one.
  const sliderRow = result?.kind === 'value' && result.name ? parseSliderRow(item.text) : null;
  const sliderBounds = sliderRow ? effectiveBounds(sliderRow.value, item.slider) : null;
  const missing = result?.kind === 'error' ? undefinedVariable(result.message) : null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter();
    } else if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault();
      onBackspaceEmpty();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onNavigate(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onNavigate(1);
    }
  };

  return (
    <li className={`expr-row${focused ? ' is-focused' : ''}${error ? ' has-error' : ''}`}>
      <div className="expr-row__gutter">
        <span className="expr-row__index">{index + 1}</span>
        {error ? (
          <span className="expr-row__warn" title={error} aria-hidden="true">
            !
          </span>
        ) : isCurve ? (
          <button
            type="button"
            className={`swatch${item.visible ? '' : ' is-hidden'}`}
            style={{ '--swatch': item.color } as React.CSSProperties}
            aria-pressed={item.visible}
            aria-label={item.visible ? `Hide expression ${index + 1}` : `Show expression ${index + 1}`}
            title={item.visible ? 'Hide' : 'Show'}
            onClick={() => onChange({ visible: !item.visible })}
          />
        ) : null}
      </div>

      <div className="expr-row__main">
        <input
          ref={inputRef}
          className="expr-row__input"
          value={item.text}
          placeholder={index === 0 ? placeholder : ''}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label={`Expression ${index + 1}`}
          aria-invalid={!!error}
          inputMode={keypadOpen ? 'none' : 'text'}
          onChange={(e) => handleText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true);
            onFocus();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur();
          }}
        />
        {error && (
          <div className="expr-row__error" role="status">
            {error}
            {missing && onAddSlider && (
              <button type="button" className="expr-row__add-slider" onClick={() => onAddSlider(missing)}>
                + slider for {missing}
              </button>
            )}
          </div>
        )}
        {sliderRow && sliderBounds && (
          <VariableSlider
            name={sliderRow.name}
            value={sliderRow.value}
            bounds={sliderBounds}
            onValue={(v) => onChange({ text: `${sliderRow.name} = ${formatSliderValue(v, sliderBounds.step)}` })}
            onBounds={(slider) => onChange({ slider })}
          />
        )}
        {feedback && (
          <div className={`expr-row__feedback${feedback.correct ? ' is-correct' : ''}`} role="status">
            {feedback.correct ? '✓ ' : '✗ '}
            {feedback.message}
          </div>
        )}
        {value !== null && !sliderRow && (
          <div className="expr-row__value">
            {result?.kind === 'value' && result.name ? `${result.name} = ` : '= '}
            {formatValue(value)}
          </div>
        )}
      </div>

      {submitBlocked && !onSubmit && (
        <button
          type="button"
          className="expr-row__submit"
          disabled
          aria-label={`Can't submit expression ${index + 1}: ${submitBlocked}`}
          title={submitBlocked}
        >
          Submit
        </button>
      )}
      {onSubmit && (
        <button
          type="button"
          className="expr-row__submit"
          onClick={onSubmit}
          aria-label={`Submit expression ${index + 1} as your guess for f(x)`}
          title="Submit as your guess for f(x)"
        >
          Submit
        </button>
      )}
      <div className="expr-row__actions">
        {isCurve && (
          <div className="expr-row__color">
            <button
              type="button"
              className="icon-btn"
              aria-label="Change color"
              title="Change color"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((o) => !o)}
            >
              <span className="icon-btn__dot" style={{ background: item.color }} />
            </button>
            {pickerOpen && (
              <ColorPicker
                value={item.color}
                onChange={(color) => onChange({ color, visible: true })}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
        )}
        <button type="button" className="icon-btn" aria-label="Delete expression" title="Delete" onClick={onRemove}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 5l10 10M15 5 5 15" />
          </svg>
        </button>
      </div>
    </li>
  );
}

function formatValue(n: number): string {
  if (Number.isNaN(n)) return 'undefined';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '−∞';
  const abs = Math.abs(n);
  const text =
    abs !== 0 && (abs >= 1e12 || abs < 1e-6) ? n.toExponential(6).replace(/\.?0+e/, 'e') : String(Number(n.toPrecision(12)));
  return text.replace('-', '−');
}
