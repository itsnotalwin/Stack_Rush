# Stack Rush

One-thumb tower stacker with endless levels. Installable PWA that works offline after the first visit.

## Files
- `index.html`, `style.css`, `game.js`: markup, styling and all game code (no build step).
- `sw.js`: offline cache. `manifest.webmanifest` and `icons/`: install metadata.

## Deploy on GitHub Pages
1. Create a public repo and upload the contents of this folder to the repo root.
2. Settings > Pages > Build and deployment > Deploy from a branch > `main` / `(root)` > Save.
3. Open `https://<your-username>.github.io/<repo-name>/` on your phone, then Add to Home Screen.

All paths are relative, so it works under a repo sub-path. To force every device to refresh its cache, change `V` in `sw.js`.

## How it plays
Every 10 blocks is a new level with a new sky and a faster block. Levels 3, 6, 9... are Pulse levels (speed rises and falls). Levels 5, 10, 15... are Rush levels (faster, bigger width bonus). Each level-up widens the tower a little. Themes loop forever and speed caps around level 18. Best score and best level are saved on the device.

## Tuning
Gameplay constants (block size, level length, speed cap) are at the top of `game.js`. Colours live in the `THEMES` list.
