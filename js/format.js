const nf = new Intl.NumberFormat('vi-VN');

export const fmtVND = n => `${nf.format(Math.round(n))}đ`;
export const fmtNum = n => nf.format(Math.round(n));

// 15.000 → 15k · 1.250.000 → 1,25tr · 2.000.000.000 → 2 tỷ
export function fmtCompact(n) {
  const a = Math.abs(n);
  const trim = (v, d) => nf.format(Number(v.toFixed(d)));
  if (a >= 1e9) return `${trim(n / 1e9, 2)} tỷ`;
  if (a >= 1e6) return `${trim(n / 1e6, 2)}tr`;
  if (a >= 1e3) return `${trim(n / 1e3, 1)}k`;
  return nf.format(n);
}

const pad = n => String(n).padStart(2, '0');
export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
export const monthOf = iso => iso.slice(0, 7);
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export const monthLabel = ym => `Tháng ${Number(ym.slice(5))}/${ym.slice(0, 4)}`;

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
export function dayLabel(iso) {
  const t = today();
  if (iso === t) return 'Hôm nay';
  if (iso === addDays(t, -1)) return 'Hôm qua';
  const d = new Date(`${iso}T00:00:00`);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
}

export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const capitalize = s => s ? s[0].toLocaleUpperCase('vi') + s.slice(1) : s;
