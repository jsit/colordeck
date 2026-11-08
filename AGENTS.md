# ColorDeck Agent Guide

## Run and Check

ColorDeck is a static, dependency-free color converter. Open `index.html`
directly, or serve the repository root for browser and clipboard checks:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Visit `http://127.0.0.1:8765/`. Clipboard access requires browser permission
and a secure context, such as localhost or HTTPS. Stop servers you start
when verification is finished.

Use a recent Node.js release for the built-in test runner. No dependency
installation, package manifest, application build, or lint setup is present.
Run commands from the repository root:

```sh
node --test tests/*.test.js
node --test tests/palette.test.js
node --test --test-name-pattern='slider' tests/palette.test.js
git diff --check
```

For code changes, add regression coverage and run the relevant test files.
Run the full suite when changing shared conversion or input helpers. If a
test fails, stop, report the failure, and ask how to proceed. Documentation-only
changes do not require application tests.

## Project Structure

- `index.html`: entire application, including CSS, markup, the embedded X11
  palette, conversion helpers, state, and event handlers in one inline script.
- `tests/parser.test.js`: extracted conversion/parser helpers evaluated with
  `node:vm`; covers color syntax, units, validation, and extreme angles.
- `tests/alpha-policy.test.js`: source-extracted helpers and event handlers
  covering alpha rejection, HEX rollback, and blur/Enter behavior.
- `tests/palette.test.js`: complete inline script executed in a minimal DOM,
  storage, and history fixture; covers palettes, RYB hue, and slider history.
- `README.md`: human-facing description and the deliberately irreverent voice.
- `.github/workflows/pages.yml`: publishes the repository root to GitHub Pages
  on pushes to `main` or manual dispatch. It does not currently run tests.

## Code Conventions

- Preserve the self-contained HTML architecture. Do not introduce frameworks,
  dependencies, generated bundles, or a build step without approval.
- Match existing indentation and compact HTML/CSS formatting. JavaScript uses
  `const`/`let`, camelCase names, double-quoted strings, and semicolons.
- Add JSDoc annotations for JavaScript functions, parameters, return values,
  variables, and callbacks. Explain non-obvious color math with brief comments.
- Use existing CSS custom properties and accessible labels, fieldsets, focus
  states, and `aria-invalid` feedback when extending the interface.
- Keep Markdown lines within 80 characters, except aligned tables.

Example of an existing helper's annotation and naming style:

```js
/** @param {number} hue @returns {number} Degrees wrapped into [0, 360). */
const normalizedHue = (hue) => ((hue % 360) + 360) % 360;
```

Fields use matching IDs and `data-key` values; sliders refer to those keys
through `data-slider-for`. Copy buttons use `data-copy` and `copyValues`.
Route changes through the existing input handlers and `updateFields()` so
linked fields, preview, palette, storage, and URL remain synchronized.

Tests extract source using helper names, declaration order, and listener text.
Check the fixtures before moving or renaming helpers or changing script tags.
Keep each test file's existing module style: parser tests use ESM; the other
test files use CommonJS. Do not add dependencies just to replace these fixtures.

## Behavior to Preserve

- Support opaque colors only. Accept three- or six-digit HEX; reject four- or
  eight-digit HEX and alpha-bearing functional syntax, even fully opaque alpha.
  Keep rejected input visible and marked invalid; do not silently fix it.
- Keep fractional RGB internally; round only for display and serialization.
  Preserve retained hues when achromatic colors cannot determine a hue.
- LCH uses D50 Lab. UI and bare OKLCH lightness use 0–100; unitless wrapped
  CSS `oklch()` lightness uses 0–1. Map out-of-gamut colors by reducing chroma,
  and keep chroma slider limits tied to their model's lightness and hue.
- Keep all 658 X11 names, aliases, and numbered variants. Nearest names use
  Euclidean D50 Lab distance with cached name coordinates, not RGB distance.
- RYB Hue is an approximate, bidirectional artist-wheel remapping of HSL hue,
  not standardized RYB or paint mixing. Its red/yellow/blue anchors are
  0°/120°/240°; edits preserve HSL saturation and lightness.
- Palette swatches are 128 × 128 pixels. Selecting one loads its color; edits
  update that swatch. "Add color" duplicates and selects the current color.
  Removal keeps at least one color. Left/right arrows reorder without dragging,
  and selection follows the same color, even when a neighbor crosses it.
- Browser storage retains palette colors and selection. Invalid or unavailable
  storage must not prevent editing. A valid URL palette takes precedence over
  saved state and selects the first color.
- URLs serialize every palette color in order, preserving duplicates, as
  uppercase six-digit HEX tokens, for example `#CC0033,EF00FF`.
- Palette changes create browser history entries. Slider `input` events update
  live previews but defer URL/history writes until native `change` on release.
  A drag ending at its starting color must not add a history entry. Startup and
  history restoration replace entries without destroying Forward navigation.

## Change Boundaries

- Keep edits scoped to the request; preserve unrelated work and comments.
- Ask before changing color-model conventions, palette storage format, URL
  syntax, the embedded X11 data, or deployment configuration.
- Do not delete, rename, or move files, commit, or push unless explicitly asked.
  Confirm the proposed title and body before creating a pull request.
- Check browser behavior when changing interactions or layout; do not claim a
  clipboard or browser check passed unless it was actually verified.
