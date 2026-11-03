# Changelog

## 1.4
- Colour sets that unlock through play (levels reached and medals collected), picked from the title screen. Auto follows the sky; Bronze, Silver and Shiny gold are metallic sets with a moving glint. `UNLOCK_ALL` in `sets.js` opens everything.
- Modes: Classic, Zen (constant speed, no twists, its own best score) and Hard (starts narrow).
- Stats screen: totals, a medal tile for every level coloured by its sky, achievements, and a save backup you can copy and restore.
- A moon and the occasional shooting star in the night sky.

## 1.3
- Share card: a score image you can share, save or copy as a link.
- Install strip on the title screen (Add to Home Screen hint on iPhone) and a "New version ready" notice when an update has downloaded.

## 1.2
- Level medals: one to three per level, based on perfect drops. Your best medal per level is saved.
- Second chance: a streak of 10 perfect drops lets your next full miss become a retry.
- Checkpoints every 5th level, with a "Start at level N" button. Checkpoint runs count toward best level and medals, not best score.
- New level twist, Brittle (levels 7, 14, ...): chops cost extra width.
- All balance numbers moved into one `TUNING` table in `game.js`.

## 1.1.2
- A much fuller night sky: 160 stars, switching on from block 100.

## 1.1.1
- The background is now a sky that drifts gradually through a day, one stage every 20 blocks.

## 1.1
- Pause button (and P / Esc, and automatic pause when you leave the app).
- Sound and vibration toggles, remembered between visits.
- Landing squash and musical perfect streaks.

## 1.0
- One-thumb tower stacker with levels every 10 blocks, Pulse and Rush twists, and a cream, flat look.
- Installable and works offline (service worker, manifest, icons), ready for GitHub Pages.
