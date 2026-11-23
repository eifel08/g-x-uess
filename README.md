# g(x)uess

A math guessing game: a function f(x) is hidden, and you work out what it is with a graphing calculator.

The game is being built in phases:

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Project foundation and a 2D graphing calculator in the style of Desmos | ✅ current |
| 2 | Guessing-game mechanics: hidden function, guesses, hints, scoring | ✅ game mode (see below) |
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

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`, which tests and builds the app and publishes `dist/` to
GitHub Pages. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
The site is then served at `https://<owner>.github.io/<repo>/`.

## How to play

A hidden function is pinned at the top of the sidebar as **`f(x) = ?`**, drawn on the graph in gold with a glow and an `f(x)` badge.

1. Pick a **difficulty from 1 to 5**. Each choice (and **New function**) generates a fresh random target:
   1. linear and simple quadratics: `2x - 3`, `x^2 + 4`, `(x - 2)^2`
   2. vertex/factored quadratics, `|x - h| + k`, `sqrt(x - h)`, `a/(x - h) + k`
   3. `a·sin(bx) + c`, exponentials, logarithms, cubics
   4. rational functions with asymptotes, damped and shifted trig, multi-term polynomials, combined forms
   5. compositions (`e^(sin x)`, `ln(x^2 + a)`), products and ratios (`x sin(x)/2`, `sin(x)/x`), non-trivial phase and frequency, subtle transformations
2. Explore with the calculator as usual. **f is a real function you can use in any expression**: `sin(f(x))`, `f(x) - x^2`, `f(x + 1)`, `f'(x)`, `d/dx f(x)`, `y < f(x)`, or values like `f(0)`. The name f is reserved for it, so call your own functions g, h, …. The eye button shows or hides f(x). Hovering f(x) shows coordinates, and its intercepts and intersections with your curves appear as points of interest.
3. When a row holds a function of x (`y = …`, `g(x) = …` or a bare expression), press its **Submit** button to submit it as your guess. There's no separate guess box. Rows that use f, directly or through another definition, can't be submitted (their Submit button is disabled), because `y = f(x)` would win trivially.
   - **Match:** you win, the formula is revealed and the number of tries is shown, with a **New function** button.
   - **Miss:** a short note on that row explains how it differs, without giving the answer away. For example: "Right shape! It's shifted right by 2", "above f(x) by 3 everywhere", "stretched vertically by a factor of 2", "upside down", domain differences, or "62% of the visible graph matches".
4. **Hints** (light bulb) reveal, one at a time: the function family, f(0), symmetry (even/odd), then where f crosses the x-axis. **Give up** (flag) reveals f(x).

Guesses are judged by numeric equivalence, so any algebraically equal form wins: `(x - 2)(x + 3)` matches `x^2 + x - 6`. Both functions are sampled on [−10, 10], [−1, 1], [−100, 100] and [−1000, 1000]. Points where both are undefined agree; points where only one is defined don't, so domain restrictions count: `sqrt(x)^2` ≠ `x`.

The round in progress (difficulty, seed, tries, hints) is saved in `localStorage`. The formula itself is never stored; it's regenerated from the seed.

## What works in Phase 1

**Graph**
- High-DPI canvas plane with drag-to-pan, zoom with the scroll wheel, trackpad pinch, two-finger touch pinch, and the +/−/home buttons
- Keyboard controls once the graph has focus: arrow keys pan, `+`/`-` zoom, `0` resets the view, `Esc` clears pinned points
- Grid and tick spacing follow a 1-2-5 sequence and adjust as you zoom. Axis labels stay at the edge when an axis is off-screen, and very large or small values use scientific notation (`2×10⁻⁶`)
- Adaptive sampling keeps curves smooth. Plotting stops at poles (`1/x`, `tan(x)`) and jumps (`floor(x)`) instead of drawing a vertical line across them, ends neatly at domain edges (`sqrt(x)`), and runs off to infinity where the function does (`ln(x)` at 0)
- Hovering near a curve shows its coordinates. Clicking or tapping a curve pins a point, and clicking the point again removes it
- Vertical lines, circles and implicit curves support hover and pinning too. Circle points are exact projections; points on generic implicit curves are refined onto F = 0 with Newton steps
- **Points of interest:** x-intercepts, y-intercepts and curve-curve intersections are found automatically and shown as gray dots. Hovering or tapping one shows a callout with its kind and coordinates to 10 significant digits; clicking pins it, and a pinned point follows its curve as you edit. Like Desmos, the dots shown belong to the selected expression or the curve under the mouse. With nothing selected, they appear only when there are 24 or fewer. Poles and jumps are never reported as roots. A curve that oscillates too fast for the current zoom contributes no points, rather than an incomplete set
- **Settings** (sliders button): radians/degrees for trig functions (a "Degrees" badge shows while active) and a points-of-interest switch. Settings are saved in `localStorage`
- Light and dark themes follow the system setting

