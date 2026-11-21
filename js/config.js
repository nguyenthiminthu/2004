// ============================================================
//  CẤU HÌNH APP OKR – Sơn Thế Hệ Mới
//  - Để trống SUPABASE_URL  => chạy CHẾ ĐỘ DEMO (lưu trên trình duyệt này)
//  - Điền URL + anon key    => chạy THẬT, nhiều người dùng chung dữ liệu
// ============================================================
window.OKR_CONFIG = {
  SUPABASE_URL: "",        // ví dụ: "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",   // Project Settings > API > anon public key

  COMPANY: "Công ty TNHH Sơn Thế Hệ Mới",
  APP_NAME: "THM · OKR Bộ phận",

  // Bộ phận có quyền XEM và SỬA OKR của tất cả bộ phận (cùng Ban giám đốc).
  // Trưởng các bộ phận còn lại chỉ xem và sửa OKR của bộ phận mình.
  // (Khi chạy Supabase, sửa cả hàm public.is_full_access() trong schema.sql cho khớp)
  FULL_ACCESS_DEPTS: ["HCNS"],

  // Tỷ lệ hoàn thành tối đa của 1 KR (1.5 = 150%, giống biểu mẫu Excel OKR)
  MAX_ACHIEVEMENT: 1.5,

  // Kỳ đánh giá: ngày bắt đầu kỳ trong tháng.
  //  1  => từ ngày 1 đến cuối tháng (tháng dương lịch)
  //  26 => từ 26 tháng trước đến 25 tháng này (như biểu mẫu mẫu)
  PERIOD_START_DAY: 1,

  // File đính kèm (minh chứng) trong phiếu OKR
  //  - Chế độ thật: lưu ở Supabase Storage, bucket BUCKET (tạo bằng supabase/schema.sql)
  //  - Chế độ demo: lưu trong trình duyệt (IndexedDB)
  //  Muốn đổi dung lượng tối đa: sửa MAX_MB ở đây VÀ file_size_limit trong schema.sql
  ATTACH: {
    BUCKET: "okr-files",
    MAX_MB: 10,              // dung lượng tối đa 1 file
    MAX_PER_SHEET: 60,       // số file tối đa trong 1 phiếu
    TYPES: {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", webp: "image/webp",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv"
    }
  },

  // Thông tin in trên file Excel
  EXCEL: {
    DON_VI: "Công ty TNHH Sơn Thế Hệ Mới",
    PHAM_VI: "Toàn công ty",
    NGUOI_LAP: "NGƯỜI LẬP BẢNG",
    PHE_DUYET: "CẤP PHÊ DUYỆT"
  },

  // Ngưỡng xếp loại (điểm %)
  RATING: [
    { min: 90, label: "Xuất sắc",       key: "good" },
    { min: 75, label: "Tốt",            key: "ok" },
    { min: 60, label: "Đạt",            key: "warning" },
    { min: 0,  label: "Cần cải thiện",  key: "critical" }
  ]
};
