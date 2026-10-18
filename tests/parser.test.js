import { parseUtterance, parseAmountInput as parseAmount } from '../js/parser.js';
import { buildCategories, classify } from '../js/categories.js';

const cats = buildCategories();

// [câu nói, [[tên, số tiền, danh mục?], ...], {dateOffset?, type?}]
const CASES = [
  ['bánh mì heo quay mười lăm ca', [['bánh mì heo quay', 15000, 'an-uong']]],
  ['bánh mì heo quay mười lăm nghìn', [['bánh mì heo quay', 15000, 'an-uong']]],
  ['Bánh mì heo quay 15 ca.', [['bánh mì heo quay', 15000]]],
  ['bánh mì heo quay 15k', [['bánh mì heo quay', 15000]]],
  ['Bánh mì heo quay 15.000 đồng', [['bánh mì heo quay', 15000]]],
  ['bánh mì heo quay 15000đ', [['bánh mì heo quay', 15000]]],
  ['cà phê sữa hai lăm k', [['cà phê sữa', 25000, 'do-uong']]],
  ['đổ xăng một trăm rưỡi', [['đổ xăng', 150000, 'di-chuyen']]],
  ['tiền nhà ba triệu hai', [['tiền nhà', 3200000, 'nha-o']]],
  ['trà sữa ba mươi lăm ngàn với bánh tráng trộn hai chục', [['trà sữa', 35000, 'do-uong'], ['bánh tráng trộn', 20000, 'an-uong']]],
  ['trà sữa ba mươi lăm nghìn bánh tráng hai mươi nghìn', [['trà sữa', 35000], ['bánh tráng', 20000]]],
  ['cơm tấm ba lăm, cà phê mười lăm', [['cơm tấm', 35000, 'an-uong'], ['cà phê', 15000, 'do-uong']]],
  ['grab đi làm bốn mốt nghìn', [['grab đi làm', 41000, 'di-chuyen']]],
  ['grab food bốn mươi nghìn', [['grab food', 40000, 'an-uong']]],
  ['mua áo hai lít rưỡi', [['mua áo', 250000, 'mua-sam']]],
  ['tiền điện một củ hai', [['tiền điện', 1200000, 'hoa-don']]],
  ['tiền điện tháng chín năm trăm nghìn', [['tiền điện tháng chín', 500000, 'hoa-don']]],
  ['tiền nhà tháng mười hai triệu', [['tiền nhà tháng mười', 2000000]]],
  ['tiền nhà tháng mười hai ba triệu', [['tiền nhà tháng mười hai', 3000000]]],
  ['tiền nhà tháng 9 3 triệu', [['tiền nhà tháng 9', 3000000]]],
  ['tiền nhà mỗi tháng ba triệu', [['tiền nhà mỗi tháng', 3000000]]],
  ['bánh mì hai ổ ba mươi nghìn', [['bánh mì hai ổ', 30000, 'an-uong']]],
  ['trứng 3 quả 20 nghìn', [['trứng 3 quả', 20000, 'di-cho']]],
  ['một chục trứng ba mươi nghìn', [['một chục trứng', 30000, 'di-cho']]],
  ['đổ xăng hai lít năm mươi nghìn', [['đổ xăng hai lít', 50000, 'di-chuyen']]],
  ['mua hai củ khoai năm nghìn', [['mua hai củ khoai', 5000]]],
  ['mười lăm nghìn bánh mì', [['bánh mì', 15000, 'an-uong']]],
  ['hôm qua ăn phở năm mươi lăm nghìn', [['ăn phở', 55000, 'an-uong']], { dateOffset: -1 }],
  ['tối qua đi nhậu năm trăm nghìn', [['đi nhậu', 500000, 'an-uong']], { dateOffset: -1 }],
  ['nhận lương mười lăm triệu', [['nhận lương', 15000000, 'luong']]],
  ['thu bán đồ cũ hai trăm nghìn', [['bán đồ cũ', 200000, 'thu-khac']], { type: 'income' }],
  ['tiền điện một triệu hai trăm ba mươi nghìn', [['tiền điện', 1230000]]],
  ['tiền điện một triệu hai trăm ba mươi', [['tiền điện', 1230000]]],
  ['học phí 2tr5', [['học phí', 2500000, 'hoc-tap']]],
  ['cắt tóc tám mươi', [['cắt tóc', 80000, 'ca-nhan']]],
  ['quà cho ba hai trăm nghìn', [['quà cho ba', 200000, 'gia-dinh']]],
  ['gửi xe năm nghìn', [['gửi xe', 5000, 'di-chuyen']]],
  ['điện thoại 7 triệu 990 nghìn', [['điện thoại', 7990000, 'mua-sam']]],
  ['netflix 260.000đ', [['netflix', 260000, 'giai-tri']]],
  ['bia ba ba ba mười lăm nghìn', [['bia ba ba ba', 15000, 'do-uong']]],
  ['vé máy bay 1,5 triệu', [['vé máy bay', 1500000, 'di-chuyen']]],
  ['sữa rửa mặt một trăm hai', [['sữa rửa mặt', 120000, 'ca-nhan']]],
  ['cà phê hai mươi nghìn ở highlands', [['cà phê ở highlands', 20000, 'do-uong']]],
  ['phở bò năm mươi nghìn hết', [['phở bò', 50000, 'an-uong']]],
  ['bún bò giá bốn lăm nghìn', [['bún bò', 45000, 'an-uong']]],
  ['hai trăm năm', [['', 250000]]],
  ['một trăm linh năm nghìn', [['', 105000]]],
  ['nghìn rưỡi', [['', 1500]]],
  ['hai triệu rưỡi', [['', 2500000]]],
  ['trăm rưỡi', [['', 150000]]],
  ['hai mươi mốt nghìn', [['', 21000]]],
  ['băm lăm nghìn', [['', 35000]]],
  ['một tỷ hai', [['', 1200000000]]],
  ['bánh mì heo quay', []],
  ['banh mi 15k', [['banh mi', 15000, 'an-uong']]],
  ['sửa máy giặt ba trăm nghìn', [['sửa máy giặt', 300000, null]]], // không được khớp nhầm "sữa"

  // Đọc nhiều món liền nhau, không nói đơn vị — giá là dấu ngăn cách
  ['bánh hai lăm nước ngọt hai lăm rau hai lăm', [['bánh', 25000, 'an-uong'], ['nước ngọt', 25000, 'do-uong'], ['rau', 25000, 'di-cho']]],
  ['bánh 25 nước ngọt 25 rau 25', [['bánh', 25000], ['nước ngọt', 25000], ['rau', 25000]]],
  ['siêu thị 100', [['siêu thị', 100000, 'di-cho']]],
  ['siêu thị một trăm', [['siêu thị', 100000]]],
  ['phở bò năm lăm cà phê hai mươi', [['phở bò', 55000], ['cà phê', 20000]]],
  ['cơm tấm ba lăm trà đá năm', [['cơm tấm', 35000], ['trà đá', 5000]]],
  ['bánh 25.000 nước ngọt 25.000', [['bánh', 25000], ['nước ngọt', 25000]]],
  // ...nhưng số lượng / cụm từ thường không bị nhầm là giá
  ['hai bánh mì ba mươi', [['hai bánh mì', 30000]]],
  ['ba lăm bánh mì', [['bánh mì', 35000]]],
  ['cà phê 2 ly 50', [['cà phê 2 ly', 50000]]],
  ['bánh bao hai cái hai mươi', [['bánh bao hai cái', 20000]]],
  ['mua thêm một chục trứng ba mươi', [['mua thêm một chục trứng', 30000]]],
  ['xăng 2 lít 50', [['xăng 2 lít', 50000, 'di-chuyen']]],
  ['quà năm mới hai trăm', [['quà năm mới', 200000]]],
  ['quà cho ba mẹ năm trăm', [['quà cho ba mẹ', 500000, 'gia-dinh']]],
  ['gym 3 tháng 1 triệu', [['gym 3 tháng', 1000000, 'suc-khoe']]],
  ['vé xem phim 2 người 180', [['vé xem phim 2 người', 180000, 'giai-tri']]],
  ['tiền điện tháng 9 500', [['tiền điện tháng 9', 500000, 'hoa-don']]],
  ['7 up 10', [['7 up', 10000]]],
];

