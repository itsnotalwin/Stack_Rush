'use strict';
/*
 * Panels that sit on top of the title and game-over screens (colour sets, stats, sharing), plus the mode picker,
 * the install strip and the update notice. Loaded after game.js, so it can use everything defined there.
 */
const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const openPanel = id => document.body.classList.add('show-' + id);
const closePanel = id => document.body.classList.remove('show-' + id);
const gameUrl = () => location.origin + location.pathname;
const flashText = (btn, text, back) => { btn.textContent = text; setTimeout(() => (btn.textContent = back), 1800); };
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closePanel(b.dataset.close)));
addEventListener('keydown', e => { if (e.code === 'Escape') ['share', 'stats', 'sets'].forEach(closePanel); });

/* ---------- mode picker (title screen) ---------- */
function syncVariant() {
  document.querySelectorAll('.seg').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.variant === save.variant)));
  ui.modeNote.textContent = MODES[save.variant].note;
  syncRecords();
}
document.querySelectorAll('.seg').forEach(b => b.addEventListener('click', () => {
  save.variant = b.dataset.variant; persist(); syncVariant();
  if (G.mode === 'title') reset({ decor: true });     // the leaning tower behind the title shows this mode's starting width
}));

/* ---------- colour sets ---------- */
function renderSets() {
  const grid = $('setgrid'); grid.replaceChildren();
  SETS.forEach(s => {
    const card = make('button', 'setcard' + (save.set === s.id ? ' on' : '')), prev = make('span', 'prev');
    card.disabled = !setUnlocked(s); prev.style.background = s.tint;
    (s.p || s.preview).forEach((col, i) => {
      const b = make('i'); b.style.width = [46, 52, 58, 52][i] + 'px';
      b.style.background = s.shine ? `linear-gradient(${tint(col, [255, 255, 255], 0.55)}, ${col} 45%, ${tint(col, [0, 0, 0], 0.3)})` : col;
      prev.append(b);
    });
    card.append(prev, make('span', 'nm', s.name), make('span', 'st', save.set === s.id ? 'In use' : setHow(s)));
    card.addEventListener('click', () => { save.set = s.id; persist(); renderSets(); if (G.mode === 'title') reset({ decor: true }); });
    grid.append(card);
  });
}
$('openSets').addEventListener('click', () => { renderSets(); openPanel('sets'); });

/* ---------- stats, achievements and save backup ---------- */
const ACHIEVEMENTS = [
  { name: '10 perfects in a row', done: () => save.streak >= 10 },
  { name: 'Reach level 10', done: () => save.level >= 10 },
  { name: 'Win a gold medal', done: () => goldCount() >= 1 },
  { name: 'Stack 500 blocks in total', done: () => save.blocks >= 500, prog: () => [save.blocks, 500] },
  { name: 'Unlock every colour set', done: () => unlockedIds().length === SETS.length, prog: () => [unlockedIds().length, SETS.length] }
];
function renderStats() {
  const chips = $('statchips'); chips.replaceChildren();
  const rate = save.drops ? Math.round(100 * save.perfects / save.drops) + '%' : '0%';
  [[save.games, 'Games'], [save.blocks, 'Blocks'], [rate, 'Perfect']].forEach(([v, label]) => {
    const d = make('div'); d.append(make('b', '', v), make('span', '', label)); chips.append(d);
  });
  const grid = $('medalgrid'); grid.replaceChildren();
  const first = Math.max(1, Math.min(save.level, 99) - 11);
  for (let lv = first; lv < first + 12; lv++) {       // each tile is coloured by the sky at that level's height
    const sky = skyAt((lv - 1) * LEVEL_LEN), mid = mixArr(sky.top, sky.bot, 0.5), earned = save.medals[lv] || 0;
    const tile = make('div', 'tile' + (lv > save.level ? ' lock' : ''), `Level ${lv}`), dots = make('span', 'd');
    tile.style.background = `rgb(${mid.map(Math.round)})`; tile.style.color = toHex(inkFor(mid));
    for (let n = 1; n <= 3; n++) dots.append(make('i', n <= earned ? 'on' : ''));
    tile.append(dots); grid.append(tile);
  }
  const list = $('achlist'); list.replaceChildren();
  ACHIEVEMENTS.forEach(a => {
    const done = a.done(), row = make('div', 'ach'), body = make('div');
    body.append(make('b', '', a.name));
    if (done) body.append(make('span', '', 'Done'));
    else if (a.prog) {
      const [v, max] = a.prog(), bar = make('div', 'prog'), fill = make('i');
      fill.style.width = Math.min(100, 100 * v / max) + '%'; bar.append(fill);
      body.append(make('span', '', `${v} of ${max}`), bar);
    } else body.append(make('span', '', 'Not yet'));
    row.append(make('span', 'ck' + (done ? ' done' : '')), body); list.append(row);
  });
}
$('openStats').addEventListener('click', () => { renderStats(); openPanel('stats'); });