**Expressions**
- Accepted forms: `y = …`, a bare expression in `x`, functions like `f(x) = …` (other rows can call them), and constants like `a = 3`
- Functions: `sin cos tan sec csc cot`, their inverses (`asin`/`arcsin`/`sin⁻¹`/`sin^-1`, …), hyperbolic functions and their inverses, `sqrt cbrt nthRoot exp ln log log2 log10 abs sign floor ceil round mod gcd lcm min max gamma hypot`, `!`
- Calculus:
  - `d/dx(x^3)` (also `d/dx sin x`), and prime notation for any one-variable function: `f'(x)`, `f''(x)`, `sin'(x)` (up to 6 primes). Derivatives are computed numerically, using a five-point stencil for first derivatives
  - Definite integrals `int(t, a, b, expression)` or `∫(t, a, b, …)`, with any variable name and infinite bounds (`∫(t, 0, ∞, e^(-t))`), using adaptive Gauss–Kronrod 7/15
  - `int(t, 0, x, cos(t))` plots as a function of x
- Sums and products: `sum(n, 1, 10, n^2)` / `∑`, `prod(n, 1, 5, n)` / `∏` (up to 100,000 terms)
- Statistics on lists: `mean median stdev stdevp var varp total length min max`, e.g. `mean([1, 2, 3])` or `total([1...100])`. Lists can only appear inside these functions
- Constants: `pi` (or `π`), `e`, `tau`, `phi`, `∞`; symbols `θ`, `≤ ≥ ≠`; subscripted names like `a_1`
- Calculator-style shorthand: `2x`, `sin x`, `2 sin x`, `x(x+1)`, `(x+1)(x-1)`, `|x|`, `x²`, `√x`
- `log` is base 10, `ln` is the natural log, and a custom base is written `log_2(x)`, `log_{10}(x)` or `log(x, b)`
- **Vertical lines:** `x = 3`, `x = -2.5`, `x = sin(1)`, `x = a/2`
- **Circles and implicit equations:** `x^2 + y^2 = 4`, `(x - 1)^2 + (y + 2)^2 = 9`, `x^2 + y^2 + 2x - 4y = 4`, ellipses, `x = y^2`, `sin(x y) = 0.5`, … Equations are classified automatically:
  - circles (any `a(x² + y²) + dx + ey + f = 0`) are drawn exactly from their centre and radius
  - lines (`2y + x = 4`, `3x = 6`) and anything linear in y (`x^2 = 2y`, `xy = 1`) become exact explicit curves
  - everything else is contoured
- **Shaded inequalities:** `y < x^2`, `y <= x + 1`, `y > sin(x)`, `y >= -x^2 + 4`, `x > 2`, `x^2 + y^2 < 4`, `sin(x) sin(y) > 0.2`, … Strict `<`/`>` get a dashed boundary and `≤`/`≥` a solid one, like Desmos. Each region is shaded in its expression's color at 20% opacity, so overlapping regions stay readable
- Still not supported, each with a clear message: double inequalities like `1 < y < 2`, and `y` outside an equation or inequality
- Rows without `x` show their value, e.g. `f(2)` shows `= 4`
- Short error messages such as "Missing closing parenthesis", "f takes 1 argument" or "Circular definition". While you are typing they wait for a short pause before appearing, and one broken row never affects the others
- Each row has a show/hide toggle, a color picker (8 preset colors plus a custom color), and a delete button. Enter adds a row, Backspace on an empty row deletes it, and ↑/↓ move between rows
- **Sliders:** a row like `a = 2` gets a slider (default −10…10; edit the min and max at its ends) and a ▶ button that animates the value back and forth. When an expression uses an undefined variable (`y = k x`), the error offers a **+ slider for k** button that adds `k = 1`. Every curve using the variable updates live
- **Phones:** the expression list sits under the graph. The double-chevron button in its header expands it to most of the screen, so you can see more expressions at once (a strip of graph stays visible), and tapping it again restores the split. The choice is remembered
- The expression list is saved in `localStorage`

