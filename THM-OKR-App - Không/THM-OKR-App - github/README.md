# THM · OKR Bộ phận

App để trưởng 11 bộ phận của Công ty TNHH Sơn Thế Hệ Mới đăng nhập, tự đặt mục tiêu (OKR) và tự đánh giá hiệu quả hằng tháng theo thang 100%. Ban giám đốc xem dashboard tổng quan, báo cáo từng bộ phận và so sánh các bộ phận theo tháng và cả năm.

## 1. Chạy thử ngay (chế độ DEMO)

Mở file `index.html` bằng Chrome/Edge (bấm đúp). Không cần cài đặt gì.

- Ban giám đốc: `admin@sonthehemoi.vn` / `admin123`
- Trưởng bộ phận: mật khẩu `123456` (ở màn hình đăng nhập có ô chọn nhanh tài khoản)
  `xuong@` · `ketoan@` · `kinhdoanh@` · `hcns@` · `xevanchuyen@` · `xevanphong@` · `khovattu@` · `khothanhpham@` · `baotri@` · `qc@` · `nghiencuu@` (đuôi `@sonthehemoi.vn`)

Chế độ demo lưu dữ liệu **trong trình duyệt của máy đang mở** và có sẵn dữ liệu mẫu từ tháng 1 tới tháng hiện tại. Nó dùng để duyệt giao diện và cách tính điểm, không dùng chung được giữa nhiều người.

## 2. Cách tính điểm (giống biểu mẫu Excel OKR)

| Cấp | Công thức |
|---|---|
| KR – Thuận | MIN(1 + (Thực hiện − Chỉ tiêu tháng) / \|Chỉ tiêu\|, 150%) |
| KR – Nghịch | MIN(1 − (Thực hiện − Chỉ tiêu tháng) / \|Chỉ tiêu\|, 150%) |
| Chỉ tiêu = 0 | Thực hiện = 0 → 100%; Thuận > 0 hoặc Nghịch < 0 → 150%; còn lại 0% |
| Mục tiêu | Trung bình % hoàn thành các KR đã có kết quả |
| Bộ phận / tháng | Σ (tỷ trọng mục tiêu × điểm mục tiêu), tổng tỷ trọng = 100% |
| Cả năm | Trung bình các tháng đã có điểm |

Mỗi phiếu có 2 cột kết quả: **CBNV đánh giá** do trưởng bộ phận tự nhập, và **QLTT đánh giá** do Ban giám đốc nhập. Mức trần 150% và ngày bắt đầu kỳ (`PERIOD_START_DAY`) sửa trong `js/config.js`.

Xếp loại: ≥ 90 Xuất sắc · 75–89 Tốt · 60–74 Đạt · < 60 Cần cải thiện.

Quy trình: trưởng bộ phận nhập OKR → **Lưu nháp** → nhập kết quả → **Nộp đánh giá** (khoá phiếu) → Ban giám đốc nhập cột BGĐ đánh giá, và có thể **Mở lại** phiếu.

## Xuất Excel

| Nút | File |
|---|---|
| Tổng quan › *Xuất Excel tổng hợp* | Sheet **Tong hop KQDG Bo phan** (bảng tổng hợp 11 bộ phận) + mỗi bộ phận 1 sheet biểu mẫu OKR |
| Nhập OKR / Báo cáo bộ phận › *Xuất Excel* | Biểu mẫu OKR của 1 bộ phận trong 1 tháng |
| So sánh cả năm › *Xuất Excel cả năm* | Bảng điểm 11 bộ phận × 12 tháng |

File Excel dùng đúng công thức của biểu mẫu gốc (IFERROR/MAX/MIN, AVERAGE, SUMPRODUCT), nên sửa số trong Excel thì điểm tự tính lại. Mã NV, chức danh, cấp bậc, nhóm CBNV và ngày vào công ty lấy từ mục **Tài khoản**.

## File đính kèm (minh chứng)