const CODE_PREFIX = 'SR1:';
const encodeSave = () => CODE_PREFIX + btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(save))));
function decodeSave(code) {
  if (!code.startsWith(CODE_PREFIX)) throw new Error('not a save code');
  const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code.slice(CODE_PREFIX.length).trim()), c => c.charCodeAt(0))));
  if (typeof data !== 'object' || data === null) throw new Error('bad shape');
  return data;
}
function syncAll() { syncSettings(); syncVariant(); syncInstall(); if (G.mode === 'title') reset({ decor: true }); }
function restoreSave(code) {                          // only known fields of the right type are accepted
  const data = decodeSave(code.trim()), next = {};
  for (const key in SAVE_DEFAULTS) if (typeof data[key] === typeof SAVE_DEFAULTS[key]) next[key] = data[key];
  next.medals = Object.fromEntries(Object.entries(data.medals || {}).filter(([k, v]) => Number.isInteger(+k) && [1, 2, 3].includes(v)));
  if (!(next.variant in MODES)) next.variant = 'classic';
  Object.assign(save, next); persist(); syncAll(); renderStats();
}
$('copycode').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(encodeSave()); flashText($('copycode'), 'Copied!', 'Copy save code'); }
  catch { prompt('Copy this save code', encodeSave()); }
});
$('restorecode').addEventListener('click', () => {
  const code = prompt('Paste your save code');
  if (!code) return;
  try { restoreSave(code); flashText($('restorecode'), 'Restored!', 'Restore from code'); }
  catch { flashText($('restorecode'), 'Not a valid code', 'Restore from code'); }
});

/* ---------- sharing ---------- */
const shareText = () => `I stacked ${G.score} blocks (level ${level()}) in Stack Rush!`;
function openShare() {
  const sky = skyAt(G.score), mid = mixArr(sky.top, sky.bot, 0.5);
  const label = save.variant === 'zen' ? 'Zen mode' : `Level ${level()}${G.medalsRun ? `, ${G.medalsRun} ${G.medalsRun === 1 ? 'medal' : 'medals'}` : ''}`;
  drawShareCard($('sharecv'), { score: G.score, label, blocks: G.blocks.slice(-5), top: sky.top.map(Math.round), bot: sky.bot.map(Math.round), ink: toHex(inkFor(mid)) });
  openPanel('share');
}
ui.share.addEventListener('click', openShare);
const cardBlob = () => new Promise(res => $('sharecv').toBlob(res, 'image/png'));
$('sharego').addEventListener('click', async () => {
  const file = new File([await cardBlob()], 'stack-rush-score.png', { type: 'image/png' });
  const data = { title: 'Stack Rush', text: shareText(), url: gameUrl() };
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ ...data, files: [file] });
    else if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); flashText($('sharego'), 'Link copied', 'Share'); }
  } catch {}
});
$('shareimg').addEventListener('click', async () => {
  const url = URL.createObjectURL(await cardBlob()), a = make('a');
  a.href = url; a.download = 'stack-rush-score.png'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});
$('sharecopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${shareText()} ${gameUrl()}`); flashText($('sharecopy'), 'Copied!', 'Copy link'); } catch {}
});

/* ---------- install strip and update notice ---------- */
let installEvent = null;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function syncInstall() {
  const show = !save.installHidden && !isInstalled() && (installEvent || isIOS());
  $('install').hidden = !show; document.body.classList.toggle('has-install', !!show);
  $('installbtn').hidden = !installEvent;
  $('installtext').textContent = installEvent ? 'Install Stack Rush to play offline' : 'Add to Home Screen: tap Share, then Add to Home Screen';
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; syncInstall(); });
addEventListener('appinstalled', () => { installEvent = null; syncInstall(); });
$('installbtn').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt(); await installEvent.userChoice?.catch(() => {}); installEvent = null; syncInstall();
});
$('installx').addEventListener('click', () => { save.installHidden = true; persist(); syncInstall(); });

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) $('toast').hidden = false;   // a newer version is ready
      });
    });
  }).catch(() => {});
}
addEventListener('load', registerWorker);
$('reloadbtn').addEventListener('click', () => location.reload());

syncVariant(); syncInstall();
