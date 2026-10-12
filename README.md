# Coin Manager — Sổ Chi Tiêu

Ghi chi tiêu bằng giọng nói tiếng Việt. Bấm micro, nói *"bánh mì heo quay mười lăm nghìn"*, app tự tách **tên khoản**, **số tiền** và **danh mục**. Không dùng AI, không cần máy chủ: dữ liệu **mã hoá** và lưu ngay trên điện thoại.

**Mở app:** <https://daydreamersy.github.io/Coin-Manager/>

- Chạy trên **Chrome Android**, cài lên màn hình chính như app (PWA), mở được khi không có mạng.
- Nhận giọng nói bằng Web Speech API của Chrome (`vi-VN`). Phần này cần mạng; khi offline vẫn gõ tay được.
- Tách số tiền và phân loại bằng quy tắc viết tay ([js/parser.js](js/parser.js), [js/categories.js](js/categories.js)), kết quả luôn như nhau với cùng một câu.

## Cách nói

Mẫu câu: **`[tên khoản] [số tiền] [đơn vị]`**

| Bạn nói | App hiểu |
|---|---|
| bánh mì heo quay mười lăm nghìn | Bánh mì heo quay · 15.000đ · Ăn uống |
| bánh mì heo quay mười lăm ca / 15k | 15.000đ |
| cà phê sữa hai lăm k | 25.000đ · Cà phê & đồ uống |
| đổ xăng một trăm rưỡi | 150.000đ (không nói đơn vị → hiểu là nghìn) |
| tiền nhà ba triệu hai | 3.200.000đ · Nhà ở |
| tiền điện một triệu hai trăm ba mươi | 1.230.000đ |
| trà sữa ba mươi lăm nghìn và bánh tráng hai chục | 2 khoản: 35.000đ + 20.000đ |
| bánh mì hai ổ ba mươi nghìn | "Bánh mì hai ổ" · 30.000đ (số lượng không bị nhầm là tiền) |
| tiền điện tháng chín năm trăm nghìn | "Tiền điện tháng chín" · 500.000đ |
| hôm qua ăn phở năm mươi lăm nghìn | ghi vào ngày hôm qua |
| nhận lương mười lăm triệu · thu bán đồ cũ hai trăm nghìn | khoản **thu** |

- Đơn vị: nghìn / ngàn / k / ca, triệu / tr, tỷ. Tiếng lóng **củ** (triệu), **lít / xị** (trăm nghìn), **cành** (nghìn) bật/tắt trong Cài đặt.
- Nói tắt: hai lăm (25), bốn mốt (41), ba tư (34), băm sáu (36), trăm rưỡi (150), ba triệu hai (3,2 triệu).
- Danh mục đoán theo **từ khoá dài nhất** khớp trong tên ("grab food" → Ăn uống, "grab" → Di chuyển). Khi bạn đổi danh mục của một khoản, app **ghi nhớ** cho lần sau (xem/xoá trong Cài đặt → Đã học từ bạn).
- Thêm từ khoá riêng hoặc danh mục mới trong Cài đặt.

## Bảo mật

Lần đầu mở app, bạn tạo một mật khẩu (ít nhất 8 ký tự). Từ đó **mọi thứ ghi xuống trình duyệt đều là bản mã**:

| Lưu trong trình duyệt | Dạng |
|---|---|
| Từng khoản chi / thu (tên, số tiền, ngày, câu nói gốc) | AES-256-GCM, mỗi khoản một IV ngẫu nhiên, gắn với id để không tráo được |
| Danh mục tự thêm, từ khoá, phần đã học | AES-256-GCM |
| Khoản ghi lúc đang khoá (hộp chờ) | ECIES: ECDH P-256 + HKDF + AES-256-GCM |
| Muối, khoá đã bọc, khoá công khai | dạng thường (không lộ gì nếu không có mật khẩu) |
| Cài đặt tiếng lóng / tự lưu / thời gian tự khoá | dạng thường (không nhạy cảm) |

Cách hoạt động ([js/vault.js](js/vault.js)):

```
mật khẩu ──PBKDF2-SHA256, 600.000 vòng──► khoá bọc (không bao giờ lưu)
   ├─ bọc ─► khoá dữ liệu AES-256 ngẫu nhiên ─► mã hoá từng khoản
   └─ bọc ─► khoá riêng ECDH ─► mở hộp chờ
khoá công khai ECDH (để dạng thường) ─► ghi khoản mới khi đang khoá
```