Trong màn hình **Nhập OKR**, mỗi KR có nút **📎 Đính kèm minh chứng**. Cuối phiếu có khu **File đính kèm của phiếu** dành cho tài liệu chung. Trên máy tính có thể kéo thả file vào.

- Định dạng: `.jpg .jpeg .png .gif .bmp .webp .doc .docx .xls .xlsx .csv`, tối đa **10 MB/file**, 60 file/phiếu (sửa `ATTACH` trong `js/config.js`).
- File được tải lên ngay khi chọn, nhưng **chỉ ghi vào phiếu khi bấm Lưu/Nộp**. Nếu bỏ thay đổi, file vừa tải lên sẽ bị xoá. File bị gỡ chỉ xoá hẳn sau khi lưu.
- Bấm vào ảnh để xem lớn, bấm vào file Word/Excel/CSV để tải về. Báo cáo bộ phận cũng hiện danh sách file (chỉ xem).
- Quyền: giống quyền sửa phiếu. Trưởng bộ phận chỉ thêm/gỡ file khi phiếu còn nháp; BGĐ và HCNS thêm/gỡ được mọi lúc.
- Chế độ demo lưu file trong trình duyệt (IndexedDB) của máy đã tải lên. Chế độ thật lưu ở **Supabase Storage**, bucket riêng tư `okr-files` (link xem file có hạn 60 phút). Gói miễn phí Supabase có 1 GB lưu trữ.
- **Cập nhật từ phiên bản cũ:** chạy lại toàn bộ `supabase/schema.sql` trong SQL Editor để thêm cột `attachments`, bucket `okr-files` và quyền truy cập.

## 3. Chạy thật cho nhiều người dùng cùng lúc (Supabase + Vercel)

Chế độ demo chỉ lưu trên một máy. Muốn 11 trưởng bộ phận và Ban giám đốc dùng chung dữ liệu, kể cả trên điện thoại, phải làm các bước dưới (khoảng 30 phút, cả hai dịch vụ đều có gói miễn phí):

1. Tạo project mới trên https://supabase.com, chọn region **Singapore** để gần Việt Nam.
2. Vào **SQL Editor**, dán toàn bộ `supabase/schema.sql` rồi bấm **Run**. File chạy lại được nhiều lần, ví dụ khi cập nhật phiên bản.
3. Vào **Authentication › Users › Add user**: tạo tài khoản cho Ban giám đốc và 11 trưởng bộ phận, tick *Auto Confirm User*.
4. Trong SQL Editor, đặt quyền admin:
   ```sql
   update public.profiles set role = 'admin', full_name = 'Ban giám đốc'
   where email = 'admin@sonthehemoi.vn';
   ```
5. Mở `js/config.js`, điền `SUPABASE_URL` và `SUPABASE_ANON_KEY` (lấy ở **Project Settings › API**).
6. Đưa lên mạng: vào https://vercel.com/new, kéo thả cả thư mục app. App là web tĩnh nên không cần build. Kết quả là một địa chỉ dạng `https://thm-okr.vercel.app`.
7. Đăng nhập bằng tài khoản admin › mục **Tài khoản** › gán vai trò, bộ phận, mã NV và chức danh cho từng người.
8. Gửi địa chỉ web cho các trưởng bộ phận qua Zalo, kèm hướng dẫn cài ở mục 4.

**Khi nhiều người dùng cùng lúc:**
- Mỗi người đăng nhập trên máy của mình. Dữ liệu nằm trên máy chủ Supabase nên điện thoại và máy tính luôn thấy cùng một số liệu.
- Mở lại app (chuyển từ ứng dụng khác về) sẽ tự tải số liệu mới nhất.
- **Chống ghi đè.** Ví dụ trưởng QC và HCNS cùng mở một phiếu. Nếu HCNS lưu trước, lúc trưởng QC bấm Lưu app sẽ báo *"Phiếu vừa được người khác cập nhật"* và cho chọn **Tải bản mới nhất** hoặc **Ghi đè**. Như vậy không ai vô tình xoá mất số liệu của người khác. Thời điểm cập nhật do máy chủ ghi, không phụ thuộc giờ trên điện thoại.
- Gói miễn phí của Supabase thừa sức cho khoảng 12 người dùng. Lưu ý: project miễn phí có thể bị tạm dừng nếu lâu không ai dùng (khoảng 1 tuần); khi đó vào trang Supabase bấm *Restore*.

