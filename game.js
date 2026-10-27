'use strict';
/*
 * Stack Rush: a one-thumb tower stacker.
 * Sections: config, themes, save data, sound, state, rules, drawing, input and boot.
 * Plain top-level script (no build step), so every piece can be inspected from the browser console.
 */

/* ---------- config ---------- */
const W = 400;                // logical width of the play field; the height follows the screen
const MIN_H = 640;            // logical height the layout is designed for
const BLOCK_H = 28;
const MAX_W = 160;            // starting and maximum block width
const LEVEL_LEN = 10;         // blocks per level
const VIEW_ROWS = 6;          // tower rows kept on screen below the swinging block
const BASE_Y = 130;           // gap between the screen bottom and the base block
const SPEED_CAP = 560;
const SQUASH = 0.2;           // how much a block flattens when it lands (0.2 = 20%)
const SQUASH_TIME = 0.16;     // seconds the landing squash lasts
const RESUME_HOLD = 0.6;      // seconds the block stays still after Resume, so you can get ready
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // semitones above C4; a perfect streak climbs this scale
const THEME_PER_LEVEL = true; // set to false to keep the first (cream) theme for every level
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MODIFIERS = { Pulse: 'Speed rises and falls', Rush: 'Faster, with a bigger width bonus' };
const modifierOf = lv => (lv % 5 === 0 ? 'Rush' : lv % 3 === 0 ? 'Pulse' : '');

/* ---------- themes: flat colours, one per level, then looping ---------- */
const THEMES = [
  { name: 'Dawn',   bg: '#F4EFE6', ink: '#1E1B18', mute: '#5F574E', acc: '#B8401B', p: ['#2F6F6A', '#D9A441', '#E8643C', '#6B5B95'] },
  { name: 'Mint',   bg: '#E3F1EA', ink: '#12261E', mute: '#3F5A4E', acc: '#A63A14', p: ['#1F7A5A', '#E0A82E', '#D4543A', '#3B6EA5'] },
  { name: 'Sky',    bg: '#E4EEF8', ink: '#14202E', mute: '#435569', acc: '#B0381A', p: ['#2B5F9E', '#F2B134', '#E4572E', '#2A9D8F'] },
  { name: 'Sunset', bg: '#F8E7DA', ink: '#2B1A14', mute: '#6A4A3C', acc: '#A8321E', p: ['#C2452D', '#E9A23B', '#7A3E6B', '#2F6F6A'] },
  { name: 'Dusk',   bg: '#1C2233', ink: '#F2EEE6', mute: '#B7BDCC', acc: '#FF9A6B', p: ['#4FB3A9', '#F2C14E', '#FF7A59', '#9B8CFF'] },
  { name: 'Ember',  bg: '#221513', ink: '#F6E9DD', mute: '#C9B5A6', acc: '#FFB04A', p: ['#FF6B4A', '#FFC857', '#E2506B', '#8AD6C4'] }
];

/* ---------- save data ---------- */
const save = { best: 0, level: 1, blocks: 0, games: 0, sound: true, vibrate: true };
try { Object.assign(save, JSON.parse(localStorage.getItem('sr-save') || '{}')); } catch {}
const persist = () => { try { localStorage.setItem('sr-save', JSON.stringify(save)); } catch {} };

/* ---------- page elements ---------- */
const $ = id => document.getElementById(id);
const ui = {
  cv: $('cv'), score: $('score'), level: $('lv'), bar: $('barf'), pop: $('pop'),
  banner: $('banner'), bannerTitle: $('bt'), bannerNote: $('bs'), bestScore: $('b1'), bestLevel: $('b2'),
  finalScore: $('fs'), newBest: $('nb'), stat: $('stat'), finalBest: $('fb'), share: $('share'),
  pauseBtn: $('pausebtn'), resume: $('resume'), endRun: $('endrun'), pauseStat: $('pstat')
};
const ctx = ui.cv.getContext('2d');
const rootStyle = document.documentElement.style;
const timers = new WeakMap();
function flashClass(el, ms) {
  el.classList.add('show');
  clearTimeout(timers.get(el));
  timers.set(el, setTimeout(() => el.classList.remove('show'), ms));
}