- **Đang khoá vẫn ghi bằng giọng nói được.** Khoản mới được mã hoá một chiều bằng khoá công khai; chỉ khi nhập mật khẩu mới đọc được và được gộp vào sổ.
- Khoá chỉ nằm trong bộ nhớ khi app đang mở và **tự khoá** khi bạn rời app quá thời gian chọn trong Cài đặt (mặc định 5 phút). Khi khoá, dữ liệu đã giải mã bị xoá khỏi bộ nhớ và màn hình.
- Bàn phím tiếng Việt gõ dấu kiểu dựng sẵn hay tổ hợp đều ra cùng một mật khẩu (chuẩn hoá NFC).
- Chính sách CSP chỉ cho chạy script của chính app; không tải gì từ bên ngoài.

**Vì sao cần mã hoá dù dữ liệu chỉ nằm trên máy:** mọi trang GitHub Pages của cùng một tài khoản (`daydreamersy.github.io/...`) dùng **chung một origin**, nên trang khác của bạn (hoặc code bị chèn vào trang đó) đọc được IndexedDB của Coin Manager. Mã hoá khiến thứ đọc được chỉ là bản mã.

**Giới hạn — hãy biết trước:**

- **Quên mật khẩu là mất dữ liệu.** Không có cửa sau.
- Mã hoá không chống được kẻ đã chiếm được chính trang này (sửa code trong repo, hoặc một service worker ở gốc `daydreamersy.github.io` nếu sau này bạn tạo repo `DaydreamerSY.github.io`). Giữ tài khoản GitHub có 2FA.
- Mật khẩu yếu có thể bị dò nếu ai đó lấy được bản mã. App chặn mật khẩu < 8 ký tự và dãy số ngắn; một câu ngắn chỉ bạn biết là tốt nhất.
- Số lượng khoản và kích thước xấp xỉ mỗi khoản vẫn nhìn thấy được (nội dung thì không).
- Đổi mật khẩu chỉ bọc lại khoá: **bản sao lưu cũ vẫn mở được bằng mật khẩu cũ**.

## Sao lưu

Dữ liệu chỉ nằm trong Chrome trên điện thoại. Xoá dữ liệu Chrome hoặc gỡ app là mất. Vào **Cài đặt → Sao lưu (đã mã hoá)** định kỳ (app hiện số ngày kể từ lần sao lưu gần nhất).

- File sao lưu **vẫn là bản mã**; mở bằng mật khẩu lúc sao lưu.
- **Đổi điện thoại:** mở app trên máy mới → *Khôi phục từ bản sao lưu* ngay ở màn tạo mật khẩu → mở khoá bằng mật khẩu cũ.
- Nhập file từ một kho khoá khác (mật khẩu khác): app hỏi mật khẩu của file rồi mã hoá lại bằng khoá hiện tại.
- **Xuất Excel (CSV)** để mở bằng Excel / Google Sheets — file này **không mã hoá**, app sẽ hỏi lại trước khi xuất.

## Cài lên điện thoại

Mở <https://daydreamersy.github.io/Coin-Manager/> bằng Chrome → menu ⋮ → *Thêm vào màn hình chính* / *Cài đặt ứng dụng*. Lần đầu bấm micro, Chrome sẽ hỏi quyền dùng micro.

**Cập nhật:** `git push` lên nhánh `main`. App trên điện thoại tải bản mới ở nền, **lần mở kế tiếp** sẽ dùng bản mới.

## Chạy thử trên máy tính

```bash
python -m http.server 8765
```

- App: <http://localhost:8765/>. Nhận giọng nói chạy trong Chrome trên máy tính; ô gõ tay dùng chung bộ phân tích.
- Test: <http://localhost:8765/tests/> — bộ phân tích câu nói + mã hoá. Tiêu đề tab hiện `PASS n/n` hoặc `FAIL`.

## Cấu trúc

```
index.html             giao diện (tạo mật khẩu, mở khoá, 4 tab: Ghi, Lịch sử, Thống kê, Cài đặt)
js/parser.js           đọc số tiền tiếng Việt + tách nhiều khoản trong một câu
js/categories.js       danh mục, từ khoá, phân loại + ghi nhớ
js/vault.js            mã hoá: PBKDF2, AES-GCM, ECIES (Web Crypto, không thư viện)
js/store.js            lưu trữ đã mã hoá, hộp chờ, sao lưu
js/db.js               IndexedDB thô
js/app.js              điều khiển giao diện, khoá/mở khoá, thống kê
js/voice.js            Web Speech API (vi-VN)
js/charts.js           biểu đồ cột theo ngày (SVG, không thư viện)
sw.js                  chạy offline
tests/                 test (mở bằng trình duyệt)
```

## Hướng phát triển

- Đồng bộ điện thoại ↔ máy tính (Tailscale hoặc file sao lưu) để xem dashboard trên PC.
- Báo cáo cuối tháng bằng AI chạy trên máy: `gemma3:12b` qua Ollama (thử 10/10 câu tiếng lóng đúng; `qwen3:8b` chỉ 7/10 và có lần đọc "15 ca" thành 15 triệu). Nguyên tắc: code tính số, AI chỉ viết nhận xét.
