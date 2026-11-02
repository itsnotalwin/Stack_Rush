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
const SQUASH = 0.2;           // how much a block flattens when it lands (0.2 = 20%)
const SQUASH_TIME = 0.16;     // seconds the landing squash lasts
const RESUME_HOLD = 0.6;      // seconds the block stays still after Resume, so you can get ready
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // semitones above C4; a perfect streak climbs this scale
const PRACTICE_LEVEL = Math.min(999, Math.max(1, Math.floor(Number(new URLSearchParams(location.search).get('level'))) || 1));   // ?level=25 starts a practice run there
const PRACTICE = PRACTICE_LEVEL > 1;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Balance numbers live here so tuning never means hunting through the code. */
const TUNING = {
  speedBase: 150, speedPerLevel: 24, speedPerBlock: 3, speedCap: 560,     // block speed in logical px per second
  rushSpeed: 1.2, pulseDepth: 0.35,                                       // twist strengths
  widthBonus: 14, rushWidthBonus: 28,                                     // width given back at each level-up
  regrow: 8, regrowStreak: 3,                                             // a streak of 3+ perfects regrows the block by 8
  brittleCut: 0.06,                                                       // Brittle levels: a chop shaves 6% more off
  medalSilver: 6, medalGold: 9,                                           // perfect drops needed (out of 10) for each medal
  saveStreak: 10,                                                         // perfect streak that earns a second chance
  checkpointEvery: 5                                                      // every 5th level becomes a checkpoint
};
const MODIFIERS = [                                   // level twists: the first match wins, so a level has at most one
  { name: 'Rush',    every: 5, note: 'Faster, with a bigger width bonus' },
  { name: 'Pulse',   every: 3, note: 'Speed rises and falls' },
  { name: 'Brittle', every: 7, note: 'Chops cost extra width' }
];
const modifierOf = lv => MODIFIERS.find(m => lv % m.every === 0)?.name || '';
const modifierNote = name => MODIFIERS.find(m => m.name === name).note;
const medalFor = perfects => (perfects >= TUNING.medalGold ? 3 : perfects >= TUNING.medalSilver ? 2 : 1);

/* ---------- sky: a gradient that drifts through a day as the tower climbs ---------- */
const SKY_SPAN = 20;          // blocks between one sky and the next; the colours blend gradually in between
const NIGHT_STARS = true;     // set to false for a plain gradient at night
const STAR_COUNT = 160;       // stars in the night sky; they switch on one by one as the sky darkens, from block 100
const DARK_INK = '#17120F', LIGHT_INK = '#FBF7EF';
const ACC_ON_LIGHT = '#962B12', ACC_ON_DARK = '#FFB38A';     // accent colour for light skies and for dark skies
const STAGES = [              // top (zenith), bottom (horizon), how many stars show, and the block colours for that sky
  { name: 'Early morning', top: '#ECEFF5', bot: '#F4EFE6', stars: 0,   p: ['#2F6F6A', '#D9A441', '#E8643C', '#6B5B95'] },
  { name: 'Morning',     top: '#CFE2F3', bot: '#FBEFD9', stars: 0,   p: ['#2A6F97', '#E0A030', '#D95D39', '#6F58A8'] },
  { name: 'Midday',      top: '#8EC1EE', bot: '#E3F1FB', stars: 0,   p: ['#2E5E8E', '#D9822B', '#1F7A6B', '#7A4FA0'] },
  { name: 'Afternoon',   top: '#A9C8EC', bot: '#F8E7C2', stars: 0,   p: ['#2F6F6A', '#D9822B', '#B5383A', '#5B4A9B'] },
  { name: 'Golden hour', top: '#C9B8E8', bot: '#FBD3A0', stars: 0,   p: ['#3B5E8C', '#C8671E', '#A8323E', '#5B3F8E'] },
  { name: 'Sunset',      top: '#E7A0C0', bot: '#F9B27A', stars: 0.12,   p: ['#4A3A8A', '#1F7A70', '#A8323E', '#3B4B9B'] },
  { name: 'Dusk',        top: '#2E2A5C', bot: '#5A3A78', stars: 0.6, p: ['#7FD1C7', '#F2C14E', '#FF8A6B', '#B7A6FF'] },
  { name: 'Night',       top: '#0F1430', bot: '#26305E', stars: 1,   p: ['#4FB3A9', '#F2C14E', '#FF7A59', '#9B8CFF'] },
  { name: 'Deep night',  top: '#0A0A1F', bot: '#1B1440', stars: 1,   p: ['#6FE0D0', '#FFD166', '#FF6F91', '#B49CFF'] },
  { name: 'Pre-dawn',    top: '#1E2A5A', bot: '#4A3A7A', stars: 0.8, p: ['#7FD1C7', '#F2C14E', '#FF8A6B', '#B7A6FF'] },
  { name: 'First light', top: '#BFAEE0', bot: '#F7B8A0', stars: 0,   p: ['#2F3E7E', '#A83A5B', '#2F7F7A', '#5B3A8C'] },
  { name: 'Sunrise',     top: '#F6C9C9', bot: '#FDEBC8', stars: 0,   p: ['#2F6F6A', '#D9822B', '#C94A32', '#6B5B95'] }
];                            // after the last one the cycle starts again at the first

const toHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
const parseHex = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
function luminance([r, g, b]) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
STAGES.forEach(s => { s.rgbTop = parseHex(s.top); s.rgbBot = parseHex(s.bot); s.rgbP = s.p.map(parseHex); });
const DARK = parseHex(DARK_INK), LIGHT = parseHex(LIGHT_INK);
const ACC_ON_LIGHT_RGB = parseHex(ACC_ON_LIGHT), ACC_ON_DARK_RGB = parseHex(ACC_ON_DARK);
const mixArr = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const inkFor = bg => (contrast(DARK, bg) >= contrast(LIGHT, bg) ? DARK : LIGHT);   // whichever reads better on this colour

function stageAt(h) {                                    // h = height in blocks (may be fractional)
  const x = h / SKY_SPAN, i = Math.floor(x);
  return [STAGES[i % STAGES.length], STAGES[(i + 1) % STAGES.length], x - i];
}
function skyAt(h) {                                      // the sky colours at a height, blended between two stages
  const [a, b, t] = stageAt(h);
  return { top: mixArr(a.rgbTop, b.rgbTop, t), bot: mixArr(a.rgbBot, b.rgbBot, t), stars: a.stars + (b.stars - a.stars) * t, name: (t < 0.5 ? a : b).name };
}
function paletteAt(h) {                                  // block colours: the nearer stage's set, unless the other one reads clearly better
  const [a, b, t] = stageAt(h), sky = skyAt(h), mid = mixArr(sky.top, sky.bot, 0.5);
  const fit = st => Math.min(...st.rgbP.map(c => contrast(c, mid)));
  return ((t < 0.5 ? fit(a) * 1.15 >= fit(b) : fit(a) > fit(b) * 1.15) ? a : b).p;
}

/* ---------- save data ---------- */
const save = { best: 0, level: 1, blocks: 0, games: 0, sound: true, vibrate: true, medals: {}, checkpoint: 1 };
try { Object.assign(save, JSON.parse(localStorage.getItem('sr-save') || '{}')); } catch {}
const persist = () => { try { localStorage.setItem('sr-save', JSON.stringify(save)); } catch {} };

/* ---------- page elements ---------- */
const $ = id => document.getElementById(id);
const ui = {
  cv: $('cv'), score: $('score'), level: $('lvt'), saveDot: $('savedot'), bar: $('barf'), pop: $('pop'),
  banner: $('banner'), bannerTitle: $('bt'), bannerNote: $('bs'), bannerMedal: $('bm'), bannerCp: $('bc'), bestMedals: $('b3'), bestScore: $('b1'), bestLevel: $('b2'),
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
  second() { [523, 392].forEach((f, i) => this.tone(f, { delay: i * 0.08, len: 0.18 })); },
  levelUp() { [523, 659, 784].forEach((f, i) => this.tone(f, { delay: i * 0.09 })); }
};
const buzz = pattern => { try { if (save.vibrate) navigator.vibrate?.(pattern); } catch {} };

