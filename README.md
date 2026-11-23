# g(x)uess

A math guessing game: a function f(x) is hidden, and you work out what it is with a graphing calculator.

The game is being built in phases:

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Project foundation and a 2D graphing calculator in the style of Desmos | ✅ current |
| 2 | Guessing-game mechanics: hidden function, guesses, hints, scoring | planned |
| 3 | Installable PWA (offline, home-screen install) | planned |
| 4 | Android APK (Capacitor wrapper around the same web build) | planned |

## Quick start

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript checks
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Requires Node 20 or newer (CI uses Node 22).

## What works in Phase 1

**Graph**
- High-DPI canvas plane with drag-to-pan, zoom with the scroll wheel, trackpad pinch, two-finger touch pinch, and the +/−/home buttons
- Keyboard controls once the graph has focus: arrow keys pan, `+`/`-` zoom, `0` resets the view, `Esc` clears pinned points
- Grid and tick spacing follow a 1-2-5 sequence and adjust as you zoom. Axis labels stay at the edge when an axis is off-screen, and very large or small values use scientific notation (`2×10⁻⁶`)
- Adaptive sampling keeps curves smooth. Plotting stops at poles (`1/x`, `tan(x)`) and jumps (`floor(x)`) instead of drawing a vertical line across them, ends neatly at domain edges (`sqrt(x)`), and runs off to infinity where the function does (`ln(x)` at 0)
- Hovering near a curve shows its coordinates. Clicking or tapping a curve pins a point, and clicking the point again removes it
- Light and dark themes follow the system setting

**Expressions**
- Accepted forms: `y = …`, a bare expression in `x`, functions like `f(x) = …` (other rows can call them), and constants like `a = 3`
- Functions: `sin cos tan sec csc cot`, their inverses (`asin`/`arcsin`, …), hyperbolic functions, `sqrt cbrt nthRoot exp ln log log2 log10 abs sign floor ceil round mod min max gamma hypot`, `!`
- Constants: `pi` (or `π`), `e`, `tau`, `phi`
- Calculator-style shorthand: `2x`, `sin x`, `2 sin x`, `x(x+1)`, `(x+1)(x-1)`, `|x|`, `x²`, `√x`
- `log` is base 10, `ln` is the natural log, and `log(x, b)` takes any base
- Rows without `x` show their value, e.g. `f(2)` shows `= 4`
- Short error messages such as "Missing closing parenthesis", "f takes 1 argument" or "Circular definition". While you are typing they wait for a short pause before appearing, and one broken row never affects the others
- Each row has a show/hide toggle, a color picker (8 preset colors plus a custom color), and a delete button. Enter adds a row, Backspace on an empty row deletes it, and ↑/↓ move between rows
- The expression list is saved in `localStorage`

## Project structure

```
src/
├── app/            App shell and layout (side panel on desktop, bottom sheet on phones)
├── math/           Parsing and evaluation (no DOM, no React)
│   ├── mathInstance.ts   Sandboxed mathjs instance with only the needed functions
│   ├── preprocess.ts     Converts unicode symbols and |x| to standard syntax
│   ├── compile.ts        Parses rows, rewrites shorthand, validates, links definitions
│   └── types.ts          RowResult / RealFn: the interface between math and UI
├── graph/          Graph engine
│   ├── viewport.ts       World ↔ screen transforms, pan and zoom math
│   ├── ticks.ts          Grid spacing and number formatting
│   ├── sampler.ts        Adaptive curve sampling and discontinuity detection
│   ├── renderer.ts       Draws a scene on the canvas (grid, labels, curves, points)
│   └── GraphCanvas.tsx   React component: resizing, pointer/wheel/keyboard input, hit testing
├── expressions/    Expression list UI and state (reducer, persistence, rows, color picker)
├── game/           Game logic for Phase 2 (currently: checking whether two functions are equal)
└── styles/         Global design tokens (CSS variables, light and dark)
public/             Static assets and web app manifest (Phase 3 builds on these)
.github/workflows/  CI: typecheck, test, build
```

### Design notes

- **Safe evaluation.** User text never reaches `eval` or `math.evaluate`. Each row is parsed into an AST, rewritten, and checked against allowlists of node types, operators, functions and symbols. Only then is it compiled. Anything else gets a friendly error.
- **Rows are compiled together.** `compileExpressions` takes every row and returns one `RowResult` per row id. Definitions can appear in any order. Duplicate names, cycles, wrong argument counts and undefined names are reported on the row that causes them.
- **The graph knows nothing about expressions.** `GraphCanvas` receives `{ id, color, fn }` curves, where `fn` is a plain `(x: number) => number`. Phase 2 can draw a hidden target function, or compare a guess against it, without involving the expression UI.
- **Pan and zoom do not re-render React.** The viewport lives in refs and frames are drawn with `requestAnimationFrame`. Resampling a curve takes about 1 ms (about 3 ms for difficult functions like `sin(1/x)`), so every frame is resampled for full detail.
- **Relative `base`.** Vite builds with `base: './'`, so the same `dist/` works on static hosting, as a PWA and inside an Android WebView.

## Roadmap toward Phase 2

- `game/`: puzzle definitions (hidden function, difficulty, allowed tools), round state, scoring, hints
- `game/equivalence.ts` already checks whether two functions agree numerically, so a guess like `2(x+1)` matches a hidden `2x+2`
- UI: a game mode that plots the hidden f(x) (or samples of it) next to the player's guesses
