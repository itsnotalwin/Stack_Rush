# Stack Rush

One-thumb tower stacking game. Installable PWA that works offline after the first visit.

## Deploy on GitHub Pages
1. Create a repo and upload the contents of this folder to the repo root (include `.nojekyll`).
2. Settings > Pages > Build and deployment > Deploy from a branch > `main` / `/ (root)` > Save.
3. Open `https://<your-username>.github.io/<repo-name>/` on your phone, then Add to Home Screen.

All paths are relative, so it works under a repo sub-path. To force an update on every device, change `V` in `sw.js`.

## How it plays
Every 10 blocks is a new level with a new colour theme and a faster block. Level 3, 6, 9... are Pulse levels (speed rises and falls) and levels 5, 10, 15... are Rush levels (faster, bigger width bonus). Each level-up widens your tower a little. Themes loop forever, speed caps at level 18, and best score and best level are saved on the device.
