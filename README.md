# Little Paint

A dependency-free paint app built with HTML, CSS, and JavaScript.

## Open the app

Open `dist/index.html` in a modern browser, or run `node serve.mjs` and visit `http://127.0.0.1:5173`.

## Features

- Brush, eraser, area fill, line, rectangle, and ellipse tools.
- 18 palette colors, a custom color picker, and editable hex colors.
- Brush sizes from 1–80 pixels, with quick presets.
- Undo and redo (up to 19 changes), reversible clear, and PNG export.
- Mouse, touch, and pen input, with keyboard shortcuts listed in the app.
- A resolution dropdown with 600 × 800, 1200 × 800 (default), and 1920 × 1200 canvases.
- Resolution changes scale the drawing proportionally to fit, centered on a white background. Undo restores the original size and pixels. Downloads use the selected resolution.

Drawings live in the current tab's memory. Save a PNG before closing or refreshing the app. The initial canvas guidance is an HTML overlay and is never part of the downloaded image.

## Project record

See `PROJECT_LOG.md` for the user's prompts, implementation details, and verification results.

## Verification

Run `node --test tests/paint.test.mjs` for focused code-level checks. These use a small test adapter and do not replace real browser checks of rendering, input, and downloads.

## Files

- `dist/index.html` — app interface and metadata.
- `dist/styles.css` — responsive layout and styling.
- `dist/app.js` — canvas interactions and app behavior.
- `serve.mjs` — optional local preview server; no dependencies required.
- `.openai/hosting.json` — Sites identity and static hosting settings.
