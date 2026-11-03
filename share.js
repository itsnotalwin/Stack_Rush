'use strict';
/* Draws the shareable score image. Loaded before game.js; called when the share sheet opens. */
const SHARE_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function roundedRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// d: { score, label, blocks: [{ w, col, shine }], top, bot, ink }. Designed on a 342 unit square, scaled to the canvas.
function drawShareCard(canvas, d) {
  const S = canvas.width, u = S / 342, g = canvas.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, `rgb(${d.top})`); sky.addColorStop(1, `rgb(${d.bot})`);
  g.fillStyle = sky; g.fillRect(0, 0, S, S);
  g.fillStyle = d.ink; g.textBaseline = 'alphabetic';
  const text = (str, x, y, size, weight) => { g.font = `${weight} ${size * u}px ${SHARE_FONT}`; g.fillText(str, x * u, y * u); };
  text('Stack Rush', 24, 44, 17, 800);
  text(String(d.score), 22, 190, d.score >= 1000 ? 100 : d.score >= 100 ? 124 : 150, 800);
  text('blocks stacked', 26, 232, 22, 700);
  text(d.label, 26, 268, 18, 700);
  const bh = 22, gap = 3, cx = 262;
  d.blocks.forEach((b, i) => {                        // the real top of your tower, bottom block first
    const w = Math.max(24, Math.min(112, b.w * 0.7)), x = cx - w / 2, y = 318 - (i + 1) * (bh + gap) + gap;
    if (b.shine) {
      const lg = g.createLinearGradient(0, y * u, 0, (y + bh) * u);
      lg.addColorStop(0, tint(b.col, [255, 255, 255], 0.55)); lg.addColorStop(0.45, b.col); lg.addColorStop(1, tint(b.col, [0, 0, 0], 0.3));
      g.fillStyle = lg;
    } else g.fillStyle = b.col;
    roundedRect(g, x * u, y * u, w * u, bh * u, 6 * u); g.fill();
  });
}
