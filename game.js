'use strict';
/*
 * Stack Rush: a one-thumb tower stacker.
 * Sections: config, themes, save data, sound, state, rules, effects, drawing, input and boot.
 * Plain top-level script (no build step), so every piece can be inspected from the browser console.
 */

/* ---------- config ---------- */
const W = 400;                // logical width of the play field; the height follows the screen
const MIN_H = 640;            // logical height the layout is designed for
const BLOCK_H = 28;
const MAX_W = 160;            // starting and maximum block width
const LEVEL_LEN = 10;         // blocks per level
const VIEW_ROWS = 6;          // tower rows kept on screen below the swinging block
const BASE_Y = 150;           // gap between the screen bottom and the base block
const SPEED_CAP = 560;
const RING_LIFE = 0.45;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MODIFIERS = { Pulse: 'Speed rises and falls', Rush: 'Faster, with a bigger width bonus' };
const modifierOf = lv => (lv % 5 === 0 ? 'Rush' : lv % 3 === 0 ? 'Pulse' : '');
const smooth = k => k * k * (3 - 2 * k);

/* ---------- themes: one per level, climbing from dawn to night, then looping ---------- */
const THEMES = [
  { name: 'Dawn',   top: '#F8D3D8', bot: '#F2EEFA', ink: '#241B33', mute: '#5E5370', acc: '#A82A42', orb: '#FF9F7A', night: false, p: ['#2F6F6A', '#D9A441', '#E8643C', '#6B5B95'] },
  { name: 'Mint',   top: '#C9ECDD', bot: '#EAF6F0', ink: '#12261E', mute: '#3F5A4E', acc: '#A63A14', orb: '#FFF4C2', night: false, p: ['#1F7A5A', '#E0A82E', '#D4543A', '#3B6EA5'] },
  { name: 'Sky',    top: '#BBD6F4', bot: '#E9F2FB', ink: '#14202E', mute: '#435569', acc: '#9A2E14', orb: '#FFFFFF', night: false, p: ['#2B5F9E', '#F2B134', '#E4572E', '#2A9D8F'] },
  { name: 'Sunset', top: '#F6C7A6', bot: '#FBEDE0', ink: '#2B1A14', mute: '#6A4A3C', acc: '#982A16', orb: '#E8643C', night: false, p: ['#C2452D', '#E9A23B', '#7A3E6B', '#2F6F6A'] },
  { name: 'Dusk',   top: '#34386A', bot: '#1C2233', ink: '#F2EEE6', mute: '#B7BDCC', acc: '#FF9A6B', orb: '#F2EEE6', night: true,  p: ['#4FB3A9', '#F2C14E', '#FF7A59', '#9B8CFF'] },
  { name: 'Ember',  top: '#43241D', bot: '#1A0F0D', ink: '#F6E9DD', mute: '#C9B5A6', acc: '#FFB04A', orb: '#FFB04A', night: true,  p: ['#FF6B4A', '#FFC857', '#E2506B', '#8AD6C4'] }
];
const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
THEMES.forEach(t => { t.rgbTop = hexToRgb(t.top); t.rgbBot = hexToRgb(t.bot); });
const mixRgb = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;

/* ---------- save data ---------- */
const save = { best: 0, level: 1, blocks: 0, games: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem('sr-save') || '{}')); } catch {}
const persist = () => { try { localStorage.setItem('sr-save', JSON.stringify(save)); } catch {} };

/* ---------- page elements ---------- */
const $ = id => document.getElementById(id);
const ui = {
  cv: $('cv'), score: $('score'), level: $('lv'), bar: $('barf'), pop: $('pop'),
  banner: $('banner'), bannerTitle: $('bt'), bannerNote: $('bs'), bestScore: $('b1'), bestLevel: $('b2'),
  finalScore: $('fs'), newBest: $('nb'), finalLevel: $('fl'), finalPerfects: $('fp'), finalBest: $('fb'),
  again: $('again'), share: $('share')
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
    if (!c) return;
    const t = c.currentTime + delay, osc = c.createOscillator(), vol = c.createGain();
    osc.type = type; osc.frequency.value = freq;
    vol.gain.setValueAtTime(gain, t); vol.gain.exponentialRampToValueAtTime(0.001, t + len);
    osc.connect(vol).connect(c.destination); osc.start(t); osc.stop(t + len);
  },
  land(combo) { this.tone(combo ? 440 * 2 ** (Math.min(combo, 12) / 6) : 330); },
  fail() { this.tone(110, { type: 'sawtooth', len: 0.35 }); },
  levelUp() { [523, 659, 784].forEach((f, i) => this.tone(f, { delay: i * 0.09 })); }
};
const buzz = pattern => { try { navigator.vibrate?.(pattern); } catch {} };

