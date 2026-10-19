// Chia tiền vào các ví nhỏ (kiểu "chia hũ"): ăn uống, tiết kiệm, học phí…
// Hàm thuần — app.js lo giao diện và lưu trữ (ví + các lần nạp nằm trong hồ sơ đã mã hoá).
//
// Ví:      { id, name, icon, tint, share, cats: [mã danh mục], catchAll, since: 'YYYY-MM-DD', order, updatedAt, deleted? }
//          share = { pct } (phần trăm) | { amount } (số cố định mỗi lần chia) | null
// Lần nạp: { id, date, wallet, amount, kind: 'in' | 'move', group, createdAt, updatedAt, deleted? }
//          'in' = chia tiền vào ví · 'move' = chuyển giữa hai ví (một cặp −x / +x cùng group)
// Số dư = tổng tiền nạp − tổng chi (từ ngày `since`) của các danh mục thuộc ví.

export const WALLET_ICONS = ['👛', '🍜', '🐷', '🎓', '🏠', '🛵', '🎉', '🛍️', '💊', '🛟', '🎁', '📈', '✈️', '👶', '🐶', '💼'];
const TINTS = [5, 2, 10, 4, 3, 8, 6, 7, 11, 13, 0, 9, 1, 12];

// Gợi ý khi thêm ví (danh mục đi kèm có thể đổi)
export const WALLET_SUGGEST = [
  { name: 'Ăn uống', icon: '🍜', cats: ['an-uong', 'do-uong', 'di-cho'] },
  { name: 'Tiết kiệm', icon: '🐷', cats: [] },
  { name: 'Học phí', icon: '🎓', cats: ['hoc-tap'] },
  { name: 'Nhà & hoá đơn', icon: '🏠', cats: ['nha-o', 'hoa-don'] },
  { name: 'Đi lại', icon: '🛵', cats: ['di-chuyen'] },
  { name: 'Giải trí', icon: '🎉', cats: ['giai-tri'] },
  { name: 'Mua sắm', icon: '🛍️', cats: ['mua-sam'] },
  { name: 'Sức khoẻ', icon: '💊', cats: ['suc-khoe'] },
  { name: 'Quỹ khẩn cấp', icon: '🛟', cats: [] },
  { name: 'Quà & gia đình', icon: '🎁', cats: ['gia-dinh'] },
];

// Mẫu 6 hũ (JARS): 55 / 10 / 10 / 10 / 10 / 5
export const JARS = [
  { name: 'Thiết yếu', icon: '🏠', pct: 55, catchAll: true,
    cats: ['an-uong', 'do-uong', 'di-cho', 'di-chuyen', 'nha-o', 'hoa-don', 'suc-khoe', 'ca-nhan', 'khac'] },
  { name: 'Tiết kiệm dài hạn', icon: '🐷', pct: 10, cats: [] },
  { name: 'Giáo dục', icon: '🎓', pct: 10, cats: ['hoc-tap'] },
  { name: 'Hưởng thụ', icon: '🎉', pct: 10, cats: ['giai-tri', 'mua-sam'] },
  { name: 'Tự do tài chính', icon: '📈', pct: 10, cats: [] },
  { name: 'Cho đi', icon: '🎁', pct: 5, cats: ['gia-dinh'] },
];

export const liveWallets = wallets => (wallets ?? []).filter(w => !w.deleted)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'vi'));
export const liveAllocs = (allocs, wallets) => {
  const ids = new Set(liveWallets(wallets).map(w => w.id));
  return (allocs ?? []).filter(a => !a.deleted && ids.has(a.wallet) && Number.isFinite(a.amount));
};

export const nextTint = wallets => TINTS[liveWallets(wallets).length % TINTS.length];
export const nextOrder = wallets => Math.max(0, ...(wallets ?? []).map(w => w.order ?? 0)) + 1;
export const monthStart = iso => `${iso.slice(0, 7)}-01`;

/** Ví "để dành": không gắn danh mục chi nào → chỉ có nạp vào. */
export const isSaving = w => !w.catchAll && !(w.cats?.length);

/** "30%" → { pct: 30 } · "3tr" / "3.000.000" → { amount } · "" → null · sai → undefined */
export function parseShare(text, parseAmount) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*%$/);
  if (m) {
    const pct = Number(m[1].replace(',', '.'));
    return pct > 0 && pct <= 100 ? { pct } : undefined;
  }
  const amount = parseAmount(s);
  return amount > 0 ? { amount } : undefined;
}