/* ---------- sound and haptics (both fail silently where unsupported) ---------- */
const sound = {
  ctx: null,
  unlock() {
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {}
  },
  tone(freq, { type = 'triangle', len = 0.2, gain = 0.15, delay = 0 } = {}) {
    const c = this.ctx;
    if (!c || !save.sound) return;
    const t = c.currentTime + delay, osc = c.createOscillator(), vol = c.createGain();
    osc.type = type; osc.frequency.value = freq;
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.linearRampToValueAtTime(gain, t + 0.01);          // short attack avoids clicks
    vol.gain.exponentialRampToValueAtTime(0.001, t + len);
    osc.connect(vol).connect(c.destination); osc.start(t); osc.stop(t + len);
  },
  land(combo) {
    if (!combo) return this.tone(196, { len: 0.18 });                       // a chop: one low, soft note
    const f = 261.63 * 2 ** (PENTATONIC[Math.min(combo - 1, PENTATONIC.length - 1)] / 12);
    this.tone(f); this.tone(f * 2, { gain: 0.04, len: 0.15 });              // the note plus a quiet octave, like a chime
  },
  fail() { this.tone(110, { type: 'sawtooth', len: 0.35 }); },
  levelUp() { [523, 659, 784].forEach((f, i) => this.tone(f, { delay: i * 0.09 })); }
};
const buzz = pattern => { try { if (save.vibrate) navigator.vibrate?.(pattern); } catch {} };

/* ---------- state ---------- */
const G = {
  mode: 'title',                       // 'title' | 'play' | 'over'
  blocks: [], mover: null, debris: [], sparks: [],
  score: 0, combo: 0, perfects: 0, clock: 0, cam: 0, shake: 0, newBest: false, landT: 1, hold: 0,
  theme: THEMES[0]
};
const V = { S: 1, H: MIN_H, ox: 0 };                 // canvas scale, logical height, left offset that centres the field
const level = () => Math.floor(G.score / LEVEL_LEN) + 1;
const topBlock = () => G.blocks[G.blocks.length - 1];
const rowY = row => V.H - BASE_Y - (row - G.cam) * BLOCK_H;   // top edge of a tower row

function fit() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  ui.cv.width = Math.round(innerWidth * dpr);
  ui.cv.height = Math.round(innerHeight * dpr);
  V.S = Math.min(ui.cv.width / W, ui.cv.height / MIN_H);
  V.H = ui.cv.height / V.S;
  V.ox = (ui.cv.width / V.S - W) / 2;
}

function setMode(mode) {
  G.mode = mode;
  document.body.dataset.mode = mode;
  document.body.classList.remove('show-over');
}

function setTheme(t) {
  G.theme = t;
  rootStyle.setProperty('--bg', t.bg); rootStyle.setProperty('--ink', t.ink);
  rootStyle.setProperty('--mute', t.mute); rootStyle.setProperty('--acc', t.acc);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg);
}

/* ---------- rules ---------- */
function speed() {
  const lv = level(), mod = modifierOf(lv);
  let s = 150 + (lv - 1) * 24 + (G.score % LEVEL_LEN) * 3;
  if (mod === 'Rush') s *= 1.2;
  if (mod === 'Pulse') s *= 1 + 0.35 * Math.sin(G.clock * 3);
  return Math.min(s, SPEED_CAP);
}
const perfectTolerance = () => 4 + speed() / 60;      // logical px; grows with speed so fast levels stay fair

function spawnMover() {
  const t = topBlock(), fromLeft = G.blocks.length % 2 === 0;
  G.mover = { x: fromLeft ? 0 : W - t.w, w: t.w, dir: fromLeft ? 1 : -1, col: G.theme.p[G.blocks.length % 4] };
}

function syncHud() {
  ui.score.textContent = G.score;
  ui.level.textContent = 'Level ' + level();
  ui.bar.style.width = (G.score % LEVEL_LEN) * 100 / LEVEL_LEN + '%';
}

function reset({ decor = false } = {}) {
  setTheme(THEMES[0]);
  Object.assign(G, {
    blocks: [{ x: (W - MAX_W) / 2, w: MAX_W, col: G.theme.p[0] }],
    debris: [], sparks: [], score: 0, combo: 0, perfects: 0, clock: 0, cam: 0, shake: 0, newBest: false, landT: 1, hold: 0
  });
  if (decor) {                                        // a small leaning tower behind the title screen
    for (let i = 1; i < 5; i++) {
      const p = G.blocks[i - 1];
      G.blocks.push({ x: p.x + (i % 2 ? 3 : -2), w: p.w - i * 2, col: G.theme.p[i % 4] });
    }
  }
  spawnMover(); syncHud();
}

function start() {
  sound.unlock(); reset(); setMode('play');
  ui.banner.classList.remove('show');
}

function pause() {
  if (G.mode !== 'play') return;
  ui.pauseStat.textContent = `Score ${G.score}, level ${level()}`;
  setMode('pause');
}