**On-screen math keypad** (keyboard button in the panel header, or **Alt+K**)
- Docked at the bottom like Desmos. Pressing keys never takes focus away from the expression, so the physical keyboard keeps working alongside it
- **Main** tab: x y a b θ, a², aᵇ, √, fraction, |a|, parentheses, comparison operators, π e ∞, a number pad, and ←/→, ⌫, ↵ (new row)
- **Functions** tab, by category: trigonometry, inverse trig, hyperbolic, calculus (d/dx, f′, f″, ∫), series and products (Σ, Π, n!), roots and powers (√ ∛ ⁿ√, superscript, subscript), logs and exponentials (ln, log, logₐ, exp, eˣ, 10ˣ), number functions (abs, floor, ceil, round, sign, mod, gcd, lcm, min, max), and statistics and lists
- Keys insert clean text and place the cursor where you'd type next: `sqrt(|)`, `int(t, |, , )`. With a selection, keys wrap it: `sqrt(x+1)`. Fraction takes the previous operand as numerator (`1` → `(1)/(|)`), `)` steps over an existing `)`, and ⌫ removes an empty call like `sin()` in one press
- On phones the keypad has 123 / x y π / f(x) tabs, and the native keyboard is suppressed while it's open

## Project structure

```
src/
├── app/            App shell and layout (side panel on desktop, bottom sheet on phones)
├── math/           Parsing and evaluation (no DOM, no React)
│   ├── mathInstance.ts   Sandboxed mathjs instance with only the needed functions
│   ├── preprocess.ts     Converts calculator notation (unicode, |x|, d/dx, f', log_b, …) to mathjs syntax
│   ├── compile.ts        Parses rows, rewrites shorthand, validates, links definitions, applies angle mode
│   ├── specialForms.ts   d/dx, ∫, Σ, Π: functions that receive their arguments unevaluated
│   ├── numeric.ts        Numerical differentiation and adaptive Gauss–Kronrod integration
│   ├── functions.ts      gcd/lcm, list statistics, ranges, degree-mode trig
│   ├── implicitShape.ts  Detects circles / lines / linear-in-y equations for exact drawing
│   ├── scope.ts          Layered evaluation scopes
│   └── types.ts          RowResult / RealFn: the interface between math and UI
├── graph/          Graph engine
│   ├── viewport.ts       World ↔ screen transforms, pan and zoom math
│   ├── ticks.ts          Grid spacing and number formatting
│   ├── sampler.ts        Adaptive curve sampling and discontinuity detection
│   ├── plots.ts          GraphPlot (function / vline / implicit, ± inequality) → strokes and fills per frame
│   ├── circle.ts         Exact circle geometry (visible arc only for huge circles), shading polygons
│   ├── implicit.ts       Adaptive marching squares for F(x, y) = 0 and regions F(x, y) < 0
│   ├── poi.ts            Points of interest: roots, y-intercepts, intersections (incl. vertical lines)
│   ├── hitTest.ts        Nearest curve / point of interest under the pointer
│   ├── renderer.ts       Draws a scene on the canvas (grid, labels, curves, points, callouts)
│   └── GraphCanvas.tsx   React component: resizing, pointer/wheel/keyboard input, pins
├── expressions/    Expression list UI and state (reducer, persistence, rows, color picker),
│                   editing.ts (pure cursor/template edits) and useExpressionEditor (shared by rows and keypad)
├── keypad/         On-screen keypad: keys.ts (layout as data) and Keypad.tsx
├── settings/       Persisted settings (angle mode, points of interest, keypad) and the settings popover
├── hooks/          Small shared React hooks
├── game/           Game mode
│   ├── generator.ts      Seeded target generator per difficulty, with visibility/degeneracy checks
│   ├── judge.ts          Equivalence verdict and non-spoiling feedback on misses
│   ├── hints.ts          Progressive hints (family, f(0), symmetry, zeros)
│   ├── state.ts          Pure round reducer (attempts, status, visibility, feedback)
│   ├── useGame.ts        React hook: randomness, persistence, compiled target
│   ├── TargetRow.tsx     The pinned `f(x) = ?` row (eye toggle, difficulty, hints, result)
│   └── equivalence.ts, integralEquivalence.ts, random.ts   Function comparison and seeded RNG
└── styles/         Global design tokens (CSS variables, light and dark)
public/             Static assets and web app manifest (Phase 3 builds on these)
.github/workflows/  CI (typecheck, test, build) and GitHub Pages deploy from main
```

