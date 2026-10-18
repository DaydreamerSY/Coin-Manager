// Gộp dữ liệu giữa các thiết bị (hàm thuần, không đụng tới mạng hay IndexedDB).
//
// Mỗi khoản có updatedAt. Khoản bị xoá để lại "dấu xoá" { id, deleted: true, updatedAt } — nếu không,
// khoản đã xoá ở máy này sẽ sống lại khi gộp dữ liệu từ máy kia.
// Luật: cùng id thì bản nào sửa sau cùng thắng (dấu xoá cũng là một lần sửa).

export const stamp = t => Date.parse(t?.updatedAt || t?.createdAt || 0) || 0;
export const isTomb = t => t?.deleted === true && typeof t.id === 'string' && stamp(t) > 0;

/**
 * @returns {{ rows: object[], pulledIds: Set<string>, pushed: number }}
 *   rows: kết quả gộp · pulledIds: các id lấy từ bên kia (cần ghi xuống máy này) · pushed: số khoản bên kia thiếu/cũ hơn
 */
export function mergeRows(local, remote) {
  const out = new Map(local.map(t => [t.id, t]));
  const remoteById = new Map(remote.map(t => [t.id, t]));
  const pulledIds = new Set();
  for (const r of remote) {
    const l = out.get(r.id);
    if (!l || stamp(r) > stamp(l)) {
      out.set(r.id, r);
      pulledIds.add(r.id);
    }
  }
  const pushed = local.filter(l => !remoteById.has(l.id) || stamp(l) > stamp(remoteById.get(l.id))).length;
  return { rows: [...out.values()], pulledIds, pushed };
}

/**
 * Danh mục tự thêm + từ khoá: bản sửa sau cùng thắng (để xoá từ khoá ở một máy cũng có tác dụng ở máy kia).
 * Phần "đã học": gộp cả hai, máy này thắng khi trùng. meta (lần sao lưu, tài khoản Google...) là của riêng từng máy.
 */
export function mergeProfile(local = {}, remote = {}) {
  const remoteNewer = (Date.parse(remote.customUpdatedAt || 0) || 0) > (Date.parse(local.customUpdatedAt || 0) || 0);
  const winner = (remoteNewer ? remote.custom : local.custom) ?? {};
  // Danh mục tự thêm: gộp cả hai (chưa có chức năng xoá danh mục) để khoản của máy kia không rơi vào "Khác"
  const added = new Map([...(remote.custom?.added ?? []), ...(local.custom?.added ?? [])].map(c => [c.id, c]));
  // Khoản cố định: theo từng quy tắc, bản sửa sau cùng thắng (xoá = { deleted: true } để máy kia cũng xoá)
  const recurring = new Map();
  for (const r of [...(local.recurring ?? []), ...(remote.recurring ?? [])]) {
    const cur = recurring.get(r.id);
    if (!cur || stamp(r) > stamp(cur)) recurring.set(r.id, r);
  }
  return {
    recurring: [...recurring.values()],
    custom: { extraKeywords: winner.extraKeywords ?? {}, added: [...added.values()] },
    customUpdatedAt: remoteNewer ? remote.customUpdatedAt : local.customUpdatedAt,
    learned: { ...(remote.learned ?? {}), ...(local.learned ?? {}) },
    meta: { ...(local.meta ?? {}) },
  };
}
