# Projection Mapper

Single-projector projection mapping for a permanent wall installation.
Boots into Show mode (pure output); deliberate mouse movement or `Esc`
enters Edit mode, which auto-returns to Show after 60s of no input.

A Windows desktop application (Electron). Fully offline — no CDN, no
network calls except the optional LAN remote you switch on yourself.

## Run

```
npm install
npm run dev        # Vite + Electron, with the main process on tsc --watch
npm run start      # build, then run the desktop app
npm run package    # Windows installer + portable exe in release/
```

`npm run dev:web` still serves the renderer alone in a browser, which is
handy for quick UI work — but the desktop-only features (display
targeting, native dialogs, LAN remote, keep-awake) are inert there.

## Installation setup

The **Display** panel is where a deployment gets configured:

- **Output** — pick which physical display is the projector. The window
  moves there; `Match <w> × <h>` adopts its native resolution as the
  project's output size.
- **Fullscreen** — borderless full coverage (`F11`).
- **Keep display awake** — a real `powerSaveBlocker`, so the projector
  does not sleep mid-show.
- **Launch at login** — start the piece when the machine boots.

The window is frameless: drag the top bar to move it, `Ctrl+Q` or the
power button at the right of the top bar to quit. A renderer or GPU crash
reloads the window automatically; only one instance can run at a time.

State lives in `%APPDATA%/projection-mapper/`: `project.json` (autosaved),
`settings.json` (machine config), and `media/` (image and video files).

## Features

- **Surfaces** — corner-pin warp (3×3 homography, projectively correct,
  no diagonal seam) or Catmull-Rom **mesh warp** for non-flat walls.
  Crosshair handles, 1px / 10px / 0.1px keyboard nudges, undo with drag
  coalescing.
- **Masks** — per-surface polygons in UV space with signed-distance
  feather; union and inverted-cut composition.
- **Sources** — six built-in ambient shaders, images, looping video
  (files on disk, streamed over a `media://` protocol), solids,
  gradients. `@param/@color/@toggle` annotations auto-generate
  per-surface controls.
- **Shader editor** — live GLSL recompile (300ms debounce); a compile
  error keeps the last good program on the wall.
- **Scenes & schedule** — named looks with timed crossfades; events at
  fixed or solar times (`sunset-00:30`), sunrise/sunset computed locally.
- **Master** — grand master fader, blackout (`B`), gamma, black lift,
  temperature.
- **Calibration** — `G` cycles grid / checker / per-surface fill /
  outlines + safe area.
- **Reliability** — atomic autosave to disk + recovery screen, WebGL
  context-loss rebuild, crash reload, frame-time watchdog
  (`__pm.renderer.watchdogLog`).

## LAN remote (optional)

Off until you enable it. Switch on "LAN remote" in the Output panel — the
relay starts inside the app and the panel lists the addresses to open on
a phone on the same network, for scene selection, grand master and
blackout. Nothing binds a socket until you ask it to.

## Keys

Press `?` in Edit mode for the full reference. Highlights: `Esc` toggles
Edit/Show, `B` blackout, `G` overlays, `N` new surface, `M` mask edit,
`F` solo, `Tab`/`1–9` select, arrows nudge (`Shift` 10px, `Alt` 0.1px),
`Ctrl+S` save, `Ctrl+Z` undo.

Surfaces and sources export as shareable `.json` snippets (Export
buttons; Import snippet in the top bar).
