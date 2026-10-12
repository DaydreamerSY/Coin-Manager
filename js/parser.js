// Bộ phân tích câu nói chi tiêu tiếng Việt — không dùng AI.
// Mẫu câu: "[tên khoản] [số tiền] [đơn vị]", ví dụ "bánh mì heo quay mười lăm nghìn".
// Hiểu cả chữ ("mười lăm nghìn") lẫn số do bộ nhận giọng nói trả về ("15.000", "15k").

const DIGIT = {
  'không': 0, 'một': 1, 'mốt': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'tư': 4,
  'năm': 5, 'lăm': 5, 'nhăm': 5, 'sáu': 6, 'bảy': 7, 'bẩy': 7, 'tám': 8, 'chín': 9,
};
// Chỉ đứng ở hàng đơn vị: hai mươi mốt, mười lăm, ba tư
const UNIT_ONLY = new Set(['mốt', 'lăm', 'nhăm', 'tư']);

const SCALE = { 'nghìn': 1e3, 'ngàn': 1e3, 'ngìn': 1e3, 'k': 1e3, 'ca': 1e3, 'ka': 1e3, 'triệu': 1e6, 'tr': 1e6, 'tỷ': 1e9, 'tỉ': 1e9 };
// Tiếng lóng dễ trùng với danh từ ("hai củ khoai", "xăng hai lít") nên chỉ tính là tiền
// khi đứng cuối câu hoặc trước từ nối.
const SLANG_SCALE = { 'cành': 1e3, 'lít': 1e5, 'xị': 1e5, 'củ': 1e6 };
const NUM_WORDS = new Set(['mười', 'mươi', 'chục', 'trăm', 'linh', 'lẻ', 'rưỡi', 'rưởi', 'hăm', 'băm']);
const CURRENCY = new Set(['đ', 'đồng', 'vnd', 'vnđ', '₫']);
const CONNECTORS = new Set([',', 'và', 'với', 'thêm', 'còn', 'rồi', 'xong', 'cộng', 'tiếp']);
const TRAILING_FILLERS = new Set(['hết', 'là', 'giá', 'mất', 'tốn', 'có', 'khoảng', 'tầm', 'chừng', 'thì', 'được', 'nhé', 'nha', 'ạ']);

const DATE_PHRASES = [
  ['hôm kia', -2], ['bữa kia', -2],
  ['hôm qua', -1], ['bữa qua', -1], ['tối qua', -1], ['đêm qua', -1], ['trưa qua', -1], ['chiều qua', -1], ['sáng qua', -1],
  ['hôm nay', 0], ['bữa nay', 0], ['sáng nay', 0], ['trưa nay', 0], ['chiều nay', 0], ['tối nay', 0],
].map(([p, off]) => [p.split(' '), off]);

export function parseNumeric(s) {
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, '')); // 15.000 / 1.234.567
  if (/^\d+[.,]\d+$/.test(s)) return Number(s.replace(',', '.'));              // 1,5 / 2.5
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

export function tokenize(text) {
  let s = String(text ?? '').normalize('NFC').toLowerCase();
  s = s.replace(/(\d)([^\d\s.,])/gu, '$1 $2').replace(/([^\d\s.,])(\d)/gu, '$1 $2'); // 15k → 15 k, 1tr5 → 1 tr 5
  s = s.replace(/-/g, ' ');
  s = s.replace(/[.,](?!\d)|(?<!\d)[.,]/g, ' , ').replace(/[;:!?\n\r…]+/g, ' , ');
  return s.split(/\s+/).filter(Boolean).map(w => {
    if (/^\d/.test(w)) {
      const num = parseNumeric(w);
      if (num != null) return { w, num };
    }
    return { w };
  });
}

const isRuoi = t => t.w === 'rưỡi' || t.w === 'rưởi';
const scaleOf = (t, slang) => SCALE[t.w] ?? (slang ? SLANG_SCALE[t.w] : undefined);

function digitOf(t, { tens = false } = {}) {
  if (t.num !== undefined) return Number.isInteger(t.num) && t.num <= 9 ? t.num : null;
  const d = DIGIT[t.w];
  if (d === undefined || (tens && UNIT_ONLY.has(t.w))) return null;
  return d;
}

function isNumberish(t, slang) {
  return t.num !== undefined || t.w in DIGIT || NUM_WORDS.has(t.w) || scaleOf(t, slang) !== undefined;
}

