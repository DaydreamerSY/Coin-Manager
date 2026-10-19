import { planSplit, walletBalances, walletForCategory, parseShare, unallocated, upsertWallet, isSaving } from '../js/wallets.js';
import { parseAmountInput } from '../js/parser.js';
import { mergeProfile } from '../js/sync.js';

export function runWalletTests() {
  const results = [];
  const check = (text, ok, detail = '') => results.push({ text: `[ví] ${text}`, ok: !!ok, detail });
  const w = (id, extra = {}) => ({ id, name: id, icon: '👛', cats: [], since: '2026-10-01', order: 0, updatedAt: '2026-10-01T00:00:00Z', ...extra });
  const parse = s => parseAmountInput(s);

  check('"30%" là phần trăm', parseShare('30%', parse)?.pct === 30);
  check('"3tr" là số tiền cố định', parseShare('3tr', parse)?.amount === 3000000);
  check('"2.500.000" là số tiền', parseShare('2.500.000', parse)?.amount === 2500000);
  check('bỏ trống = không đặt', parseShare('', parse) === null);
  check('"150%" không hợp lệ', parseShare('150%', parse) === undefined);

  const jars = [w('a', { share: { pct: 55 }, order: 1 }), w('b', { share: { pct: 10 }, order: 2 }), w('c', { share: { pct: 35 }, order: 3 })];
  const p1 = planSplit(jars, 15_000_000);
  check('chia theo phần trăm', p1.get('a') === 8_250_000 && p1.get('b') === 1_500_000 && p1.get('c') === 5_250_000, [...p1.values()].join());
  const p2 = planSplit(jars, 1_234_567);
  check('tổng 100% thì chia vừa khít (phần lẻ vào ví lớn nhất)', [...p2.values()].reduce((s, x) => s + x, 0) === 1_234_567 && p2.get('b') === 123_000, [...p2.values()].join());
  const mixed = [w('hp', { share: { amount: 2_000_000 }, order: 1 }), w('an', { share: { pct: 60 }, order: 2 }), w('tk', { share: { pct: 40 }, order: 3 })];
  const p3 = planSplit(mixed, 10_000_000);
  check('ví cố định lấy trước, % tính trên phần còn lại', p3.get('hp') === 2_000_000 && p3.get('an') === 4_800_000 && p3.get('tk') === 3_200_000, [...p3.values()].join());
  check('không có tỉ lệ thì để 0', planSplit([w('x')], 5_000_000).get('x') === 0);

  const ws = [
    w('an', { cats: ['an-uong', 'do-uong'], order: 1 }),
    w('tk', { order: 2 }),
    w('chung', { catchAll: true, order: 3 }),
    w('hoc', { cats: ['hoc-tap'], since: '2026-10-10', order: 4 }),
  ];
  check('danh mục gắn ví → đúng ví', walletForCategory('do-uong', ws)?.id === 'an');
  check('danh mục chưa gắn → ví nhận mọi khoản', walletForCategory('mua-sam', ws)?.id === 'chung');
  check('ví xoá rồi thì không nhận', walletForCategory('an-uong', [{ ...ws[0], deleted: true }]) === null);
  check('ví không gắn danh mục = ví để dành', isSaving(ws[1]) && !isSaving(ws[2]));

  const allocs = [
    { id: '1', wallet: 'an', amount: 3_000_000, kind: 'in', date: '2026-09-01' },
    { id: '2', wallet: 'an', amount: 2_000_000, kind: 'in', date: '2026-10-01' },
    { id: '3', wallet: 'tk', amount: 1_000_000, kind: 'in', date: '2026-10-01' },
    { id: '4', wallet: 'tk', amount: -200_000, kind: 'move', group: 'g', date: '2026-10-05' },
    { id: '5', wallet: 'an', amount: 200_000, kind: 'move', group: 'g', date: '2026-10-05' },
    { id: '6', wallet: 'an', amount: 999, kind: 'in', date: '2026-10-02', deleted: true },
  ];
  const parts = [
    { date: '2026-09-20', category: 'an-uong', amount: 500_000 },   // trước ngày bắt đầu tính của ví → bỏ
    { date: '2026-10-03', category: 'an-uong', amount: 300_000 },
    { date: '2026-10-04', category: 'do-uong', amount: 50_000 },
    { date: '2026-10-05', category: 'mua-sam', amount: 400_000 },
    { date: '2026-10-08', category: 'hoc-tap', amount: 700_000 },   // trước 10/10 của ví học → bỏ
    { date: '2026-10-12', category: 'hoc-tap', amount: 100_000 },
  ];
  const b = walletBalances(ws, allocs, parts, '2026-10-19');
  check('số dư = nạp + chuyển − chi', b.get('an').balance === 5_200_000 - 350_000, b.get('an').balance);
  check('tháng này: nạp và chi', b.get('an').monthIn === 2_200_000 && b.get('an').monthSpent === 350_000);
  check('tiền có trong tháng = số dư + đã chi tháng này', b.get('an').available === 5_200_000);
  check('ví để dành: chuyển đi thì giảm', b.get('tk').balance === 800_000);
  check('ví nhận mọi khoản bị âm khi chưa nạp', b.get('chung').balance === -400_000);
  check('chi trước ngày bắt đầu tính thì bỏ qua', b.get('hoc').spent === 100_000);
  check('lần nạp đã xoá không tính', b.get('an').allocated === 5_200_000);

  const income = [{ date: '2026-10-01', amount: 15_000_000 }, { date: '2026-09-01', amount: 9 }];
  const u = unallocated(income, allocs, ws, '2026-10');
  check('thu tháng này chưa chia (chuyển giữa ví không tính)', u.income === 15_000_000 && u.given === 3_000_000 && u.free === 12_000_000, JSON.stringify(u));

  const moved = upsertWallet(ws, w('an2', { cats: ['do-uong'], catchAll: true }), '2026-10-19T00:00:00Z');
  const byId = Object.fromEntries(moved.map(x => [x.id, x]));
  check('mỗi danh mục chỉ thuộc một ví', byId.an.cats.join() === 'an-uong' && byId.an2.cats.join() === 'do-uong');
  check('chỉ một ví nhận mọi khoản', byId.an2.catchAll && !byId.chung.catchAll);

  const pr = mergeProfile(
    { wallets: [w('an', { name: 'Ăn', updatedAt: '2026-10-01T00:00:00Z' })], allocs: [{ id: 'x', wallet: 'an', amount: 1, updatedAt: '2026-10-02T00:00:00Z' }] },
    { wallets: [w('an', { name: 'Ăn uống', updatedAt: '2026-10-05T00:00:00Z' }), w('tk')], allocs: [{ id: 'x', deleted: true, updatedAt: '2026-10-03T00:00:00Z' }] },
  );
  check('đồng bộ ví: bản sửa sau thắng, ví mới được thêm', pr.wallets.length === 2 && pr.wallets.find(x => x.id === 'an').name === 'Ăn uống');
  check('đồng bộ lần nạp: xoá ở máy kia → xoá', pr.allocs[0].deleted === true);
  return results;
}
