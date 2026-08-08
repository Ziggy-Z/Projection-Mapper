# Projection Mapper

Single-projector projection mapping for a permanent wall installation.
Boots into Show mode (pure output); deliberate mouse movement or `Esc`
enters Edit mode, which auto-returns to Show after 60s of no input.

## Run

```
npm install
npm run dev        # development server
npm run build      # static bundle in dist/ — fully offline, no CDN
```

Deployment target is Chromium in kiosk mode pointed at the built bundle,
for example:

```
chromium --kiosk --noerrdialogs --disable-session-crashed-bubble http://localhost:8080
```

(Serve `dist/` with any static server, or open `dist/index.html` from disk.)

## Keys

Press `?` in Edit mode for the full reference. Highlights: `Esc` toggles
Edit/Show, `B` blackout, `G` cycles calibration overlays (grid, checker),
arrows nudge the selected corner 1px (`Shift` 10px, `Alt` 0.1px),
`Ctrl+S` saves the project file, `Ctrl+Z` undoes.

The project autosaves to `localStorage` (debounced 1s) and restores on
boot. `__pm.renderer.debugLoseContext()` in the console simulates a GPU
reset to verify context-loss recovery.

## Status

Phase 0 (core render pipeline) — corner-pin warp via 3×3 homography with
homogeneous texture coordinates (no diagonal seam), one shader surface,
master pass (black lift, temperature, gamma, grand master), Show/Edit
modes, save/load/autosave, context-loss recovery.
