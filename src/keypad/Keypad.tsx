import { useState } from 'react';
import type { Edit } from '../expressions/editing';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { FUNCTION_GROUPS, NAV_KEYS, NUMBER_KEYS, SYMBOL_KEYS, type KeyDef } from './keys';
import './Keypad.css';

interface Props {
  /** 3D mode swaps θ for z. */
  threeD?: boolean;
  onEdit: (edit: Edit) => void;
  onEnter: () => void;
  onClose: () => void;
}

type Tab = 'main' | 'symbols' | 'functions';

/**
 * Docked on-screen math keypad. Pressing a key never takes focus from the
 * expression input (pointer/mouse down are cancelled), so the cursor and
 * selection survive, and typing on a physical keyboard still works.
 */
const Z_KEY: KeyDef = { label: 'z', title: 'z', action: { kind: 'edit', edit: { type: 'insert', template: 'z' } } };

export function Keypad({ threeD = false, onEdit, onEnter, onClose }: Props) {
  const symbolKeys = threeD ? SYMBOL_KEYS.map((k) => (k.label === 'θ' ? Z_KEY : k)) : SYMBOL_KEYS;
  const narrow = useMediaQuery('(max-width: 640px)');
  const [tab, setTab] = useState<Tab>('main');
  // On wide screens symbols and numbers share one tab.
  const current: Tab = !narrow && tab === 'symbols' ? 'main' : tab;

  const press = (k: KeyDef) => (k.action.kind === 'enter' ? onEnter() : onEdit(k.action.edit));
  const tabs: { id: Tab; label: string }[] = narrow
    ? [
        { id: 'main', label: '123' },
        { id: 'symbols', label: 'x y π' },
        { id: 'functions', label: 'f(x)' },
      ]
    : [
        { id: 'main', label: 'Main' },
        { id: 'functions', label: 'Functions' },
      ];

  return (
    <div
      className="keypad"
      role="toolbar"
      aria-label="Math keypad"
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="keypad__bar">
        <div className="keypad__tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={current === t.id}
              className="keypad__tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="keypad__close" onClick={onClose} aria-label="Hide keypad" title="Hide keypad (Alt+K)">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </div>

      <div className="keypad__body">
        <div className="keypad__content">
          {current === 'functions' ? (
            <div className="keypad__functions">
              {FUNCTION_GROUPS.map((group) => (
                <section key={group.title} className="keypad__group" aria-label={group.title}>
                  <h3 className="keypad__group-title">{group.title}</h3>
                  <div className="keypad__group-keys">
                    {group.keys.map((k) => (
                      <Key key={k.label + k.title} def={k} onPress={press} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <>
              {(!narrow || current === 'symbols') && (
                <div className="keypad__grid keypad__grid--symbols">
                  {symbolKeys.map((k) => (
                    <Key key={k.title} def={k} onPress={press} />
                  ))}
                </div>
              )}
              {(!narrow || current === 'main') && (
                <div className="keypad__grid keypad__grid--numbers">
                  {NUMBER_KEYS.map((k) => (
                    <Key key={k.title} def={k} onPress={press} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="keypad__nav">
          <div className="keypad__nav-row">
            <Key def={NAV_KEYS.left} onPress={press} />
            <Key def={NAV_KEYS.right} onPress={press} />
          </div>
          <Key def={NAV_KEYS.backspace} onPress={press} />
          <Key def={NAV_KEYS.enter} onPress={press} />
        </div>
      </div>
    </div>
  );
}

function Key({ def, onPress }: { def: KeyDef; onPress: (k: KeyDef) => void }) {
  return (
    <button
      type="button"
      className={`key key--${def.style ?? 'default'}`}
      title={def.title}
      aria-label={def.title}
      onClick={() => onPress(def)}
    >
      {def.label}
    </button>
  );
}