// < 100: "lăm", "mười lăm", "hai mươi mốt", "hai lăm", "ba chục", "băm sáu", "15"
function parseTens(t) {
  const n = t.length, w = t.map(x => x.w);
  if (n === 0) return null;
  if (n === 1) {
    if (t[0].num !== undefined) return t[0].num;
    if (w[0] === 'mười' || w[0] === 'chục') return 10;
    if (w[0] === 'hăm') return 20;
    if (w[0] === 'băm') return 30;
    return digitOf(t[0]);
  }
  if (w[0] === 'mười' || w[0] === 'hăm' || w[0] === 'băm') {
    if (n !== 2) return null;
    const u = digitOf(t[1]);
    return u ? { 'mười': 10, 'hăm': 20, 'băm': 30 }[w[0]] + u : null;
  }
  const d = digitOf(t[0], { tens: true });
  if (!d) return null;
  if (w[1] === 'mươi' || w[1] === 'chục') {
    if (n === 2) return d * 10;
    if (n !== 3) return null;
    const u = digitOf(t[2]);
    return u ? d * 10 + u : null;
  }
  // Nói tắt "hai lăm" = 25, "bốn mốt" = 41 — chỉ áp dụng cho chữ, không cho số viết
  if (n === 2 && d >= 2 && t[0].num === undefined && t[1].num === undefined) {
    const u = digitOf(t[1]);
    return u ? d * 10 + u : null;
  }
  return null;
}

// < 1000: "một trăm rưỡi", "hai trăm năm" (=250), "một trăm linh năm", "trăm hai" (=120)
function parseHundreds(t) {
  if (!t.length) return null;
  if (t.length === 1 && t[0].num !== undefined) return t[0].num;
  const i = t.findIndex(x => x.w === 'trăm');
  if (i === -1) return parseTens(t);
  if (i > 1 || t.slice(i + 1).some(x => x.w === 'trăm')) return null;
  const h = i === 0 ? 1 : digitOf(t[0], { tens: true });
  if (!h) return null;
  const r = t.slice(i + 1);
  if (!r.length) return h * 100;
  if (r.length === 1 && isRuoi(r[0])) return h * 100 + 50;
  if (r[0].w === 'linh' || r[0].w === 'lẻ') {
    const u = r.length === 2 ? digitOf(r[1]) : null;
    return u == null ? null : h * 100 + u;
  }
  if (r.length === 1) {
    const u = digitOf(r[0]);
    if (u != null) return h * 100 + u * 10;
  }
  const tens = parseTens(r);
  return tens != null && tens >= 10 && tens < 100 ? h * 100 + tens : null;
}

// Trả về giá trị đúng như đọc (chưa áp quy tắc "không đơn vị thì là nghìn"), hoặc null nếu không phải số hợp lệ.
export function parseNumber(t, slang = true) {
  if (!t.length) return null;
  let at = -1, S = 0;
  t.forEach((x, i) => {
    const s = scaleOf(x, slang);
    if (s && s > S) { S = s; at = i; }
  });
  if (at === -1) return parseHundreds(t);

  const L = t.slice(0, at), R = t.slice(at + 1);
  const left = L.length ? parseNumber(L, slang) : 1; // "nghìn rưỡi", "triệu hai"
  if (!left) return null;

  let right = 0;
  if (R.length) {
    const rHasScale = R.some(x => scaleOf(x, slang));
    if (rHasScale && !(t[at].w in SCALE)) return null; // "hai lít năm mươi nghìn": lít không đi kèm nghìn
    if (R.length === 1 && isRuoi(R[0])) {
      right = S / 2;                                    // "hai triệu rưỡi"
    } else if (R.length === 1 && digitOf(R[0]) != null) {
      right = digitOf(R[0]) * S / 10;                   // "ba triệu hai" = 3.200.000
    } else if (R[0].w === 'linh' || R[0].w === 'lẻ') {
      const v = parseHundreds(R.slice(1));
      if (v == null) return null;
      right = v * S / 1000;
    } else {
      const v = parseNumber(R, slang);
      if (v == null) return null;
      right = rHasScale ? v : v * S / 1000;             // "một triệu hai trăm" = 1.200.000
    }
    if (right >= S) return null;
  }
  return left * S + right;
}

function amountOf(span, slang) {
  const v = parseNumber(span, slang);
  if (v == null || v <= 0) return null;
  const hasScale = span.some(x => scaleOf(x, slang));
  // Không nói đơn vị và số < 1000 → hiểu là nghìn ("phở năm mươi lăm" = 55.000)
  return Math.round(!hasScale && v < 1000 ? v * 1000 : v);
}