export function shareText(share, fmtNum) {
  if (share?.pct) return `${share.pct}%`;
  if (share?.amount) return fmtNum(share.amount);
  return '';
}

/** Ví nhận khoản chi của danh mục này: ví có gắn danh mục, không thì ví "nhận mọi khoản chưa có ví". */
export function walletForCategory(catId, wallets) {
  const live = liveWallets(wallets);
  return live.find(w => w.cats?.includes(catId)) ?? live.find(w => w.catchAll) ?? null;
}

/**
 * Gợi ý chia `total`: ví số tiền cố định lấy trước, phần còn lại chia theo phần trăm (làm tròn nghìn).
 * Tổng phần trăm đúng 100 → phần lẻ do làm tròn dồn vào ví có phần trăm lớn nhất để chia vừa khít.
 * @returns {Map<string, number>}
 */
export function planSplit(wallets, total) {
  const live = liveWallets(wallets);
  const out = new Map(live.map(w => [w.id, 0]));
  if (!(total > 0)) return out;
  let rest = total;
  for (const w of live) if (w.share?.amount) { out.set(w.id, w.share.amount); rest -= w.share.amount; }
  const pctW = live.filter(w => w.share?.pct);
  if (rest <= 0 || !pctW.length) return out;
  for (const w of pctW) out.set(w.id, Math.floor(rest * w.share.pct / 100 / 1000) * 1000);
  const pctSum = pctW.reduce((s, w) => s + w.share.pct, 0);
  if (Math.abs(pctSum - 100) < 1e-9) {
    const used = pctW.reduce((s, w) => s + out.get(w.id), 0);
    const big = pctW.reduce((a, b) => (b.share.pct > a.share.pct ? b : a));
    out.set(big.id, out.get(big.id) + rest - used);
  }
  return out;
}

/**
 * @param parts các phần chi [{ date, category, amount }] (hoá đơn đã chia thì mỗi món một phần)
 * @returns {Map<string, { balance, allocated, spent, monthIn, monthSpent, available }>}
 *   available: tiền có trong tháng này (số dư đầu tháng + nạp trong tháng) — để vẽ thanh đã dùng bao nhiêu
 */
export function walletBalances(wallets, allocs, parts, todayIso) {
  const live = liveWallets(wallets);
  const ym = todayIso.slice(0, 7);
  const out = new Map(live.map(w => [w.id, { balance: 0, allocated: 0, spent: 0, monthIn: 0, monthSpent: 0, available: 0 }]));
  for (const a of liveAllocs(allocs, wallets)) {
    const s = out.get(a.wallet);
    s.allocated += a.amount;
    if (a.date?.startsWith(ym)) s.monthIn += a.amount;
  }
  const byCat = new Map();
  for (const p of parts) {
    if (!byCat.has(p.category)) byCat.set(p.category, walletForCategory(p.category, live));
    const w = byCat.get(p.category);
    if (!w || p.date < (w.since ?? '')) continue;
    const s = out.get(w.id);
    s.spent += p.amount;
    if (p.date.startsWith(ym)) s.monthSpent += p.amount;
  }
  for (const s of out.values()) {
    s.balance = s.allocated - s.spent;
    s.available = s.balance + s.monthSpent;
  }
  return out;
}

/** Thu nhập tháng `ym` chưa chia vào ví nào (lần nạp 'in' của ví còn dùng, theo ngày nạp). */
export function unallocated(incomeTxs, allocs, wallets, ym) {
  const income = incomeTxs.filter(t => t.date?.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
  const given = liveAllocs(allocs, wallets).filter(a => a.kind === 'in' && a.date?.startsWith(ym)).reduce((s, a) => s + a.amount, 0);
  return { income, given, free: Math.max(0, income - given) };
}

/**
 * Lưu ví `w` (mới hoặc sửa): danh mục của nó được gỡ khỏi ví khác (mỗi danh mục thuộc một ví),
 * chỉ một ví nhận "mọi khoản chưa có ví".
 */
export function upsertWallet(wallets, w, now) {
  const cats = new Set(w.cats ?? []);
  const others = (wallets ?? []).filter(x => x.id !== w.id).map(x => {
    if (x.deleted) return x;
    const keep = (x.cats ?? []).filter(c => !cats.has(c));
    const catchAll = w.catchAll ? false : x.catchAll;
    return keep.length !== (x.cats ?? []).length || catchAll !== x.catchAll ? { ...x, cats: keep, catchAll, updatedAt: now } : x;
  });
  return [...others, { ...w, updatedAt: now }];
}