const AMOUNT_CASES = [
  ['15000', 15000], ['15.000', 15000], ['15k', 15000], ['1tr2', 1200000], ['mười lăm nghìn', 15000],
  ['25', 25000], ['1,5 triệu', 1500000], ['abc', null],
  // Máy tính trong ô số tiền
  ['12 kẹo * 10000', 120000], ['12*10', 120000], ['12 x 10k', 120000], ['12x10k', 120000], ['100k - 15k', 85000],
  ['35+20', 55000], ['120000/12', 10000], ['(20+5)*2', 50000], ['2,5*4', 10000], ['1.500*2', 3000],
  ['3 ly × 25', 75000], ['200 ÷ 4', 50000], ['10/0', null], ['5-10', null], ['xăng 50 + gửi xe 5', 55000],
];

export function runParserTests() {
  const results = [];
  for (const [text, expected, opts = {}] of CASES) {
    const r = parseUtterance(text);
    const got = r.items.map(it => [it.name, it.amount, classify(it.name, cats)]);
    const errs = [];
    if (got.length !== expected.length) errs.push(`số khoản ${got.length} ≠ ${expected.length}`);
    expected.forEach(([name, amount, cat], i) => {
      const g = got[i];
      if (!g) return;
      if (g[0] !== name) errs.push(`tên "${g[0]}" ≠ "${name}"`);
      if (g[1] !== amount) errs.push(`tiền ${g[1]} ≠ ${amount}`);
      if (cat !== undefined && g[2] !== cat) errs.push(`danh mục ${g[2]} ≠ ${cat}`);
    });
    if (opts.dateOffset !== undefined && r.dateOffset !== opts.dateOffset) errs.push(`ngày ${r.dateOffset} ≠ ${opts.dateOffset}`);
    if (opts.type !== undefined && r.type !== opts.type) errs.push(`loại ${r.type} ≠ ${opts.type}`);
    results.push({ text, ok: !errs.length, detail: errs.join('; ') || got.map(g => `${g[0] || '∅'}=${g[1]} [${g[2]}]`).join(' | ') });
  }
  for (const [text, expected] of AMOUNT_CASES) {
    const got = parseAmount(text);
    results.push({ text: `[ô số tiền] ${text}`, ok: got === expected, detail: `${got}` + (got === expected ? '' : ` ≠ ${expected}`) });
  }

  // Phần đã học thắng từ khoá mặc định
  const learned = { 'bánh mì chảo': 'an-uong', 'trà': 'gia-dinh' };
  const lc = [
    ['bánh mì chảo', 'an-uong'], ['trà sữa', 'do-uong'], ['trà', 'gia-dinh'], ['mua trà biếu', 'gia-dinh'],
  ];
  for (const [name, cat] of lc) {
    const got = classify(name, cats, learned);
    results.push({ text: `[đã học] ${name}`, ok: got === cat, detail: `${got}` + (got === cat ? '' : ` ≠ ${cat}`) });
  }

  // Từ khoá bạn tự thêm thắng từ khoá có sẵn khi dài bằng nhau; từ có sẵn dài hơn vẫn thắng
  const mine = buildCategories({ extraKeywords: { 'di-cho': ['bánh', 'Bánh Flan'], 'gia-dinh': ['pate mèo'] } });
  for (const [name, cat] of [['bánh', 'di-cho'], ['bánh mì', 'an-uong'], ['bánh flan', 'di-cho'], ['pate mèo', 'gia-dinh'], ['banh', 'di-cho']]) {
    const got = classify(name, mine);
    results.push({ text: `[từ khoá riêng] ${name}`, ok: got === cat, detail: `${got}` + (got === cat ? '' : ` ≠ ${cat}`) });
  }
  return results;
}
