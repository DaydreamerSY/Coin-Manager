// Danh mục + từ khoá để tự phân loại (không dùng AI).
// Luật: từ khoá DÀI NHẤT khớp trong tên sẽ thắng ("grab food" → Ăn uống, "grab" → Di chuyển).
// Những lần bạn sửa danh mục được ghi nhớ ("learned") và ưu tiên hơn từ khoá mặc định.

export const DEFAULT_CATEGORIES = [
  { id: 'an-uong', tint: 0, name: 'Ăn uống', icon: '🍜', type: 'expense', keywords: [
    'ăn', 'ăn sáng', 'ăn trưa', 'ăn tối', 'ăn khuya', 'ăn vặt', 'ăn uống', 'đồ ăn', 'thức ăn', 'bữa sáng', 'bữa trưa', 'bữa tối',
    'bánh mì', 'cơm', 'cơm tấm', 'cơm gà', 'cơm văn phòng', 'cơm bình dân', 'phở', 'bún', 'bún bò', 'bún chả', 'bún riêu', 'bún đậu',
    'hủ tiếu', 'hủ tíu', 'mì', 'mì quảng', 'mì cay', 'cháo', 'xôi', 'bánh cuốn', 'bánh xèo', 'bánh canh', 'bánh bao', 'bánh',
    'bánh tráng', 'bánh tráng trộn', 'bánh bèo', 'bột chiên', 'lẩu', 'nướng', 'đồ nướng', 'gà rán', 'pizza', 'burger', 'hamburger',
    'kfc', 'lotteria', 'jollibee', 'mcdonald', 'bò bít tết', 'ốc', 'hải sản', 'sushi', 'dimsum', 'chè', 'kem', 'sữa chua', 'snack',
    'bim bim', 'trái cây', 'hoa quả', 'grab food', 'grabfood', 'shopee food', 'shopeefood', 'be food', 'nhậu', 'đi nhậu',
  ] },
  { id: 'do-uong', tint: 1, name: 'Cà phê & đồ uống', icon: '☕', type: 'expense', keywords: [
    'cà phê', 'cafe', 'cafê', 'coffee', 'cà phê sữa', 'cà phê đen', 'bạc xỉu', 'trà', 'trà sữa', 'trà đá', 'trà chanh', 'trà đào',
    'nước', 'nước mía', 'nước ép', 'nước dừa', 'sinh tố', 'nước ngọt', 'coca', 'pepsi', 'sting', 'redbull', 'bia', 'rượu',
    'highlands', 'phúc long', 'starbucks', 'katinat', 'cộng cà phê', 'the coffee house', 'trung nguyên', 'gong cha', 'phê la', 'mixue',
  ] },
  { id: 'di-cho', tint: 2, name: 'Đi chợ & siêu thị', icon: '🛒', type: 'expense', keywords: [
    'đi chợ', 'chợ', 'siêu thị', 'tạp hóa', 'tạp hoá', 'rau', 'rau củ', 'thịt', 'thịt heo', 'thịt bò', 'thịt gà', 'cá', 'tôm', 'mực',
    'trứng', 'gạo', 'dầu ăn', 'nước mắm', 'gia vị', 'đường', 'sữa', 'sữa tươi', 'mì gói', 'khoai', 'đậu', 'đậu hũ',
    'bách hóa xanh', 'bách hoá xanh', 'winmart', 'vinmart', 'coopmart', 'co op', 'aeon', 'lotte mart', 'mega market', 'big c',
    'circle k', 'gs25', 'ministop', '7 eleven', 'family mart',
  ] },
  { id: 'di-chuyen', tint: 3, name: 'Di chuyển', icon: '🛵', type: 'expense', keywords: [
    'xăng', 'đổ xăng', 'grab', 'grabbike', 'grab bike', 'grabcar', 'grab car', 'be', 'xanh sm', 'gojek', 'taxi', 'xe ôm',
    'gửi xe', 'giữ xe', 'đậu xe', 'đỗ xe', 'vé xe', 'xe buýt', 'xe bus', 'bus', 'vé tàu', 'tàu', 'metro', 'vé máy bay', 'máy bay',
    'rửa xe', 'sửa xe', 'vá xe', 'thay nhớt', 'bảo dưỡng xe', 'phí cầu đường', 'trạm thu phí', 'vetc',
  ] },
  { id: 'nha-o', tint: 4, name: 'Nhà ở', icon: '🏠', type: 'expense', keywords: [
    'tiền nhà', 'thuê nhà', 'tiền phòng', 'tiền trọ', 'phòng trọ', 'phí quản lý', 'phí dịch vụ', 'chung cư', 'sửa nhà',
    'đồ gia dụng', 'nội thất', 'dọn nhà',
  ] },
  { id: 'hoa-don', tint: 5, name: 'Hóa đơn', icon: '🧾', type: 'expense', keywords: [
    'tiền điện', 'điện', 'tiền nước', 'internet', 'wifi', 'tiền mạng', 'cước', 'cước điện thoại', 'tiền điện thoại', 'nạp tiền',
    'nạp tiền điện thoại', 'nạp card', 'thẻ cào', 'nạp data', '4g', '5g', 'gas', 'bình gas', 'truyền hình', 'k+', 'fpt', 'viettel',
    'vnpt', 'mobifone', 'vinaphone', 'tiền rác', 'hóa đơn', 'hoá đơn',
  ] },
  { id: 'mua-sam', tint: 6, name: 'Mua sắm', icon: '🛍️', type: 'expense', keywords: [
    'mua', 'mua sắm', 'quần', 'áo', 'quần áo', 'váy', 'giày', 'dép', 'túi', 'ví', 'balo', 'đồng hồ', 'kính', 'mũ', 'nón',
    'shopee', 'lazada', 'tiki', 'tiktok shop', 'sendo', 'điện thoại', 'laptop', 'tai nghe', 'sạc', 'ốp lưng', 'đồ dùng',
    'văn phòng phẩm', 'uniqlo', 'zara', 'h&m',
  ] },
  { id: 'suc-khoe', tint: 7, name: 'Sức khỏe', icon: '💊', type: 'expense', keywords: [
    'thuốc', 'nhà thuốc', 'mua thuốc', 'khám', 'khám bệnh', 'bệnh viện', 'phòng khám', 'nha khoa', 'răng', 'bác sĩ', 'xét nghiệm',
    'vitamin', 'bảo hiểm y tế', 'gym', 'tập gym', 'yoga', 'bơi', 'thể thao', 'pharmacity', 'long châu', 'an khang',
  ] },
  { id: 'giai-tri', tint: 8, name: 'Giải trí & du lịch', icon: '🎬', type: 'expense', keywords: [
    'xem phim', 'phim', 'cgv', 'lotte cinema', 'galaxy', 'bhd', 'netflix', 'spotify', 'youtube', 'youtube premium', 'game',
    'nạp game', 'steam', 'karaoke', 'du lịch', 'khách sạn', 'homestay', 'vé', 'concert', 'bida', 'bi a', 'vé tham quan',
  ] },
  { id: 'ca-nhan', tint: 9, name: 'Cá nhân & làm đẹp', icon: '💇', type: 'expense', keywords: [
    'cắt tóc', 'gội đầu', 'uốn tóc', 'nhuộm tóc', 'làm tóc', 'nail', 'làm nail', 'spa', 'mỹ phẩm', 'son', 'kem chống nắng',
    'sữa rửa mặt', 'dầu gội', 'sữa tắm', 'kem đánh răng', 'bàn chải', 'giặt ủi', 'giặt sấy', 'giặt đồ',
  ] },
  { id: 'hoc-tap', tint: 10, name: 'Học tập', icon: '📚', type: 'expense', keywords: [
    'học', 'học phí', 'khóa học', 'khoá học', 'sách', 'vở', 'tài liệu', 'udemy', 'coursera', 'tiếng anh', 'ielts', 'toeic',
  ] },
  { id: 'gia-dinh', tint: 11, name: 'Gia đình & quà', icon: '🎁', type: 'expense', keywords: [
    'quà', 'quà tặng', 'tặng', 'biếu', 'mừng', 'mừng cưới', 'đám cưới', 'đám giỗ', 'đám ma', 'phúng điếu', 'sinh nhật', 'lì xì',
    'từ thiện', 'cho con', 'cho mẹ', 'cho ba', 'cho bố', 'gửi về nhà', 'thú cưng', 'mèo', 'chó', 'pate',
  ] },
  { id: 'khac', tint: 12, name: 'Khác', icon: '📦', type: 'expense', keywords: [] },
  { id: 'luong', tint: 13, name: 'Lương & thưởng', icon: '💰', type: 'income', keywords: [
    'lương', 'tiền lương', 'nhận lương', 'lương tháng', 'thưởng', 'tiền thưởng', 'bonus', 'phụ cấp',
  ] },
  { id: 'thu-khac', tint: 13, name: 'Thu nhập khác', icon: '💵', type: 'income', keywords: [
    'thu nhập', 'nhận', 'nhận tiền', 'được cho', 'được tặng', 'bán', 'bán đồ', 'hoàn tiền', 'cashback', 'lãi', 'tiền lãi',
    'lãi tiết kiệm', 'cổ tức', 'làm thêm', 'freelance', 'tiền về',
  ] },
];

