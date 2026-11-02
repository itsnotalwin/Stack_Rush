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

## Updating the live site
1. On the repo's main page choose **Add file > Upload files** and drop in the changed files (everything except `icons/` if the icons haven't changed), then commit to `main`. Or copy the files over a local clone and run `git add -A`, `git commit` and `git push`.
2. Wait a minute or two for GitHub Pages to rebuild (see the Actions tab).
3. Open the game, then close it and open it once more: the app downloads the new version in the background and shows it on the next launch. Change `V` in `sw.js` to force every device to refresh.

## How it plays
Every 10 blocks is a new level with a faster block. Levels 3, 6, 9... are Pulse levels (speed rises and falls). Levels 5, 10, 15... are Rush levels (faster, bigger width bonus). Each level-up widens the tower a little. Speed caps around level 18. Best score and best level are saved on the device.

## The sky
The background is a sky that drifts gradually through a day as the tower climbs: it starts as the original cream, then reaches morning, midday, afternoon, golden hour, sunset, dusk, night, deep night, pre-dawn, first light and sunrise, one every 20 blocks, and then the cycle repeats. Block colours and text colours follow the sky so everything stays readable. Stars start to appear from block 100 and fill the sky by block 140 (`STAR_COUNT` sets how many, `NIGHT_STARS` turns them off).

## Medals, second chance and checkpoints
Finishing a level earns a medal from its perfect drops: one for clearing it, two for 6 or more perfects, three for 9 or more. A streak of 10 perfect drops earns a second chance (a small ring beside the level): the next full miss becomes a retry instead of the end. Every 5th level you reach is a checkpoint you can start from; checkpoint runs count toward best level and medals but not best score. Level twists: Rush (levels 5, 10, 15...), Pulse (3, 6, 9...) and Brittle (7, 14, 21...: chops cost extra width).

## Controls and settings
Pause with the button in the top-right corner (or P / Esc). The game also pauses itself when you leave the app. Sound and vibration can be switched off on the title and pause screens, and the choice is remembered. Vibration is hidden on devices that don't support it (iPhone).

## Tuning
Gameplay constants are at the top of `game.js`, and every balance number (speeds, width bonuses, medal thresholds, streak length) is in the `TUNING` table next to the level twists in `MODIFIERS`. In the sky section: `SKY_SPAN` sets how many blocks each sky lasts, `STAGES` holds every sky's colours, and `NIGHT_STARS` turns the stars off. Preview any height with `?level=25` on the game's address; practice runs don't touch your records.