// Dùng cho ô nhập số tiền: chấp nhận "15000", "15.000", "15k", "1tr2", "mười lăm nghìn"
export function parseAmount(text, { slang = true } = {}) {
  const toks = tokenize(text).filter(t => !CURRENCY.has(t.w) && t.w !== ',');
  return toks.length ? amountOf(toks, slang) : null;
}

// Tìm cụm số tiền dài nhất kết thúc ở cuối một dãy từ-số [a, b)
function bestPhrase(toks, a, b, slang) {
  let minStart = a;
  if (toks[a - 1]?.w === 'tháng') {
    // "tháng chín ba triệu": "chín" là tháng, không gộp thành 93 triệu.
    // Chỉ tách khi phía sau còn chữ số riêng ("mỗi tháng ba triệu" vẫn là 3 triệu).
    for (let k = Math.min(2, b - a - 1); k >= 1; k--) {
      const v = parseNumber(toks.slice(a, a + k), slang);
      if (v >= 1 && v <= 12 && Number.isInteger(v) && !scaleOf(toks[a + k], slang)) { minStart = a + k; break; }
    }
  }
  for (let s = minStart; s < b; s++) {
    const span = toks.slice(s, b);
    const amount = amountOf(span, slang);
    if (amount == null) continue;
    const next = toks[b];
    const hasStdScale = span.some(x => x.w in SCALE);
    const atBoundary = !next || CONNECTORS.has(next.w) || CURRENCY.has(next.w);
    // "bánh mì hai ổ ...": số không có đơn vị mà đứng giữa câu là số lượng, không phải tiền
    if (!hasStdScale && !atBoundary) return null;
    return { start: s, end: b, amount, text: span.map(x => x.w).join(' ') };
  }
  return null;
}

function cleanName(toks) {
  const w = toks.filter(t => !CURRENCY.has(t.w)).map(t => t.w);
  while (w.length && CONNECTORS.has(w[0])) w.shift();
  while (w.length && (CONNECTORS.has(w.at(-1)) || TRAILING_FILLERS.has(w.at(-1)))) w.pop();
  return w.join(' ').replace(/ , /g, ', ');
}

function stripDates(toks) {
  let dateOffset = null;
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const hit = DATE_PHRASES.find(([p]) => p.every((w, k) => toks[i + k]?.w === w));
    if (hit) {
      dateOffset ??= hit[1];
      i += hit[0].length - 1;
    } else {
      out.push(toks[i]);
    }
  }
  return { toks: out, dateOffset: dateOffset ?? 0 };
}

/**
 * Phân tích một câu nói thành các khoản.
 * @returns {{items: {name: string, amount: number, amountText: string}[], dateOffset: number, type: 'income'|'expense'|null}}
 */
export function parseUtterance(text, { slang = true } = {}) {
  let { toks, dateOffset } = stripDates(tokenize(text));
  while (toks[0] && CONNECTORS.has(toks[0].w)) toks.shift();

  // "thu ..." / "thu nhập ..." = khoản thu; "chi ..." = khoản chi
  let type = null;
  if (toks[0]?.w === 'thu') {
    type = 'income';
    toks = toks.slice(toks[1]?.w === 'nhập' ? 2 : 1);
  } else if (toks[0]?.w === 'chi' && toks[1] && toks[1].w !== 'phí') {
    type = 'expense';
    toks = toks.slice(toks[1].w === 'tiêu' ? 2 : 1);
  }

  const phrases = [];
  for (let i = 0; i < toks.length;) {
    if (!isNumberish(toks[i], slang)) { i++; continue; }
    let j = i;
    while (j < toks.length && isNumberish(toks[j], slang)) j++;
    const p = bestPhrase(toks, i, j, slang);
    if (p) phrases.push(p);
    i = j;
  }
  if (!phrases.length) return { items: [], dateOffset, type };

  // "mười lăm nghìn bánh mì" — nói số tiền trước, tên sau
  const amountFirst = phrases[0].start === 0 && phrases[0].end < toks.length;
  const items = phrases.map((p, k) => {
    const [a, b] = amountFirst
      ? [p.end, phrases[k + 1]?.start ?? toks.length]
      : [k === 0 ? 0 : phrases[k - 1].end, p.start];
    return { name: cleanName(toks.slice(a, b)), amount: p.amount, amountText: p.text };
  });
  if (!amountFirst) {
    const tail = cleanName(toks.slice(phrases.at(-1).end)); // "cà phê hai mươi nghìn ở highlands"
    if (tail) items.at(-1).name = [items.at(-1).name, tail].filter(Boolean).join(' ');
  }
  return { items, dateOffset, type };
}