## 4. Cài app lên điện thoại

App là *Progressive Web App*, cài thẳng từ trình duyệt, không cần CH Play hay App Store. Sau khi cài, app có biểu tượng **THM OKR** trên màn hình chính và mở toàn màn hình như app thường.

| Điện thoại | Cách cài |
|---|---|
| **Android** | Mở địa chỉ web bằng **Chrome** › bấm **⋮** › **Cài đặt ứng dụng** (hoặc *Thêm vào màn hình chính*). Trong app cũng có nút **📱 Cài app** (bấm ảnh đại diện góc trên). |
| **iPhone** | Mở bằng **Safari** › bấm nút **Chia sẻ** (ô vuông có mũi tên ↑) › **Thêm vào MH chính** › **Thêm**. |

⚠️ Nếu bấm link trong **Zalo**, link sẽ mở trong trình duyệt riêng của Zalo, không cài app được. Bấm **⋯ › Mở bằng trình duyệt** trước.

Giao diện trên điện thoại:
- Thanh tab ở dưới gồm Tổng quan, Nhập OKR, Báo cáo, So sánh.
- Mỗi KR hiện thành một thẻ dễ nhập.
- Nút **Lưu / Nộp** luôn nằm sát tay ở cuối màn hình.
- Bảng biểu tự gọn lại cho màn hình nhỏ.

Khi cập nhật app (sửa code rồi đưa lại lên Vercel), đổi `VERSION` trong `sw.js` để điện thoại tải bản mới.

Phân quyền (khoá ở cơ sở dữ liệu bằng Row Level Security):

| Tài khoản | Xem | Sửa |
|---|---|---|
| Ban giám đốc (admin) | Tất cả bộ phận, Tổng quan, So sánh | Mọi phiếu, cột BGĐ đánh giá, xoá phiếu, quản lý tài khoản |
| Trưởng Hành chính nhân sự | Tất cả bộ phận, Tổng quan, So sánh | Mọi phiếu (kể cả đã nộp), mở lại phiếu |
| Trưởng bộ phận khác | Chỉ bộ phận mình (Nhập OKR, Báo cáo bộ phận) | Phiếu của bộ phận mình khi còn nháp |
| Chỉ xem (viewer) | Tất cả | Không |

Muốn thêm bộ phận có quyền như HCNS: sửa `FULL_ACCESS_DEPTS` trong `js/config.js` và `array['HCNS']` trong `supabase/schema.sql`.

## 5. Cấu trúc thư mục

```
index.html            trang chính
manifest.webmanifest  khai báo app để cài lên điện thoại
sw.js                 service worker (cài app, mở được khi mạng yếu)
icons/                biểu tượng app
css/app.css           giao diện (có chế độ sáng/tối)
js/config.js          cấu hình: Supabase, ngưỡng xếp loại
js/data.js            lớp dữ liệu (Supabase hoặc demo) + công thức tính điểm
js/charts.js          biểu đồ cột (Chart.js)
js/export-xlsx.js     xuất Excel theo biểu mẫu OKR (ExcelJS)
js/app.js             các màn hình: Tổng quan, Nhập OKR, Báo cáo bộ phận, So sánh, Tài khoản
vendor/               Chart.js 4, supabase-js 2, ExcelJS 4 (đóng gói sẵn, chạy được khi không có mạng)
supabase/schema.sql   bảng, trigger, phân quyền
```