function resume() {
  if (G.mode !== 'pause') return;
  setMode('play'); G.hold = RESUME_HOLD;
}

function end({ quit = false } = {}) {                 // quit = the player chose to end the run from the pause screen
  setMode('over');
  G.shake = REDUCED_MOTION || quit ? 0 : 14;
  if (!quit) { buzz([40, 40, 80]); sound.fail(); }
  G.newBest = G.score > save.best;
  save.best = Math.max(save.best, G.score); save.level = Math.max(save.level, level());
  save.blocks += G.score; save.games++; persist();
  ui.finalScore.textContent = G.score; ui.finalBest.textContent = save.best;
  ui.bestScore.textContent = save.best; ui.bestLevel.textContent = save.level;
  ui.newBest.textContent = G.newBest ? 'New best!' : '';
  ui.stat.textContent = `Level ${level()}, ${G.perfects} perfect ${G.perfects === 1 ? 'drop' : 'drops'}`;
  ui.share.textContent = 'Share score';
  setTimeout(() => { if (G.mode === 'over') document.body.classList.add('show-over'); }, quit ? 0 : 600);   // let the falling block land first
}

const chunk = (x, w, row, col) => ({ x, w, row, col, drop: 0, vy: 0 });

function drop() {
  if (G.mode !== 'play' || G.hold > 0) return;
  const t = topBlock(), m = G.mover, row = G.blocks.length;
  const left = Math.max(m.x, t.x), overlap = Math.min(m.x + m.w, t.x + t.w) - left;
  if (overlap <= 0) { G.debris.push(chunk(m.x, m.w, row, m.col)); end(); return; }   // clean miss
  if (Math.abs(m.x - t.x) < perfectTolerance()) landPerfect(m, t, row);
  else landChopped(m, t, row, left, overlap);
  G.blocks.push({ x: m.x, w: m.w, col: m.col });
  G.score++; G.landT = 0;
  if (G.score % LEVEL_LEN === 0) levelUp();
  syncHud(); spawnMover();
}

function landPerfect(m, t, row) {
  G.combo++; G.perfects++; m.x = t.x;
  if (G.combo >= 3 && m.w < MAX_W) { m.w = Math.min(MAX_W, m.w + 8); m.x = Math.min(m.x, W - m.w); }   // streaks regrow the block
  burst(m.x + m.w / 2, rowY(row) + BLOCK_H / 2, 14);
  ui.pop.textContent = 'Perfect x' + G.combo; flashClass(ui.pop, 600);
  sound.land(G.combo); buzz(15);
}

function landChopped(m, t, row, left, overlap) {
  G.combo = 0;
  const cutX = m.x < t.x ? m.x : t.x + t.w, cutW = m.x < t.x ? t.x - m.x : m.x + m.w - (t.x + t.w);
  G.debris.push(chunk(cutX, cutW, row, m.col));
  m.x = left; m.w = overlap;
  sound.land(0); buzz(8);
}

function levelUp() {
  const lv = level(), mod = modifierOf(lv), t = topBlock();
  const w = Math.min(MAX_W, t.w + (mod === 'Rush' ? 28 : 14));           // reward: a wider tower
  setTheme(THEMES[THEME_PER_LEVEL ? (lv - 1) % THEMES.length : 0]);
  t.x = Math.min(Math.max(0, t.x - (w - t.w) / 2), W - w); t.w = w;
  for (let i = 0; i < 3; i++) burst(W / 2, rowY(G.blocks.length - 1), 14);
  sound.levelUp(); buzz([20, 30, 20]);
  ui.bannerTitle.textContent = 'Level ' + lv;
  ui.bannerNote.textContent = mod ? `${mod}: ${MODIFIERS[mod]}` : G.theme.name;
  flashClass(ui.banner, 1600);
}

function burst(x, y, n) {
  for (let i = 0; i < n; i++) G.sparks.push({ x, y, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 260, life: 0.5 });
}

async function shareScore() {
  const text = `I stacked ${G.score} blocks (level ${level()}) in Stack Rush!`;
  try {
    if (navigator.share) await navigator.share({ title: 'Stack Rush', text, url: location.href });
    else { await navigator.clipboard.writeText(`${text} ${location.href}`); ui.share.textContent = 'Copied!'; }
  } catch {}
}

