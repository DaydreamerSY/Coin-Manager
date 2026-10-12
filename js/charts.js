// Biểu đồ cột chi theo ngày (SVG tự vẽ, không thư viện — chạy offline).
import { fmtCompact, fmtVND, escapeHtml } from './format.js';

function niceCeil(v) {
  if (v <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// Cột bo 4px ở đầu, vuông ở đáy
function columnPath(x, base, w, h, r) {
  r = Math.min(r, w / 2, h);
  const y = base - h;
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

/**
 * @param {HTMLElement} el
 * @param {{label: string, title: string, value: number, count: number, isToday?: boolean}[]} data
 */
export function renderDailyColumns(el, data) {
  const W = Math.max(280, el.clientWidth || 600), H = 190;
  const m = { l: 44, r: 6, t: 12, b: 24 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b, base = m.t + ih;
  const top = niceCeil(Math.max(0, ...data.map(d => d.value)));
  const slot = iw / data.length;
  const bw = Math.max(2, Math.min(24, slot - 2));
  const labelEvery = slot < 14 ? 5 : slot < 22 ? 2 : 1;

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chi tiêu theo ngày">`;
  if (top) {
    for (const f of [0.5, 1]) {
      const y = base - f * ih;
      svg += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>`;
      svg += `<text class="tick" x="${m.l - 6}" y="${y + 4}" text-anchor="end">${fmtCompact(top * f)}</text>`;
    }
  }
  svg += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${base}" y2="${base}"/>`;
  svg += `<text class="tick" x="${m.l - 6}" y="${base + 4}" text-anchor="end">0</text>`;
  data.forEach((d, i) => {
    const x = m.l + i * slot + (slot - bw) / 2;
    if (d.value > 0) {
      const h = Math.max(2, (d.value / top) * ih);
      svg += `<path class="col" data-i="${i}" d="${columnPath(x, base, bw, h, 4)}"/>`;
    }
    if (d.isToday || (i + 1) % labelEvery === 0 || i === 0) {
      svg += `<text class="tick${d.isToday ? ' today' : ''}" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${d.label}</text>`;
    }
    svg += `<rect class="hit" data-i="${i}" x="${m.l + i * slot}" y="${m.t}" width="${slot}" height="${ih + m.b}"/>`;
  });
  svg += '</svg>';
  el.innerHTML = `${svg}<div class="tip" role="status" hidden></div>`;

  const tip = el.querySelector('.tip');
  let active = null;
  const show = i => {
    const d = data[i];
    active?.classList.remove('active');
    active = el.querySelector(`.col[data-i="${i}"]`);
    active?.classList.add('active');
    tip.innerHTML = `<b>${escapeHtml(d.title)}</b><span>${d.value ? `${fmtVND(d.value)} · ${d.count} khoản` : 'Không chi'}</span>`;
    tip.hidden = false;
    const cx = m.l + (i + 0.5) * slot;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(0, cx - tw / 2), W - tw)}px`;
    tip.style.top = '0px';
  };
  const hide = () => { tip.hidden = true; active?.classList.remove('active'); active = null; };
  el.querySelectorAll('.hit').forEach(r => {
    r.addEventListener('pointerenter', () => show(+r.dataset.i));
    r.addEventListener('pointerdown', () => show(+r.dataset.i));
  });
  el.querySelector('svg').addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
}