export const FALLBACK = { expense: 'khac', income: 'thu-khac' };

export function normalize(s) {
  return String(s ?? '').normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}&+\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').normalize('NFC');
}

export const TINT_COUNT = 14;
// Danh mục tự thêm: chọn màu pastel cố định theo id
function tintFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 12;
}

/** Gộp danh mục mặc định với tuỳ chỉnh của người dùng: { extraKeywords: {id: [..]}, added: [{id,name,icon,type}] } */
export function buildCategories(custom = {}) {
  const extra = custom.extraKeywords ?? {};
  return [...DEFAULT_CATEGORIES, ...(custom.added ?? [])].map(c => {
    const kws = [...new Set([...(c.keywords ?? []), ...(extra[c.id] ?? [])].map(normalize).filter(Boolean))];
    return { ...c, tint: Number.isInteger(c.tint) && c.tint >= 0 && c.tint < TINT_COUNT ? c.tint : tintFor(c.id), kw: kws.map(k => ({ k, plain: stripAccents(k) })) };
  });
}

function longestMatch(padded, entries) {
  let best = null, len = 0;
  for (const [k, id] of entries) {
    if (k.length > len && padded.includes(` ${k} `)) { best = id; len = k.length; }
  }
  return best;
}

/** Trả về id danh mục, hoặc null nếu không khớp gì. Truyền learned = {} để chỉ dùng từ khoá. */
export function classify(name, categories, learned = {}) {
  const n = normalize(name);
  if (!n) return null;
  if (learned[n]) return learned[n];
  // Cụm đã học đứng trước nên thắng khi dài bằng từ khoá
  const entries = [...Object.entries(learned), ...categories.flatMap(c => c.kw.map(({ k }) => [k, c.id]))];
  const hit = longestMatch(` ${n} `, entries);
  // Gõ không dấu ("banh mi") vẫn khớp được. Chỉ áp dụng khi cả câu không dấu,
  // nếu không "sửa máy giặt" sẽ khớp nhầm "sữa".
  if (hit || stripAccents(n) !== n) return hit;
  return longestMatch(` ${n} `, categories.flatMap(c => c.kw.map(({ plain }) => [plain, c.id])));
}