/* ---------- per-frame update ---------- */
function update(dt) {
  if (G.mode === 'pause') return;                     // everything freezes while paused
  G.clock += dt; G.landT += dt; G.hold = Math.max(0, G.hold - dt);
  if (G.mode === 'play' && G.hold === 0) {
    const m = G.mover;
    m.x += m.dir * speed() * dt;
    if (m.x < 0) { m.x = 0; m.dir = 1; } else if (m.x + m.w > W) { m.x = W - m.w; m.dir = -1; }
  }
  G.cam += (Math.max(0, G.blocks.length - VIEW_ROWS) - G.cam) * Math.min(1, dt * 5);
  for (const d of G.debris) { d.vy += 1400 * dt; d.drop += d.vy * dt; }
  for (const s of G.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 800 * dt; s.life -= dt; }
  G.debris = G.debris.filter(d => d.drop < V.H);
  G.sparks = G.sparks.filter(s => s.life > 0);
  G.shake = G.shake > 0.3 ? G.shake * Math.pow(0.01, dt) : 0;
}

/* ---------- drawing: flat blocks on a transparent canvas (the page colour shows through) ---------- */
function rrect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const landSquash = () => (REDUCED_MOTION ? 1 : 1 - SQUASH * Math.max(0, 1 - G.landT / SQUASH_TIME) ** 2);

function drawBlock(x, y, w, col, squash = 1) {          // squash < 1 flattens the block and widens it a touch, anchored at its base
  if (w <= 0 || y > V.H || y < -BLOCK_H) return;
  const h = (BLOCK_H - 3) * squash, grow = (1 - squash) * w * 0.25;
  ctx.fillStyle = col; rrect(x - grow / 2, y + (BLOCK_H - 3) - h, w + grow, h, 6); ctx.fill();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ui.cv.width, ui.cv.height);
  const jx = (Math.random() - 0.5) * G.shake, jy = (Math.random() - 0.5) * G.shake;
  ctx.setTransform(V.S, 0, 0, V.S, (V.ox + jx) * V.S, jy * V.S);
  const last = G.blocks.length - 1;
  G.blocks.forEach((b, i) => drawBlock(b.x, rowY(i), b.w, b.col, i === last ? landSquash() : 1));
  if (G.mode === 'play') drawBlock(G.mover.x, rowY(G.blocks.length), G.mover.w, G.mover.col);
  for (const d of G.debris) drawBlock(d.x, rowY(d.row) + d.drop, d.w, d.col);
  ctx.fillStyle = G.theme.p[2];
  for (const s of G.sparks) { ctx.globalAlpha = Math.min(1, s.life * 2); ctx.fillRect(s.x, s.y, 4, 4); }
  ctx.globalAlpha = 1;
}

/* ---------- input and boot ---------- */
ui.cv.addEventListener('pointerdown', e => { e.preventDefault(); drop(); });
addEventListener('keydown', e => {
  if (e.code === 'Space' && G.mode === 'play') { e.preventDefault(); drop(); }
  else if (e.code === 'KeyP' || e.code === 'Escape') { if (G.mode === 'play') pause(); else if (G.mode === 'pause') resume(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });   // leaving the app pauses the run
ui.pauseBtn.addEventListener('click', pause);
ui.resume.addEventListener('click', resume);
ui.endRun.addEventListener('click', () => end({ quit: true }));
$('title').addEventListener('click', e => { if (!e.target.closest('.toggle')) start(); });
$('again').addEventListener('click', start);
ui.share.addEventListener('click', shareScore);

/* settings: the same toggle buttons appear on the title and pause screens */
const SETTING_LABELS = { sound: ['Sound on', 'Sound off'], vibrate: ['Vibration on', 'Vibration off'] };
function syncSettings() {
  document.querySelectorAll('.toggle').forEach(el => {
    const key = el.dataset.setting;
    el.textContent = SETTING_LABELS[key][save[key] ? 0 : 1];
    el.setAttribute('aria-pressed', save[key]);
    if (key === 'vibrate') el.hidden = !('vibrate' in navigator);   // iPhones have no vibration API
  });
}
document.querySelectorAll('.toggle').forEach(el => el.addEventListener('click', () => {
  const key = el.dataset.setting;
  save[key] = !save[key]; persist(); syncSettings();
  if (key === 'sound') { sound.unlock(); sound.tone(440); }       // a short tone confirms sound is on
  else buzz(20);
}));
addEventListener('resize', fit);

let lastTime = 0;
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);   // capped so a backgrounded tab never causes a jump
  lastTime = now;
  update(dt); render();
  requestAnimationFrame(frame);
}

syncSettings(); fit(); reset({ decor: true }); setMode('title');
ui.bestScore.textContent = save.best; ui.bestLevel.textContent = save.level;
requestAnimationFrame(frame);
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
