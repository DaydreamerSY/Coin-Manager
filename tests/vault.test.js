import * as V from '../js/vault.js';

const FAST = { iterations: 1000 }; // test nhanh; app dùng 600.000

async function rejects(p) {
  try { await p; return false; } catch { return true; }
}

export async function runVaultTests() {
  const results = [];
  const check = (text, ok, detail = '') => results.push({ text: `[mã hoá] ${text}`, ok: !!ok, detail });

  const pass = 'mèo xanh đạp mây';
  const { vault, keys } = await V.createVault(pass, FAST);
  const stored = JSON.stringify(vault);
  check('vault không chứa mật khẩu', !stored.includes('mèo') && !stored.includes(V.toB64(new TextEncoder().encode(pass))));
  check('khoá phiên không xuất được', !keys.dek.extractable && !keys.priv.extractable);

  const tx = { id: 'a1', name: 'Bánh mì heo quay', amount: 15000, date: '2026-10-12' };
  const box = await V.encryptJson(keys.dek, 'tx:a1', tx);
  check('bản mã không lộ tên/số tiền', !JSON.stringify(box).includes('Bánh') && !JSON.stringify(box).includes('15000'));
  const back = await V.decryptJson(keys.dek, 'tx:a1', box);
  check('giải mã ra đúng dữ liệu', JSON.stringify(back) === JSON.stringify(tx));

  const again = await V.encryptJson(keys.dek, 'tx:a1', tx);
  check('cùng dữ liệu → bản mã khác nhau (IV ngẫu nhiên)', again.ct !== box.ct && again.iv !== box.iv);

  check('tráo bản mã sang khoản khác bị từ chối', await rejects(V.decryptJson(keys.dek, 'tx:b2', box)));
  const tampered = { ...box, ct: V.toB64(V.fromB64(box.ct).map((b, i) => (i === 3 ? b ^ 1 : b))) };
  check('sửa 1 bit bản mã bị phát hiện', await rejects(V.decryptJson(keys.dek, 'tx:a1', tampered)));

  const k2 = await V.unlockVault(vault, pass);
  check('mở khoá đúng mật khẩu', (await V.decryptJson(k2.dek, 'tx:a1', box)).amount === 15000);

  let wrong = null;
  try { await V.unlockVault(vault, 'mèo xanh đạp mây!'); } catch (e) { wrong = e; }
  check('sai mật khẩu → WrongPassphrase', wrong instanceof V.WrongPassphrase, wrong?.message);

  const nfd = pass.normalize('NFD');
  check('mật khẩu gõ kiểu tổ hợp (NFD) vẫn mở được', nfd !== pass && !!(await V.unlockVault(vault, nfd)));

  const sealed = await V.sealToPublic(vault.pub, 'tx:c3', { id: 'c3', name: 'Cà phê', amount: 25000 });
  check('hộp chờ: ghi được chỉ với khoá công khai', !!sealed.epk && !JSON.stringify(sealed).includes('Cà phê'));
  check('hộp chờ: mở bằng khoá riêng', (await V.openSealed(keys.priv, 'tx:c3', sealed)).amount === 25000);
  check('hộp chờ: sai nhãn bị từ chối', await rejects(V.openSealed(keys.priv, 'tx:zz', sealed)));
  const other = await V.createVault('mật khẩu khác hẳn', FAST);
  check('hộp chờ: khoá riêng khác không mở được', await rejects(V.openSealed(other.keys.priv, 'tx:c3', sealed)));

  const v2 = await V.changePassphrase(vault, pass, 'mật khẩu mới 2026', FAST);
  const k3 = await V.unlockVault(v2, 'mật khẩu mới 2026');
  check('đổi mật khẩu: dữ liệu cũ vẫn đọc được', (await V.decryptJson(k3.dek, 'tx:a1', box)).amount === 15000);
  check('đổi mật khẩu: mật khẩu cũ hết dùng được', await rejects(V.unlockVault(v2, pass)));
  check('đổi mật khẩu: khoá công khai giữ nguyên', v2.pub === vault.pub && v2.id === vault.id);
  check('đổi mật khẩu sai mật khẩu cũ bị từ chối', await rejects(V.changePassphrase(vault, 'sai rồi nhé', 'abcdefghij', FAST)));

  check('mật khẩu 7 ký tự bị chặn', V.passphraseIssues('abcdefg') !== '');
  check('PIN 8 số bị chặn', V.passphraseIssues('12345678') !== '');
  check('"aaaaaaaa" bị chặn', V.passphraseIssues('aaaaaaaa') !== '');
  check('câu ngắn có chữ dùng được', V.passphraseIssues('mèo xanh đạp mây') === '');

  // Thời gian mở khoá thật (600.000 vòng) trên máy này
  const t0 = performance.now();
  const real = await V.createVault(pass);
  const t1 = performance.now();
  await V.unlockVault(real.vault, pass);
  const t2 = performance.now();
  check('600.000 vòng PBKDF2', real.vault.kdf.iterations === 600000,
    `tạo ${Math.round(t1 - t0)}ms, mở khoá ${Math.round(t2 - t1)}ms trên máy này`);

  return results;
}