/* ---------- state ---------- */
const G = {
  mode: 'title',                       // 'title' | 'play' | 'over'
  blocks: [], mover: null, debris: [], sparks: [],
  score: 0, combo: 0, perfects: 0, clock: 0, cam: 0, shake: 0, newBest: false, landT: 1, hold: 0,
  saves: 0, levelPerfects: 0, medalsRun: 0, startLevel: 1,
  sky: 0, skyNow: null                  // sky = the height (in blocks) the background has drifted to; it eases toward the score
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

const skyVars = {};
function applySky(s) {                                   // page text and buttons follow the sky, always in the colour that reads best
  const bot = s.bot, mid = mixArr(s.top, s.bot, 0.5), ink = inkFor(mid);
  const vars = { '--bg': toHex(bot), '--ink': toHex(ink), '--mute': toHex(mixArr(ink, bot, 0.32).map(Math.round)), '--acc': toHex(contrast(ACC_ON_LIGHT_RGB, mid) >= contrast(ACC_ON_DARK_RGB, mid) ? ACC_ON_LIGHT_RGB : ACC_ON_DARK_RGB) };
  for (const key in vars) if (skyVars[key] !== vars[key]) { skyVars[key] = vars[key]; rootStyle.setProperty(key, vars[key]); }
}
function refreshSky() {
  const s = skyAt(G.sky);
  G.skyNow = { ...s, top: s.top.map(Math.round), bot: s.bot.map(Math.round) };
  applySky(G.skyNow);
}
const syncMeta = () => document.querySelector('meta[name=theme-color]')?.setAttribute('content', toHex(G.skyNow.top));

/* ---------- rules ---------- */
function speed() {
  const lv = level(), mod = modifierOf(lv);
  let s = TUNING.speedBase + (lv - 1) * TUNING.speedPerLevel + (G.score % LEVEL_LEN) * TUNING.speedPerBlock;
  if (mod === 'Rush') s *= TUNING.rushSpeed;
  if (mod === 'Pulse') s *= 1 + TUNING.pulseDepth * Math.sin(G.clock * 3);
  return Math.min(s, TUNING.speedCap);
}
const perfectTolerance = () => 4 + speed() / 60;      // logical px; grows with speed so fast levels stay fair

function spawnMover() {
  const t = topBlock(), fromLeft = G.blocks.length % 2 === 0;
  G.mover = { x: fromLeft ? 0 : W - t.w, w: t.w, dir: fromLeft ? 1 : -1, col: paletteAt(G.score)[G.blocks.length % 4] };
}

function syncHud() {
  ui.score.textContent = G.score;
  ui.level.textContent = 'Level ' + level();
  ui.bar.style.width = (G.score % LEVEL_LEN) * 100 / LEVEL_LEN + '%';
  ui.saveDot.hidden = G.saves < 1;                    // a small ring appears while a second chance is held
}

const medalTotal = () => Object.values(save.medals).reduce((a, b) => a + b, 0);
function syncRecords() {                              // title and checkpoint buttons follow the saved records
  ui.bestScore.textContent = save.best; ui.bestLevel.textContent = save.level; ui.bestMedals.textContent = medalTotal();
  document.querySelectorAll('.cp').forEach(el => {
    el.hidden = save.checkpoint < TUNING.checkpointEvery;
    el.textContent = `Start at level ${save.checkpoint}`;
  });
}

function reset({ decor = false } = {}) {
  Object.assign(G, {
    blocks: [{ x: (W - MAX_W) / 2, w: MAX_W, col: paletteAt(0)[0] }],
    debris: [], sparks: [], score: 0, combo: 0, perfects: 0, clock: 0, cam: 0, shake: 0, newBest: false, landT: 1, hold: 0,
    saves: 0, levelPerfects: 0, medalsRun: 0, startLevel: 1
  });
  if (decor) {                                        // a small leaning tower behind the title screen
    for (let i = 1; i < 5; i++) {
      const p = G.blocks[i - 1];
      G.blocks.push({ x: p.x + (i % 2 ? 3 : -2), w: p.w - i * 2, col: paletteAt(0)[i % 4] });
    }
  }
  spawnMover(); syncHud();
}

function start(fromLevel = 1) {                      // fromLevel > 1 is a checkpoint run
  sound.unlock(); reset(); setMode('play'); syncMeta();
  const lv = PRACTICE ? PRACTICE_LEVEL : fromLevel;   // ?level=N previews a level and never touches your records
  G.startLevel = lv;
  if (lv > 1) { G.score = (lv - 1) * LEVEL_LEN; G.sky = G.score; spawnMover(); syncHud(); }
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
  const fromStart = G.startLevel === 1;              // checkpoint runs count toward best level and medals, not best score
  G.newBest = !PRACTICE && fromStart && G.score > save.best;
  if (!PRACTICE) {                                    // practice runs never touch your records
    if (fromStart) save.best = Math.max(save.best, G.score);
    save.level = Math.max(save.level, level());
    save.blocks += G.score - (G.startLevel - 1) * LEVEL_LEN; save.games++; persist();
  }
  ui.finalScore.textContent = G.score; ui.finalBest.textContent = save.best; syncRecords();
  ui.newBest.textContent = G.newBest ? 'New best!' : '';
  const medals = G.medalsRun ? `, ${G.medalsRun} ${G.medalsRun === 1 ? 'medal' : 'medals'}` : '';
  ui.stat.textContent = `Level ${level()}, ${G.perfects} perfect ${G.perfects === 1 ? 'drop' : 'drops'}${medals}`;
  ui.share.textContent = 'Share score';
  setTimeout(() => { if (G.mode === 'over') document.body.classList.add('show-over'); }, quit ? 0 : 600);   // let the falling block land first
}

const chunk = (x, w, row, col) => ({ x, w, row, col, drop: 0, vy: 0 });

function drop() {
  if (G.mode !== 'play' || G.hold > 0) return;
  const t = topBlock(), m = G.mover, row = G.blocks.length;
  const left = Math.max(m.x, t.x), overlap = Math.min(m.x + m.w, t.x + t.w) - left;
  if (overlap <= 0) {                                 // a clean miss
    G.debris.push(chunk(m.x, m.w, row, m.col));
    if (G.saves < 1) { end(); return; }
    G.saves--; G.combo = 0; spawnMover(); syncHud();  // a second chance turns the miss into a retry
    ui.pop.textContent = 'Second chance used'; flashClass(ui.pop, 900); sound.second(); buzz([20, 30, 20]);
    return;
  }
  if (Math.abs(m.x - t.x) < perfectTolerance()) landPerfect(m, t, row);
  else landChopped(m, t, row, left, overlap);
  G.blocks.push({ x: m.x, w: m.w, col: m.col });
  G.score++; G.landT = 0;
  if (G.score % LEVEL_LEN === 0) levelUp();
  syncHud(); spawnMover();
}

function landPerfect(m, t, row) {
  G.combo++; G.perfects++; G.levelPerfects++; m.x = t.x;
  if (G.combo >= TUNING.regrowStreak && m.w < MAX_W) { m.w = Math.min(MAX_W, m.w + TUNING.regrow); m.x = Math.min(m.x, W - m.w); }   // streaks regrow the block
  burst(m.x + m.w / 2, rowY(row) + BLOCK_H / 2, 14, m.col);
  if (G.combo % TUNING.saveStreak === 0 && G.saves < 1) { G.saves = 1; ui.pop.textContent = 'Second chance ready'; sound.second(); }
  else { ui.pop.textContent = 'Perfect x' + G.combo; sound.land(G.combo); }
  flashClass(ui.pop, 700); buzz(15);
}

function landChopped(m, t, row, left, overlap) {
  G.combo = 0;
  const cutX = m.x < t.x ? m.x : t.x + t.w, cutW = m.x < t.x ? t.x - m.x : m.x + m.w - (t.x + t.w);
  G.debris.push(chunk(cutX, cutW, row, m.col));
  m.x = left; m.w = overlap;
  if (modifierOf(level()) === 'Brittle') { const cut = m.w * TUNING.brittleCut; m.x += cut / 2; m.w -= cut; }   // Brittle levels: chops cost extra
  sound.land(0); buzz(8);
}

function levelUp() {
  const lv = level(), done = lv - 1, mod = modifierOf(lv), t = topBlock();
  const w = Math.min(MAX_W, t.w + (mod === 'Rush' ? TUNING.rushWidthBonus : TUNING.widthBonus));   // reward: a wider tower
  t.x = Math.min(Math.max(0, t.x - (w - t.w) / 2), W - w); t.w = w;
  const medal = medalFor(G.levelPerfects);            // medal for the level just finished, from its perfect drops
  G.medalsRun += medal; G.levelPerfects = 0;
  const checkpoint = !PRACTICE && lv % TUNING.checkpointEvery === 0 && lv > save.checkpoint;
  if (!PRACTICE) {
    save.medals[done] = Math.max(save.medals[done] || 0, medal);
    if (checkpoint) save.checkpoint = lv;
    persist(); syncRecords();
  }
  for (let i = 0; i < 3; i++) burst(W / 2, rowY(G.blocks.length - 1), 14, paletteAt(G.score)[i]);
  sound.levelUp(); buzz([20, 30, 20]);
  ui.bannerTitle.textContent = 'Level ' + lv;
  ui.bannerNote.textContent = mod ? `${mod}: ${modifierNote(mod)}` : G.skyNow.name;
  const label = document.createElement('span'), dots = document.createElement('span');
  label.textContent = `Level ${done} medal`; dots.className = 'dots';
  dots.append(...[1, 2, 3].map(n => { const d = document.createElement('i'); if (n <= medal) d.className = 'on'; return d; }));
  ui.bannerMedal.replaceChildren(label, dots);
  ui.bannerCp.textContent = checkpoint ? `Checkpoint saved: you can start at level ${lv}` : '';
  flashClass(ui.banner, 2000);
}

function burst(x, y, n, col) {
  for (let i = 0; i < n; i++) G.sparks.push({ x, y, col, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 260, life: 0.5 });
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
  const gap = G.score - G.sky;                         // the sky glides toward the current height, faster when it is far behind
  G.sky += gap * Math.min(1, dt * (1.5 + Math.abs(gap) * 0.25));
  refreshSky();
  for (const d of G.debris) { d.vy += 1400 * dt; d.drop += d.vy * dt; }
  for (const s of G.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 800 * dt; s.life -= dt; }
  G.debris = G.debris.filter(d => d.drop < V.H);
  G.sparks = G.sparks.filter(s => s.life > 0);
  G.shake = G.shake > 0.3 ? G.shake * Math.pow(0.01, dt) : 0;
}

/* ---------- drawing: flat blocks on a transparent canvas (the page colour shows through) ---------- */
let seed = 7;                                            // fixed seed: the stars sit in the same places on every launch
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const STAR_TINTS = [LIGHT_INK, LIGHT_INK, LIGHT_INK, '#C9DAFF', '#FFE6BF'];   // mostly white, some cool and some warm
const STARS = Array.from({ length: STAR_COUNT }, (_, i) => {
  const big = i < Math.round(STAR_COUNT * 0.11);       // the first few are the bright ones: bigger, and the first to appear
  return {
    u: rand(), v: rand(), s: big ? 2.6 + rand() * 1.4 : 1.2 + rand() * 1.3, par: 0.06 + rand() * 0.3,   // par = depth: near stars drift faster
    ph: rand() * 6.28, sp: 0.8 + rand() * 1.6, at: big ? rand() * 0.15 : 0.1 + rand() * 0.75, c: STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)]
  };
});

