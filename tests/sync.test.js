import { mergeRows, mergeProfile, isTomb } from '../js/sync.js';

const tx = (id, updatedAt, extra = {}) => ({ id, name: id, amount: 1000, date: '2026-10-16', type: 'expense', category: 'khac', createdAt: '2026-10-01T00:00:00Z', updatedAt, ...extra });
const tomb = (id, updatedAt) => ({ id, deleted: true, updatedAt });

export function runSyncTests() {
  const results = [];
  const check = (text, ok, detail = '') => results.push({ text: `[đồng bộ] ${text}`, ok: !!ok, detail });
  const byId = rows => Object.fromEntries(rows.map(r => [r.id, r]));

  // Máy A có a, b; máy B có b (sửa sau), c (mới)
  const A = [tx('a', '2026-10-10T00:00:00Z'), tx('b', '2026-10-10T00:00:00Z', { amount: 1 })];
  const B = [tx('b', '2026-10-12T00:00:00Z', { amount: 2 }), tx('c', '2026-10-11T00:00:00Z')];
  const m = mergeRows(A, B);
  const r = byId(m.rows);
  check('khoản chỉ có ở máy kia được lấy về', r.c && m.pulledIds.has('c'));
  check('khoản chỉ có ở máy này được giữ', r.a && !m.pulledIds.has('a'));
  check('cùng khoản: bản sửa sau thắng', r.b.amount === 2 && m.pulledIds.has('b'));
  check('đếm số khoản cần đẩy lên', m.pushed === 1, `pushed=${m.pushed}`);

  const local2 = [tx('x', '2026-10-15T00:00:00Z', { amount: 9 })];
  check('máy này sửa sau → giữ bản máy này', byId(mergeRows(local2, [tx('x', '2026-10-14T00:00:00Z', { amount: 5 })]).rows).x.amount === 9);

  // Xoá ở máy kia sau khi máy này sửa → khoản biến mất
  const del = mergeRows([tx('d', '2026-10-10T00:00:00Z')], [tomb('d', '2026-10-11T00:00:00Z')]);
  check('xoá ở máy kia (sau) → xoá ở máy này', isTomb(byId(del.rows).d) && del.pulledIds.has('d'));
  // Sửa ở máy này sau khi máy kia xoá → giữ bản sửa
  const keep = mergeRows([tx('e', '2026-10-12T00:00:00Z')], [tomb('e', '2026-10-11T00:00:00Z')]);
  check('sửa sau khi máy kia xoá → giữ bản sửa', !isTomb(byId(keep.rows).e) && keep.pushed === 1);
  // Khoản đã xoá ở máy này không sống lại khi gộp bản cũ từ máy kia
  const noZombie = mergeRows([tomb('f', '2026-10-12T00:00:00Z')], [tx('f', '2026-10-10T00:00:00Z')]);
  check('khoản đã xoá không "sống lại" từ bản cũ', isTomb(byId(noZombie.rows).f) && !noZombie.pulledIds.has('f'));
  // Khoản cũ không có updatedAt → dùng createdAt
  const old = mergeRows([{ ...tx('g', ''), createdAt: '2026-10-01T00:00:00Z' }], [tx('g', '2026-10-02T00:00:00Z', { amount: 7 })]);
  check('không có updatedAt thì so bằng createdAt', byId(old.rows).g.amount === 7);
  check('gộp hai lần cho cùng kết quả', JSON.stringify(mergeRows(m.rows, B).rows.map(x => x.id).sort()) === JSON.stringify(m.rows.map(x => x.id).sort()) && mergeRows(m.rows, B).pulledIds.size === 0);

  const p = mergeProfile(
    { custom: { extraKeywords: { 'di-cho': ['bánh'] } }, customUpdatedAt: '2026-10-10T00:00:00Z', learned: { a: 'x', both: 'local' }, meta: { googleEmail: 'me' } },
    { custom: { extraKeywords: {} }, customUpdatedAt: '2026-10-12T00:00:00Z', learned: { b: 'y', both: 'remote' }, meta: { lastSync: 'r' } },
  );
  check('từ khoá: bản sửa sau thắng (xoá ở máy kia có tác dụng)', !p.custom.extraKeywords['di-cho']);
  check('phần đã học: gộp cả hai, máy này thắng khi trùng', p.learned.a === 'x' && p.learned.b === 'y' && p.learned.both === 'local');
  check('meta là của riêng từng máy', p.meta.googleEmail === 'me' && !p.meta.lastSync);
  const p2 = mergeProfile({ custom: { added: [{ id: 'c-1', name: 'Mèo' }] }, customUpdatedAt: '2026-10-12T00:00:00Z' },
    { custom: { added: [{ id: 'c-2', name: 'Cá cảnh' }] }, customUpdatedAt: '2026-10-10T00:00:00Z' });
  check('danh mục tự thêm ở hai máy đều được giữ', p2.custom.added.map(c => c.id).sort().join() === 'c-1,c-2');
  return results;
}