### Design notes

- **Safe evaluation.** User text never reaches `eval` or `math.evaluate`. Each row is parsed into an AST, rewritten, and checked against allowlists of node types, operators, functions and symbols. Only then is it compiled. Anything else gets a friendly error.
- **Rows are compiled together.** `compileExpressions` takes every row and returns one `RowResult` per row id. Definitions can appear in any order. Duplicate names, cycles, wrong argument counts and undefined names are reported on the row that causes them.
- **The graph knows nothing about expressions.** `GraphCanvas` receives `{ id, color, fn }` curves, where `fn` is a plain `(x: number) => number`. Phase 2 can draw a hidden target function, or compare a guess against it, without involving the expression UI.
- **Pan and zoom do not re-render React.** The viewport lives in refs and frames are drawn with `requestAnimationFrame`. Resampling a curve takes about 1 ms (about 3 ms for difficult functions like `sin(1/x)`), so every frame is resampled for full detail.
- **Points of interest are exact.** Each curve is sampled on a grid about 3 px wide. Sign changes are refined by bisection to full double precision and kept only if the value there is truly near zero, which rules out poles and jumps. Touching zeros such as x² at 0 are found with golden-section search. A second, jittered grid guards against aliasing. Computing points of interest every frame keeps panning at 60 fps.
- **Equations and inequalities are classified once, when compiled.** `y <op> f(x)` and `x <op> c` are recognised from the syntax. Anything else becomes F = lhs − rhs, and F is then fitted numerically against a quadratic and a "linear in y" form, then checked at scattered points. Circles keep exact geometry, and lines and linear-in-y equations become ordinary sampled curves. Only genuinely implicit relations pay for contouring.
- **Implicit curves are adaptive and exact.** The view is sampled on a 16 px grid; cells with a sign change are refined to 4 px leaves and contoured with marching squares (saddles resolved by the centre value). Each crossing is solved with regula falsi to near machine precision, and sign changes through poles are rejected. Segments are chained into polylines so dashes flow, and each region is filled with one seam-free path. Eight relations, including two generic implicit ones, still pan at 60 fps.
- **Huge circles stay exact.** Points are computed from the centre and radius with a step that keeps the polygon within 0.15 px of the true circle. When the radius is over 200,000 px only the visible arc is generated, so the circle is smooth at 10⁻⁸ zoom.
- **Angle mode is a compile option.** `compileExpressions(rows, { angleMode: 'deg' })` puts degree-based trig functions into the evaluation scope, so user functions, derivatives and integrals all follow the setting, and sin(180°) is exactly 0.
- **Relative `base`.** Vite builds with `base: './'`, so the same `dist/` works on static hosting, as a PWA and inside an Android WebView.

## Function equivalence checks

- Two checks for whether a guess matches the hidden function (e.g. `2(x+1)` vs `2x+2`):
  - `game/equivalence.ts` (`compareFunctions`) compares values at 256 points in [−10, 10]
  - `game/integralEquivalence.ts` (`compareFunctionsByIntegral`) tests 256 random intervals [a, b] of width w and requires
    `∫|f − g| dx ≤ ε · (∫|f| dx + ∫|g| dx + w)` on every one (default ε = 10⁻⁶). Interval centres and widths are drawn
    log-uniformly from 10⁻² to 10⁶ with random signs, so it covers both tiny and very large ranges. Integrals use
    composite Simpson's rule, rescaled so huge values can't overflow. Points where both functions are undefined are skipped;
    an interval where only one of them is defined fails

## Tests

`npm test` runs unit tests for the math, graph and game modules, plus jsdom integration tests (`src/app/App.test.tsx`). Those render the whole app and cover the pinned target row, the visibility toggle, which rows can be submitted, feedback on a miss, winning with an equivalent form, difficulty selection, hints and giving up.