/* ---------- state ---------- */
const G = {
  mode: 'title',                       // 'title' | 'play' | 'over'
  blocks: [], mover: null, debris: [], sparks: [], rings: [],
  score: 0, combo: 0, perfects: 0, clock: 0, cam: 0, shake: 0, flash: 0, newBest: false, orb: 360,
  theme: THEMES[0], prev: THEMES[0], mix: 1          // mix 0..1 crossfades prev -> theme
};
const V = { S: 1, H: MIN_H, ox: 0, vw: W };          // scale, logical height, left offset, visible logical width
const level = () => Math.floor(G.score / LEVEL_LEN) + 1;
const topBlock = () => G.blocks[G.blocks.length - 1];
const rowY = row => V.H - BASE_Y - (row - G.cam) * BLOCK_H;   // top edge of a tower row

function fit() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  ui.cv.width = Math.round(innerWidth * dpr);
  ui.cv.height = Math.round(innerHeight * dpr);
  V.S = Math.min(ui.cv.width / W, ui.cv.height / MIN_H);
  V.H = ui.cv.height / V.S;
  V.vw = ui.cv.width / V.S;
  V.ox = (V.vw - W) / 2;                              // centres the play field on wide screens
}

function setMode(mode) {
  G.mode = mode;
  document.body.dataset.mode = mode;
  document.body.classList.remove('show-over');
}

