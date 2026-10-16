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

// Một lát vành khuyên từ góc a0 tới a1 (radian, 0 = hướng 3 giờ)
function ringSlice(c, R, r, a0, a1) {
  const p = (rad, ang) => `${(c + rad * Math.cos(ang)).toFixed(2)},${(c + rad * Math.sin(ang)).toFixed(2)}`;
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    // Cả vòng (chỉ có 1 phần): hai nửa vòng ngoài + hai nửa vòng trong, tô kiểu evenodd
    return `M${p(R, 0)}A${R},${R} 0 1 1 ${p(R, Math.PI)}A${R},${R} 0 1 1 ${p(R, 0)}Z`
      + `M${p(r, 0)}A${r},${r} 0 1 0 ${p(r, Math.PI)}A${r},${r} 0 1 0 ${p(r, 0)}Z`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
}

/**
 * Donut tỉ lệ — tối đa 6 phần (khuyến nghị dataviz), luôn kèm bảng chú giải có icon, % và số tiền
 * để không phải phân biệt chỉ bằng màu. Chạm vào lát hoặc dòng chú giải để xem ở giữa.
 * @param {{label: string, icon: string, value: number, color: string, note?: string}[]} slices color: '0'..'4' | 'other'
 */
export function renderDonut(el, slices, total) {
  const S = 184, R = 88, r = 58, c = S / 2;
  let a = -Math.PI / 2;
  const pct = v => (total ? Math.round((v / total) * 100) : 0);
  const paths = slices.map((s, i) => {
    const a0 = a;
    a += (s.value / total) * Math.PI * 2;
    return `<path class="slice sc-${s.color}" data-i="${i}" fill-rule="evenodd" d="${ringSlice(c, R, r, a0, a)}"/>`;
  }).join('');
  el.innerHTML = `
    <div class="donut-wrap">
      <svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="Tỉ lệ chi theo danh mục">${paths}</svg>
      <div class="donut-center" aria-live="polite"></div>
    </div>
    <ul class="donut-legend">${slices.map((s, i) => `<li><button type="button" class="lg-row" data-i="${i}">
      <span class="dot sc-${s.color}" aria-hidden="true"></span>
      <span class="lg-name">${escapeHtml(s.icon)} ${escapeHtml(s.label)}${s.note ? ` <small>${escapeHtml(s.note)}</small>` : ''}</span>
      <span class="lg-pct">${pct(s.value)}%</span>
      <span class="lg-val">${fmtVND(s.value)}</span>
    </button></li>`).join('')}</ul>`;

  const center = el.querySelector('.donut-center');
  let selected = -1;
  const select = i => {
    selected = selected === i ? -1 : i;
    el.querySelectorAll('.slice, .lg-row').forEach(n => n.classList.toggle('dim', selected >= 0 && Number(n.dataset.i) !== selected));
    const s = slices[selected];
    center.innerHTML = s
      ? `<span>${escapeHtml(s.icon)} ${escapeHtml(s.label)}</span><b>${pct(s.value)}%</b><small>${fmtVND(s.value)}</small>`
      : `<span>Tổng chi</span><b>${fmtCompact(total)}</b><small>${slices.length} phần</small>`;
  };
  select(-1);
  el.querySelectorAll('.slice, .lg-row').forEach(n => n.addEventListener('click', () => select(Number(n.dataset.i))));
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
  // Nhãn ngày: ưu tiên hôm nay → ngày 1 → các mốc định kỳ; nhãn nào chạm nhãn đã đặt thì bỏ
  // (trước đây "15" và "16 hôm nay" in đè lên nhau)
  const cx = i => m.l + (i + 0.5) * slot;
  const labelW = i => data[i].label.length * 7 + 6;
  const wanted = [data.findIndex(d => d.isToday), 0, ...data.map((_, i) => i).filter(i => (i + 1) % labelEvery === 0)];
  const labels = [];
  for (const i of wanted) {
    if (i < 0 || labels.includes(i)) continue;
    if (labels.every(j => Math.abs(cx(i) - cx(j)) >= (labelW(i) + labelW(j)) / 2)) labels.push(i);
  }

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
    if (labels.includes(i)) {
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
