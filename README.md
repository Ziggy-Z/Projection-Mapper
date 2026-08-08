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

## Features

- **Surfaces** — corner-pin warp (3×3 homography, projectively correct,
  no diagonal seam) or Catmull-Rom **mesh warp** for non-flat walls.
  Crosshair handles, 1px / 10px / 0.1px keyboard nudges, undo with drag
  coalescing.
- **Masks** — per-surface polygons in UV space with signed-distance
  feather; union and inverted-cut composition.
- **Sources** — six built-in ambient shaders, images, looping video
  (blobs in IndexedDB), solids, gradients. `@param/@color/@toggle`
  annotations auto-generate per-surface controls.
- **Shader editor** — live GLSL recompile (300ms debounce); a compile
  error keeps the last good program on the wall.
- **Scenes & schedule** — named looks with timed crossfades; events at
  fixed or solar times (`sunset-00:30`), sunrise/sunset computed locally.
- **Master** — grand master fader, blackout (`B`), gamma, black lift,
  temperature.
- **Calibration** — `G` cycles grid / checker / per-surface fill /
  outlines + safe area.
- **Reliability** — localStorage autosave + recovery screen, WebGL
  context-loss rebuild, screen wake lock, frame-time watchdog
  (`__pm.renderer.watchdogLog`).

## LAN remote (optional)

The core app is fully offline. For phone control on the same network:

```
node server/remote.mjs
```

then enable "LAN remote" in the Output panel and open
`http://<machine>:9270` on a phone — scene selection, grand master,
blackout. The server is a zero-dependency relay, separate from the
static bundle.

## Keys

Press `?` in Edit mode for the full reference. Highlights: `Esc` toggles
Edit/Show, `B` blackout, `G` overlays, `N` new surface, `M` mask edit,
`F` solo, `Tab`/`1–9` select, arrows nudge (`Shift` 10px, `Alt` 0.1px),
`Ctrl+S` save, `Ctrl+Z` undo.

Surfaces and sources export as shareable `.json` snippets (Export
buttons; Import snippet in the Project panel).
