import { dueRecurring, dueDate, nextDue, startYmFor, recurringTxId } from '../js/recurring.js';
import { mergeProfile } from '../js/sync.js';

export function runRecurringTests() {
  const results = [];
  const check = (text, ok, detail = '') => results.push({ text: `[cố định] ${text}`, ok: !!ok, detail });
  const rule = (extra = {}) => ({ id: 'r1', name: 'Netflix', amount: 260000, category: 'giai-tri', type: 'expense', day: 5, startYm: '2026-08', active: true, updatedAt: '2026-08-01T00:00:00Z', ...extra });
  const none = () => false;

  const d = dueRecurring([rule()], none, '2026-10-18');
  check('ghi bù đủ các tháng từ lúc bắt đầu', d.map(t => t.date).join() === '2026-08-05,2026-09-05,2026-10-05', d.map(t => t.date).join());
  check('mã khoản cố định theo quy tắc + tháng', d[2]?.id === 'rec-r1-2026-10' && d[2].recurringId === 'r1');
  check('chưa tới ngày trừ thì chưa ghi', dueRecurring([rule({ day: 25, startYm: '2026-10' })], none, '2026-10-18').length === 0);
  check('đúng ngày trừ thì ghi', dueRecurring([rule({ day: 18, startYm: '2026-10' })], none, '2026-10-18').length === 1);
  const have = new Set([recurringTxId('r1', '2026-08'), recurringTxId('r1', '2026-09')]);
  check('khoản đã có (hoặc đã xoá) không tạo lại', dueRecurring([rule()], id => have.has(id), '2026-10-18').map(t => t.date).join() === '2026-10-05');
  check('tạm tắt thì không ghi', dueRecurring([rule({ active: false })], none, '2026-10-18').length === 0);
  check('quy tắc đã xoá thì không ghi', dueRecurring([rule({ deleted: true })], none, '2026-10-18').length === 0);
  check('ngày 31 ở tháng 2 → ngày cuối tháng', dueDate('2026-02', 31) === '2026-02-28' && dueDate('2028-02', 31) === '2028-02-29' && dueDate('2026-04', 31) === '2026-04-30');
  check('qua năm mới vẫn đúng', dueRecurring([rule({ startYm: '2026-12', day: 1 })], none, '2027-02-03').map(t => t.date).join() === '2026-12-01,2027-01-01,2027-02-01');
  check('lần trừ kế tiếp', nextDue(rule(), '2026-10-18') === '2026-11-05' && nextDue(rule({ day: 25 }), '2026-10-18') === '2026-10-25'
    && nextDue(rule({ startYm: '2027-01' }), '2026-10-18') === '2027-01-05');
  check('bật lại giữa tháng: chưa qua ngày trừ → tháng này, đã qua → tháng sau', startYmFor(25, '2026-10-18') === '2026-10' && startYmFor(5, '2026-10-18') === '2026-11' && startYmFor(18, '2026-10-18') === '2026-10');
  check('số tiền / ngày sai thì bỏ qua', dueRecurring([rule({ amount: 0 }), rule({ id: 'r2', day: 40 })], none, '2026-10-18').length === 0);

  const p = mergeProfile(
    { recurring: [rule({ amount: 260000, updatedAt: '2026-10-01T00:00:00Z' }), rule({ id: 'r2', name: 'Gym', updatedAt: '2026-10-01T00:00:00Z' })] },
    { recurring: [rule({ amount: 180000, updatedAt: '2026-10-10T00:00:00Z' }), { id: 'r2', deleted: true, updatedAt: '2026-10-12T00:00:00Z' }, rule({ id: 'r3', name: 'Phí giữ xe' })] },
  );
  const byId = Object.fromEntries(p.recurring.map(r => [r.id, r]));
  check('đồng bộ: sửa ở máy kia (sau) thắng', byId.r1.amount === 180000);
  check('đồng bộ: xoá ở máy kia → xoá', byId.r2.deleted === true);
  check('đồng bộ: khoản mới ở máy kia được thêm', byId.r3?.name === 'Phí giữ xe');
  return results;
}