function drawSky() {
  const { top, bot, stars } = G.skyNow, w = ui.cv.width, h = ui.cv.height;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `rgb(${top})`); grad.addColorStop(1, `rgb(${bot})`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  if (!NIGHT_STARS || stars < 0.01) return;
  for (const o of STARS) {                             // each star fades in once the sky is dark enough, then drifts down as you climb
    const k = Math.min(1, Math.max(0, (stars - o.at) / 0.15));
    if (k === 0) continue;
    ctx.globalAlpha = k * (REDUCED_MOTION ? 0.7 : 0.3 + 0.6 * Math.sin(G.clock * o.sp + o.ph) ** 2);
    ctx.fillStyle = o.c;
    ctx.fillRect(o.u * w, (o.v * h + G.cam * BLOCK_H * V.S * o.par) % h, o.s * V.S, o.s * V.S);
  }
  ctx.globalAlpha = 1;
}

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
  drawSky();
  const jx = (Math.random() - 0.5) * G.shake, jy = (Math.random() - 0.5) * G.shake;
  ctx.setTransform(V.S, 0, 0, V.S, (V.ox + jx) * V.S, jy * V.S);
  const last = G.blocks.length - 1;
  G.blocks.forEach((b, i) => drawBlock(b.x, rowY(i), b.w, b.col, i === last ? landSquash() : 1));
  if (G.mode === 'play') drawBlock(G.mover.x, rowY(G.blocks.length), G.mover.w, G.mover.col);
  for (const d of G.debris) drawBlock(d.x, rowY(d.row) + d.drop, d.w, d.col);
  for (const s of G.sparks) { ctx.globalAlpha = Math.min(1, s.life * 2); ctx.fillStyle = s.col; ctx.fillRect(s.x, s.y, 4, 4); }
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
$('title').addEventListener('click', e => { if (!e.target.closest('.toggle, .pill')) start(); });
$('again').addEventListener('click', () => start());
document.querySelectorAll('.cp').forEach(el => el.addEventListener('click', () => start(save.checkpoint)));
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

syncSettings(); fit(); reset({ decor: true }); refreshSky(); syncMeta(); setMode('title');
syncRecords();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
