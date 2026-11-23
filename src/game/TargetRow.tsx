import type { Game } from './useGame';
import { DIFFICULTIES } from './generator';
import { TARGET_COLOR } from './style';
import './TargetRow.css';

/**
 * The pinned `f(x) = ?` entry at the top of the sidebar: visibility toggle,
 * difficulty 1–5, new function, hints, give up, and the result of the round.
 */
export function TargetRow({ game }: { game: Game }) {
  const { state, target, hints } = game;
  const playing = state.status === 'playing';
  const solved = state.status === 'won';

  return (
    <section
      className={`target-row${solved ? ' is-won' : ''}${state.status === 'revealed' ? ' is-revealed' : ''}`}
      aria-label="Hidden function f(x)"
      style={{ '--target': TARGET_COLOR } as React.CSSProperties}
    >
      <div className="target-row__main">
        <button
          type="button"
          className={`target-row__eye${state.targetVisible ? '' : ' is-off'}`}
          aria-pressed={state.targetVisible}
          aria-label={state.targetVisible ? 'Hide f(x) on the graph' : 'Show f(x) on the graph'}
          title={state.targetVisible ? 'Hide f(x)' : 'Show f(x)'}
          onClick={game.toggleTarget}
        >
          {state.targetVisible ? (
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10Z" />
              <circle cx="10" cy="10" r="2.6" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10Z" />
              <path d="M3.5 16.5 16.5 3.5" />
            </svg>
          )}
        </button>

        <div className="target-row__formula" data-testid="target-formula">
          <span className="target-row__name">f(x) =</span>{' '}
          {playing ? <span className="target-row__hidden">?</span> : <span className="target-row__answer">{target.expression}</span>}
        </div>

        {playing && (
          <div className="target-row__tools">
            <button
              type="button"
              className="icon-btn"
              onClick={game.hint}
              disabled={state.hintsShown >= hints.length}
              aria-label="Hint"
              title={state.hintsShown >= hints.length ? 'No more hints' : `Hint (${state.hintsShown}/${hints.length} used)`}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M7.5 15.5h5M8 18h4M10 2.5a5.5 5.5 0 0 0-3.2 10c.5.4.7.9.7 1.5v.5h5V14c0-.6.2-1.1.7-1.5A5.5 5.5 0 0 0 10 2.5Z" />
              </svg>
            </button>
            <button type="button" className="icon-btn" onClick={game.reveal} aria-label="Give up and reveal f(x)" title="Give up and reveal f(x)">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4.5 18V3M4.5 3.5h10l-2.5 4 2.5 4h-10" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="target-row__meta">
        <div className="difficulty" role="radiogroup" aria-label="Difficulty">
          <span className="difficulty__label">Difficulty</span>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={state.difficulty === d}
              aria-label={`Difficulty ${d}`}
              className="difficulty__option"
              onClick={() => d !== state.difficulty && game.newFunction(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <span className="target-row__attempts" aria-label="Attempts">
          {state.attempts} {state.attempts === 1 ? 'try' : 'tries'}
        </span>
      </div>

      {playing && state.hintsShown > 0 && (
        <ul className="target-row__hints" aria-label="Hints">
          {hints.slice(0, state.hintsShown).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      {!playing && (
        <div className="target-row__result" role="status">
          <span>
            {solved
              ? `🎉 Solved in ${state.attempts} ${state.attempts === 1 ? 'try' : 'tries'}!`
              : 'Revealed. Better luck with the next one!'}
          </span>
          <button type="button" className="target-row__new" onClick={() => game.newFunction()}>
            New function
          </button>
        </div>
      )}
      {playing && (
        <p className="target-row__tip">
          Write a guess below, then press <strong>Submit</strong> on its row.{' '}
          <button type="button" className="target-row__link" onClick={() => game.newFunction()}>
            New function
          </button>
        </p>
      )}
    </section>
  );
}