function setTheme(t, instant) {
  G.prev = instant ? t : G.theme; G.theme = t; G.mix = instant ? 1 : 0;
  rootStyle.setProperty('--bg', t.bot); rootStyle.setProperty('--top', t.top);
  rootStyle.setProperty('--ink', t.ink); rootStyle.setProperty('--mute', t.mute); rootStyle.setProperty('--acc', t.acc);
  t.p.forEach((c, i) => rootStyle.setProperty('--c' + i, c));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.top);
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
  setTheme(THEMES[0], decor);
  Object.assign(G, {
    blocks: [{ x: (W - MAX_W) / 2, w: MAX_W, col: G.theme.p[0] }],
    debris: [], sparks: [], rings: [], score: 0, combo: 0, perfects: 0, clock: 0, cam: 0, shake: 0, flash: 0, newBest: false
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

function end() {
  setMode('over');
  G.shake = REDUCED_MOTION ? 0 : 14; buzz([40, 40, 80]); sound.fail();
  G.newBest = G.score > save.best;
  save.best = Math.max(save.best, G.score); save.level = Math.max(save.level, level());
  save.blocks += G.score; save.games++; persist();
  ui.finalScore.textContent = G.score; ui.finalLevel.textContent = level();
  ui.finalPerfects.textContent = G.perfects; ui.finalBest.textContent = save.best;
  ui.bestScore.textContent = save.best; ui.bestLevel.textContent = save.level;
  ui.newBest.hidden = !G.newBest; ui.share.textContent = 'Share score';
  setTimeout(() => {                                  // let the falling block finish before the card appears
    if (G.mode !== 'over') return;
    document.body.classList.add('show-over');
    ui.again.focus({ preventScroll: true });
  }, 600);
}

const chunk = (x, w, row, col) => ({ x, w, row, col, drop: 0, vy: 0 });

function drop() {
  if (G.mode !== 'play') return;
  const t = topBlock(), m = G.mover, row = G.blocks.length;
  const left = Math.max(m.x, t.x), overlap = Math.min(m.x + m.w, t.x + t.w) - left;
  if (overlap <= 0) { G.debris.push(chunk(m.x, m.w, row, m.col)); end(); return; }   // clean miss
  if (Math.abs(m.x - t.x) < perfectTolerance()) landPerfect(m, t, row);
  else landChopped(m, t, row, left, overlap);
  G.blocks.push({ x: m.x, w: m.w, col: m.col });
  G.score++;
  if (G.score % LEVEL_LEN === 0) levelUp();
  syncHud(); spawnMover();
}

function landPerfect(m, t, row) {
  G.combo++; G.perfects++; m.x = t.x;
  if (G.combo >= 3 && m.w < MAX_W) { m.w = Math.min(MAX_W, m.w + 8); m.x = Math.min(m.x, W - m.w); }   // streaks regrow the block
  burst(m.x + m.w / 2, rowY(row) + BLOCK_H / 2, m.col, 14);
  G.rings.push({ x: m.x, row, w: m.w, life: RING_LIFE });
  flashClass(ui.pop, 600); ui.pop.textContent = 'Perfect x' + G.combo;
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
  setTheme(THEMES[(lv - 1) % THEMES.length]);
  t.x = Math.min(Math.max(0, t.x - (w - t.w) / 2), W - w); t.w = w;
  for (let i = 0; i < 3; i++) burst(W / 2, rowY(G.blocks.length - 1), G.theme.p[i], 14);
  G.flash = REDUCED_MOTION ? 0 : 1; sound.levelUp(); buzz([20, 30, 20]);
  ui.bannerTitle.textContent = 'Level ' + lv;
  ui.bannerNote.textContent = mod ? `${mod}: ${MODIFIERS[mod]}` : G.theme.name;
  flashClass(ui.banner, 1600);
}

function burst(x, y, col, n) {
  for (let i = 0; i < n; i++) G.sparks.push({ x, y, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 260, life: 0.5, col });
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
  G.clock += dt;
  G.mix = Math.min(1, G.mix + dt / 0.8);
  if (G.mode !== 'over') {                            // the title screen swings a block too, as a live demo
    const m = G.mover;
    m.x += m.dir * (G.mode === 'play' ? speed() : 120) * dt;
    if (m.x < 0) { m.x = 0; m.dir = 1; } else if (m.x + m.w > W) { m.x = W - m.w; m.dir = -1; }
  }
  G.cam += (Math.max(0, G.blocks.length - VIEW_ROWS) - G.cam) * Math.min(1, dt * 5);
  G.orb += ((G.mode === 'title' ? 360 : 150) - G.orb) * Math.min(1, dt * 3);   // the sun climbs out from behind the title text
  for (const d of G.debris) { d.vy += 1400 * dt; d.drop += d.vy * dt; }
  for (const s of G.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 800 * dt; s.life -= dt; }
  for (const r of G.rings) r.life -= dt;
  G.debris = G.debris.filter(d => d.drop < V.H);
  G.sparks = G.sparks.filter(s => s.life > 0);
  G.rings = G.rings.filter(r => r.life > 0);
  G.shake = G.shake > 0.3 ? G.shake * Math.pow(0.01, dt) : 0;
  G.flash = Math.max(0, G.flash - dt * 2.5);
}

/* ---------- drawing ---------- */
const SHADE = ctx.createLinearGradient(0, 0, 0, BLOCK_H - 3);       // glossy shading shared by every block
SHADE.addColorStop(0, 'rgba(255,255,255,.22)'); SHADE.addColorStop(1, 'rgba(0,0,0,.2)');

let seed = 7;                                         // fixed seed: the sky looks the same on every launch
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const SKY = Array.from({ length: 40 }, (_, i) => ({ u: rand(), v: rand(), s: 1.5 + rand() * 2, par: 0.1 + rand() * 0.25, ph: rand() * 6.28, cloud: i < 7 }));

function rrect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function disc(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

function drawBlock(x, y, w, col) {
  if (w <= 0 || y > V.H || y < -BLOCK_H) return;
  const h = BLOCK_H - 3;
  ctx.fillStyle = col; rrect(x, y, w, h, 6); ctx.fill();
  ctx.save(); ctx.translate(0, y);
  ctx.fillStyle = SHADE; rrect(x, 0, w, h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; rrect(x + 4, 3, Math.max(0, w - 8), 3, 1.5); ctx.fill();
  ctx.restore();
}

function drawSky() {
  const a = G.prev, b = G.theme, k = smooth(G.mix);
  const grad = ctx.createLinearGradient(0, 0, 0, ui.cv.height);
  grad.addColorStop(0, mixRgb(a.rgbTop, b.rgbTop, k)); grad.addColorStop(1, mixRgb(a.rgbBot, b.rgbBot, k));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, ui.cv.width, ui.cv.height);
}

function drawSkyObjects(theme, alpha) {              // sun or moon, clouds by day, stars by night
  if (alpha <= 0) return;
  const ox = V.ox, orbX = V.vw * 0.74 - ox, orbY = G.orb + (G.cam % LEVEL_LEN) * 7;
  ctx.fillStyle = theme.orb;
  ctx.globalAlpha = alpha * 0.18; disc(orbX, orbY, 70);
  ctx.globalAlpha = alpha * 0.9; disc(orbX, orbY, 42);
  for (const o of SKY) {
    const y = (o.v * V.H + G.cam * BLOCK_H * o.par) % V.H;
    if (o.cloud && !theme.night) {
      const w = 70 + o.s * 40, x = ((o.u * V.vw + G.clock * (6 + o.par * 40)) % (V.vw + 240)) - 120 - ox;
      ctx.globalAlpha = alpha * 0.45; ctx.fillStyle = '#fff';
      rrect(x, y, w, 20, 10); ctx.fill(); rrect(x + w * 0.2, y - 10, w * 0.5, 20, 10); ctx.fill();
    } else if (!o.cloud && theme.night) {
      ctx.globalAlpha = alpha * (0.3 + 0.5 * Math.sin(G.clock * 1.6 + o.ph) ** 2); ctx.fillStyle = theme.orb;
      ctx.fillRect(o.u * V.vw - ox, y, o.s, o.s);
    }
  }
  ctx.globalAlpha = 1;
}

function drawTower() {
  G.blocks.forEach((b, i) => drawBlock(b.x, rowY(i), b.w, b.col));
  const slot = rowY(G.blocks.length);
  if (G.mode === 'play') {                            // dashed target slot: line the swinging block up with it
    const t = topBlock();
    ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeStyle = G.theme.ink; ctx.globalAlpha = 0.28;
    rrect(t.x, slot, t.w, BLOCK_H - 3, 6); ctx.stroke(); ctx.restore();
  }
  if (G.mode !== 'over') drawBlock(G.mover.x, slot, G.mover.w, G.mover.col);
  for (const d of G.debris) drawBlock(d.x, rowY(d.row) + d.drop, d.w, d.col);
}

function drawEffects() {
  for (const r of G.rings) {                          // expanding outline on a perfect drop
    const k = 1 - r.life / RING_LIFE, grow = k * 14;
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = G.theme.ink; ctx.lineWidth = 3;
    rrect(r.x - grow, rowY(r.row) - grow, r.w + grow * 2, BLOCK_H - 3 + grow * 2, 6 + grow); ctx.stroke();
  }
  for (const s of G.sparks) { ctx.globalAlpha = Math.min(1, s.life * 2); ctx.fillStyle = s.col; ctx.fillRect(s.x, s.y, 4, 4); }
  ctx.globalAlpha = 1;
}

function render() {
  const { S, ox } = V;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSky();
  const jx = (Math.random() - 0.5) * G.shake, jy = (Math.random() - 0.5) * G.shake;
  ctx.setTransform(S, 0, 0, S, (ox + jx) * S, jy * S);
  const k = smooth(G.mix);
  drawSkyObjects(G.prev, 1 - k); drawSkyObjects(G.theme, k);
  drawTower(); drawEffects();
  if (G.flash > 0) {                                  // level-up flash, drawn over everything in screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.3})`; ctx.fillRect(0, 0, ui.cv.width, ui.cv.height);
  }
}

/* ---------- logo: a 3x5 pixel font, one palette colour per row (like layers of the tower) ---------- */
const GLYPHS = {
  S: '111100111001111', T: '111010010010010', A: '111101111101101', C: '111100100100111',
  K: '101101110101101', R: '111101110101101', U: '101101101101111', H: '101101111101101'
};
function buildLogo() {
  document.querySelectorAll('.word').forEach(word => {
    const letters = [...word.dataset.w];
    word.style.setProperty('--cols', letters.length * 4 - 1);
    letters.forEach((ch, li) => [...GLYPHS[ch]].forEach((bit, k) => {
      if (bit !== '1') return;
      const row = Math.floor(k / 3), cell = document.createElement('i');
      cell.style.gridArea = `${row + 1} / ${li * 4 + (k % 3) + 1}`;
      cell.style.background = `var(--c${row % 4})`;
      cell.style.setProperty('--r', row);
      word.append(cell);
    }));
  });
}

/* ---------- input and boot ---------- */
ui.cv.addEventListener('pointerdown', e => { e.preventDefault(); drop(); });
addEventListener('keydown', e => { if (e.code === 'Space' && G.mode === 'play') { e.preventDefault(); drop(); } });
$('title').addEventListener('click', start);
ui.again.addEventListener('click', start);
ui.share.addEventListener('click', shareScore);
addEventListener('resize', fit);

let lastTime = 0;
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);   // capped so a backgrounded tab never causes a jump
  lastTime = now;
  update(dt); render();
  requestAnimationFrame(frame);
}

buildLogo(); fit(); reset({ decor: true }); setMode('title');
ui.bestScore.textContent = save.best; ui.bestLevel.textContent = save.level;
requestAnimationFrame(frame);
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
