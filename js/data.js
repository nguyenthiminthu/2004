// ============================================================
//  LỚP DỮ LIỆU: Supabase (thật) hoặc LocalStorage (demo)
//  Cùng một giao diện API để app.js không phải quan tâm.
// ============================================================
(function () {
  const CFG = window.OKR_CONFIG;

  const DEPARTMENTS = [
    { id: "SX", name: "Xưởng sản xuất", sort: 1 },
    { id: "KT", name: "Kế toán", sort: 2 },
    { id: "KD", name: "Kinh doanh", sort: 3 },
    { id: "HCNS", name: "Hành chính nhân sự", sort: 4 },
    { id: "XVC", name: "Đội xe vận chuyển", sort: 5 },
    { id: "XVP", name: "Đội xe văn phòng", sort: 6 },
    { id: "KVT", name: "Kho vật tư", sort: 7 },
    { id: "KTP", name: "Kho thành phẩm", sort: 8 },
    { id: "BT", name: "Bảo trì", sort: 9 },
    { id: "QC", name: "QC", sort: 10 },
    { id: "NC", name: "Nghiên cứu", sort: 11 }
  ];

  // ---------------- PHÂN QUYỀN ----------------
  //  admin (BGĐ)          : xem + sửa mọi bộ phận, chấm cột BGĐ, xoá phiếu, quản lý tài khoản
  //  head thuộc FULL_ACCESS_DEPTS (HCNS): xem + sửa mọi bộ phận (kể cả phiếu đã nộp), mở lại phiếu
  //  head khác            : chỉ xem + sửa bộ phận mình (sửa khi phiếu còn nháp)
  //  viewer               : xem tất cả, không sửa
  const perm = {
    isAdmin: (u) => !!u && u.role === "admin",
    isFull: (u) => !!u && (u.role === "admin" || (u.role === "head" && (CFG.FULL_ACCESS_DEPTS || []).includes(u.department_id))),
    seesAll: (u) => perm.isFull(u) || (!!u && u.role === "viewer"),
    canView: (u, dep) => perm.seesAll(u) || (!!u && u.department_id === dep),
    canEdit: (u, dep) => perm.isFull(u) || (!!u && u.role === "head" && u.department_id === dep),
    canEditSheet: (u, sheet) => perm.isFull(u) || (perm.canEdit(u, sheet.department_id) && sheet.status !== "submitted")
  };

  // ---------------- FILE ĐÍNH KÈM ----------------
  const ATT = CFG.ATTACH || { MAX_MB: 10, MAX_PER_SHEET: 60, BUCKET: "okr-files", TYPES: {} };
  const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(String(name || "")); return m ? m[1].toLowerCase() : ""; };
  const isImage = (meta) => /^image\//.test(meta && meta.type || "");
  const fileAccept = Object.keys(ATT.TYPES).map(e => "." + e).join(",");
  // Trả về chuỗi lỗi, hoặc null nếu file hợp lệ
  function checkFile(file) {
    const ext = extOf(file.name);
    if (!ATT.TYPES[ext]) return `"${file.name}": định dạng không được hỗ trợ. Chỉ nhận ${Object.keys(ATT.TYPES).join(", ")}.`;
    if (file.size > ATT.MAX_MB * 1024 * 1024) return `"${file.name}": vượt quá ${ATT.MAX_MB} MB.`;
    if (file.size === 0) return `"${file.name}": file rỗng.`;
    return null;
  }
  function attachMeta(user, sheet, file, krId) {
    const ext = extOf(file.name), id = uid() + uid();
    const mm = String(sheet.month).padStart(2, "0");
    return {
      id, name: file.name, size: file.size, ext, type: ATT.TYPES[ext],
      kr_id: krId || null,
      // Đường dẫn chỉ dùng ký tự ASCII (Supabase không nhận tên có dấu); tên gốc giữ trong "name"
      path: `${sheet.department_id}/${sheet.year}-${mm}/${id}.${ext}`,
      uploaded_by: user.id, uploaded_at: new Date().toISOString()
    };
  }
  function assertCanAttach(user, sheet, file) {
    if (!perm.canEditSheet(user, sheet)) throw new Error("Bạn không có quyền đính kèm file vào phiếu này.");
    const err = checkFile(file); if (err) throw new Error(err);
    if ((sheet.attachments || []).length >= ATT.MAX_PER_SHEET) throw new Error(`Mỗi phiếu tối đa ${ATT.MAX_PER_SHEET} file.`);
  }

  // Kho file cho chế độ demo (IndexedDB – chứa được nhiều MB, khác localStorage)
  const FileDB = {
    _p: null,
    open() {
      if (this._p) return this._p;
      this._p = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error("Trình duyệt không hỗ trợ lưu file (IndexedDB)."));
        const r = indexedDB.open("thm_okr_files", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("files");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return this._p;
    },
    async _tx(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction("files", mode), st = tx.objectStore("files");
        const req = fn(st);
        tx.oncomplete = () => res(req && req.result);
        tx.onerror = () => rej(tx.error || new Error("Lỗi lưu file trên trình duyệt."));
        tx.onabort = () => rej(tx.error || new Error("Không đủ dung lượng lưu file trên trình duyệt."));
      });
    },
    put(key, blob) { return this._tx("readwrite", st => st.put(blob, key)); },
    get(key) { return this._tx("readonly", st => st.get(key)); },
    del(key) { return this._tx("readwrite", st => st.delete(key)); },
    clear() { return this._tx("readwrite", st => st.clear()); }
  };

  // Lỗi xung đột: người khác vừa lưu phiếu này
  function conflictError(current) { const e = new Error("Phiếu vừa được người khác cập nhật."); e.code = "CONFLICT"; e.current = current; return e; }

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  // ---------------- TÍNH ĐIỂM ----------------
  // Theo đúng công thức của biểu mẫu Excel OKR:
  //  Thuận : MIN(1 + (TH - CT)/|CT|, trần)      Nghịch: MIN(1 - (TH - CT)/|CT|, trần)
  //  CT = 0: TH = 0 -> 100%; Thuận TH > 0 / Nghịch TH < 0 -> trần; còn lại 0%. Không âm.
  //  Mục tiêu = TRUNG BÌNH các KR đã có kết quả.  Tổng = Σ tỷ trọng mục tiêu × điểm mục tiêu.
  const blank = (v) => v === "" || v == null || (typeof v === "number" && isNaN(v));
  function krAchievement(kr, value) {
    const a = arguments.length < 2 ? kr.actual : value;
    if (blank(a) || blank(kr.target)) return null;
    const A = Number(a), T = Number(kr.target), cap = CFG.MAX_ACHIEVEMENT || 1.5;
    if (isNaN(A) || isNaN(T)) return null;
    const up = kr.direction !== "down";
    let r;
    if (T === 0) r = A === 0 ? 1 : (up ? (A > 0 ? cap : 0) : (A < 0 ? cap : 0));
    else r = Math.min(up ? 1 + (A - T) / Math.abs(T) : 1 - (A - T) / Math.abs(T), cap);
    return Math.max(r, 0);
  }
  // getVal(kr) trả về số thực tế cần chấm (mặc định: bộ phận tự đánh giá)
  function objectiveScore(obj, getVal) {
    const vals = (obj.krs || []).map(k => krAchievement(k, getVal ? getVal(k) : k.actual)).filter(v => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }
  function sheetScore(objectives, getVal) {
    const objs = objectives || [];
    let any = false, total = 0;
    objs.forEach(o => { const sc = objectiveScore(o, getVal); if (sc != null) any = true; total += (Number(o.weight) || 0) / 100 * (sc || 0); });
    return any ? Math.round(total * 10000) / 100 : null;
  }
  const bgdGetter = (sheet) => (k) => (sheet.bgd || {})[k.id];
  function bgdScore(sheet) { return sheetScore(sheet.objectives, bgdGetter(sheet)); }
  function validateSheet(objectives) {
    const errs = [];
    const objs = objectives || [];
    if (!objs.length) errs.push("Chưa có mục tiêu nào.");
    const ow = objs.reduce((s, o) => s + (Number(o.weight) || 0), 0);
    if (objs.length && Math.abs(ow - 100) > 0.01) errs.push(`Tổng tỷ trọng các mục tiêu = ${ow}% (phải bằng 100%).`);
    objs.forEach((o, i) => {
      const n = `Mục tiêu ${i + 1}`;
      if (!String(o.title || "").trim()) errs.push(`${n}: chưa có nội dung.`);
      const krs = o.krs || [];
      if (!krs.length) errs.push(`${n}: chưa có kết quả then chốt (KR).`);
      krs.forEach((k, j) => {
        if (!String(k.title || "").trim()) errs.push(`${n} – KR ${j + 1}: chưa có nội dung.`);
        if (blank(k.target) || isNaN(Number(k.target))) errs.push(`${n} – KR ${j + 1}: chưa có chỉ tiêu tháng.`);
        if (blank(k.actual) || isNaN(Number(k.actual))) errs.push(`${n} – KR ${j + 1}: chưa nhập kết quả thực hiện.`);
      });
    });
    return errs;
  }
  // Ngày bắt đầu / kết thúc kỳ đánh giá
  function period(year, month) {
    const d = CFG.PERIOD_START_DAY || 1;
    if (d <= 1) return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0) };
    return { start: new Date(year, month - 2, d), end: new Date(year, month - 1, d - 1) };
  }
  function rating(score) {
    if (score == null) return null;
    return CFG.RATING.find(r => score >= r.min) || CFG.RATING[CFG.RATING.length - 1];
  }

  // ============================================================
  //  BACKEND DEMO (localStorage)
  // ============================================================
  const LS_KEY = "thm_okr_demo_v2";
  const SESSION_KEY = "thm_okr_demo_session";

  const TEMPLATES = {
    SX: [["Đảm bảo sản lượng theo kế hoạch", 60, [["Lệnh sản xuất hoàn thành đúng hạn", "%", 95, "up", 60], ["Sản lượng sơn xuất xưởng", "tấn", 180, "up", 40]]],
         ["Giảm hao hụt và làm lại", 40, [["Tỷ lệ hao hụt nguyên liệu", "%", 1.5, "down", 50], ["Số mẻ phải điều chỉnh lại", "mẻ", 3, "down", 50]]]],
    KT: [["Báo cáo tài chính chính xác, kịp thời", 50, [["Báo cáo nộp đúng hạn", "%", 100, "up", 60], ["Sai sót hạch toán phát hiện", "lỗi", 2, "down", 40]]],
         ["Kiểm soát công nợ", 50, [["Tỷ lệ công nợ quá hạn", "%", 10, "down", 50], ["Số ngày thu tiền bình quân (DSO)", "ngày", 45, "down", 50]]]],
    KD: [["Tăng trưởng doanh thu", 60, [["Doanh thu tháng", "tỷ đồng", 12, "up", 70], ["Khách hàng mới", "KH", 5, "up", 30]]],
         ["Nâng cao chăm sóc khách hàng", 40, [["Khiếu nại phản hồi trong 48h", "%", 95, "up", 50], ["Tỷ lệ thu hồi công nợ", "%", 90, "up", 50]]]],
    HCNS: [["Tuyển dụng và đào tạo", 50, [["Vị trí tuyển dụng đúng hạn", "%", 90, "up", 50], ["Giờ đào tạo bình quân/người", "giờ", 4, "up", 50]]],
           ["Ổn định nhân sự", 50, [["Tỷ lệ nghỉ việc", "%", 2, "down", 60], ["Lương, BHXH chi trả đúng hạn", "%", 100, "up", 40]]]],
    XVC: [["Giao hàng đúng hẹn", 60, [["Đơn giao đúng hẹn", "%", 97, "up", 60], ["Số chuyến giao hàng", "chuyến", 220, "up", 40]]],
          ["Kiểm soát chi phí và an toàn", 40, [["Nhiên liệu bình quân/100 km", "lít", 18, "down", 50], ["Sự cố, va chạm giao thông", "vụ", 1, "down", 50]]]],
    XVP: [["Đáp ứng nhu cầu đi lại", 50, [["Yêu cầu điều xe được đáp ứng", "%", 98, "up", 60], ["Phản ánh của người sử dụng", "lần", 2, "down", 40]]],
          ["Bảo dưỡng phương tiện", 50, [["Xe bảo dưỡng đúng lịch", "%", 100, "up", 50], ["Chi phí sửa chữa phát sinh", "triệu đồng", 10, "down", 50]]]],
    KVT: [["Đảm bảo cung ứng vật tư", 60, [["Lệnh SX không bị thiếu vật tư", "%", 98, "up", 60], ["Mã vật tư tồn quá hạn sử dụng", "mã", 3, "down", 40]]],
          ["Chính xác số liệu tồn kho", 40, [["Chênh lệch kiểm kê", "%", 0.5, "down", 60], ["Phiếu nhập/xuất cập nhật trong ngày", "%", 100, "up", 40]]]],
    KTP: [["Xuất hàng chính xác", 60, [["Đơn xuất đúng, đủ chủng loại", "%", 99.5, "up", 60], ["Thời gian chuẩn bị đơn hàng", "giờ", 4, "down", 40]]],
          ["Quản lý tồn kho thành phẩm", 40, [["Hàng tồn trên 6 tháng", "%", 5, "down", 50], ["Tuân thủ FIFO", "%", 100, "up", 50]]]],
    BT: [["Thiết bị vận hành ổn định", 60, [["Thời gian dừng máy ngoài kế hoạch", "giờ", 8, "down", 50], ["Hoàn thành bảo trì phòng ngừa", "%", 95, "up", 50]]],
         ["Xử lý sự cố nhanh", 40, [["Sự cố được xử lý trong 2 giờ", "%", 90, "up", 60], ["Chi phí phụ tùng thay thế", "triệu đồng", 30, "down", 40]]]],
    QC: [["Kiểm soát chất lượng sản phẩm", 60, [["Mẻ đạt ngay lần kiểm tra đầu", "%", 95, "up", 60], ["Khiếu nại chất lượng từ khách hàng", "vụ", 1, "down", 40]]],
         ["Kiểm tra đúng hạn, tin cậy", 40, [["Mẫu trả kết quả trong 24h", "%", 95, "up", 50], ["Thiết bị đo hiệu chuẩn đúng hạn", "%", 100, "up", 50]]]],
    NC: [["Phát triển sản phẩm mới", 60, [["Công thức mới hoàn thiện", "công thức", 2, "up", 50], ["Mẫu thử nghiệm phòng lab đạt", "%", 80, "up", 50]]],
         ["Tối ưu giá thành và hồ sơ kỹ thuật", 40, [["Giảm giá thành công thức", "%", 3, "up", 50], ["Bộ hồ sơ TDS/MSDS cập nhật", "bộ", 4, "up", 50]]]]
  };

  const HEAD_EMAILS = { SX: "xuong", KT: "ketoan", KD: "kinhdoanh", HCNS: "hcns", XVC: "xevanchuyen", XVP: "xevanphong", KVT: "khovattu", KTP: "khothanhpham", BT: "baotri", QC: "qc", NC: "nghiencuu" };

  function seededRand(seed) {
    let h = 2166136261;
    for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function roundFor(v, target) {
    if (Math.abs(target) < 10 && target % 1 !== 0) return Math.round(v * 100) / 100;
    if (Math.abs(target) < 20) return Math.round(v * 10) / 10;
    return Math.round(v);
  }
  function buildDemoObjectives(dep, year, month, filled) {
    const rnd = seededRand(dep + year + "-" + month);
    const skill = [0.80, 0.88, 0.84, 0.92, 0.95, 0.74, 0.78, 0.90, 0.86, 0.93, 0.70][DEPARTMENTS.findIndex(d => d.id === dep)]; // mỗi bộ phận 1 "mặt bằng" khác nhau
    return TEMPLATES[dep].map(([title, w, krs]) => ({
      id: uid(), title, weight: w,
      krs: krs.map(([t, unit, target, dir, kw]) => {
        let actual = "";
        if (filled) {
          const f = skill + (rnd() - 0.5) * 0.45 + Math.sin(month / 2 + dep.length) * 0.05;
          actual = dir === "up" ? roundFor(target * Math.min(f, 1.12), target) : roundFor(target * (2 - Math.min(f, 1.15)), target);
          if (actual < 0) actual = 0;
        }
        return { id: uid(), title: t, unit, target, target_year: "", method: dir === "up" ? "Thực tế ÷ chỉ tiêu tháng" : "Thực tế càng thấp hơn chỉ tiêu càng tốt", actual, direction: dir, note: "" };
      })
    }));
  }
  function demoBgd(objectives, dep, year, month) {
    const rnd = seededRand("bgd" + dep + year + month), bgd = {};
    objectives.forEach(o => o.krs.forEach(k => {
      if (k.actual === "") return;
      const adj = rnd() < 0.6 ? 1 : 1 + (rnd() - 0.6) * 0.15;
      bgd[k.id] = roundFor(Number(k.actual) * adj, Number(k.target));
    }));
    return bgd;
  }
  function buildSeed() {
    const now = new Date();
    const curY = now.getFullYear(), curM = now.getMonth() + 1;
    const users = [{ id: "u-admin", email: "admin@sonthehemoi.vn", password: "admin123", full_name: "Ban giám đốc", role: "admin", department_id: null, employee_code: "THM001", title: "Giám đốc", hr_level: "", staff_group: "", join_date: "" }];
    DEPARTMENTS.forEach((d, i) => users.push({ id: "u-" + d.id, email: HEAD_EMAILS[d.id] + "@sonthehemoi.vn", password: "123456", full_name: "Trưởng " + d.name, role: "head", department_id: d.id, employee_code: "THM" + String(i + 2).padStart(3, "0"), title: "Trưởng bộ phận " + d.name, hr_level: "", staff_group: "", join_date: "" }));
    const sheets = [];
    for (let m = 1; m < curM; m++) {
      DEPARTMENTS.forEach(d => {
        const objectives = buildDemoObjectives(d.id, curY, m, true);
        const bgd = m < curM - 1 ? demoBgd(objectives, d.id, curY, m) : {};
        const sh = { objectives, bgd };
        sheets.push({ id: uid(), department_id: d.id, year: curY, month: m, objectives, bgd, comment: "", score: sheetScore(objectives), score_bgd: bgdScore(sh), status: "submitted", updated_by: "u-" + d.id, updated_at: new Date(curY, m, 3).toISOString() });
      });
    }
    // tháng hiện tại: vài bộ phận đã nhập nháp
    ["SX", "KD", "QC", "KT"].forEach(id => {
      const objectives = buildDemoObjectives(id, curY, curM, true);
      sheets.push({ id: uid(), department_id: id, year: curY, month: curM, objectives, comment: "", score: sheetScore(objectives), status: "draft", updated_by: "u-" + id, updated_at: new Date().toISOString() });
    });
    return { departments: DEPARTMENTS, users, sheets };
  }

  const DemoBackend = {
    mode: "demo",
    _db() {
      let raw = null;
      try { raw = localStorage.getItem(LS_KEY); } catch (e) {}
      if (!raw) { const s = buildSeed(); this._save(s); return s; }
      return JSON.parse(raw);
    },
    _save(db) { try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { console.warn(e); } },
    async login(email, password) {
      const db = this._db();
      const u = db.users.find(x => x.email.toLowerCase() === String(email).trim().toLowerCase() && x.password === password);
      if (!u) throw new Error("Sai email hoặc mật khẩu.");
      try { localStorage.setItem(SESSION_KEY, u.id); } catch (e) {}
      return this._pub(u);
    },
    _pub(u) { return { id: u.id, email: u.email, full_name: u.full_name, role: u.role, department_id: u.department_id, employee_code: u.employee_code || "", title: u.title || "", hr_level: u.hr_level || "", staff_group: u.staff_group || "", join_date: u.join_date || "" }; },
    async currentUser() {
      let id = null;
      try { id = localStorage.getItem(SESSION_KEY); } catch (e) {}
      if (!id) return null;
      const u = this._db().users.find(x => x.id === id);
      return u ? this._pub(u) : null;
    },
    async logout() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} },
    async departments() { return this._db().departments.slice().sort((a, b) => a.sort - b.sort); },
    _me() { let id = null; try { id = localStorage.getItem(SESSION_KEY); } catch (e) {} return this._db().users.find(x => x.id === id) || null; },
    async sheetsByYear(year) { const me = this._me(); return this._db().sheets.filter(s => s.year === Number(year) && perm.canView(me, s.department_id)); },
    async getSheet(dep, year, month) {
      if (!perm.canView(this._me(), dep)) return null;
      return this._db().sheets.find(s => s.department_id === dep && s.year === Number(year) && s.month === Number(month)) || null;
    },
    async saveSheet(user, sheet, opts = {}) {
      const db = this._db();
      if (!perm.canEdit(user, sheet.department_id)) throw new Error("Bạn không có quyền sửa phiếu của bộ phận này.");
      const i = db.sheets.findIndex(s => s.department_id === sheet.department_id && s.year === sheet.year && s.month === sheet.month);
      if (!opts.force && i >= 0 && db.sheets[i].updated_at !== sheet.updated_at) throw conflictError(db.sheets[i]);
      if (i >= 0 && db.sheets[i].status === "submitted" && !perm.isFull(user)) throw new Error("Phiếu đã nộp, không thể sửa. Liên hệ Ban giám đốc hoặc Hành chính nhân sự để mở lại.");
      const row = { ...sheet, id: i >= 0 ? db.sheets[i].id : uid(), updated_by: user.id, updated_at: new Date().toISOString() };
      if (user.role !== "admin") row.bgd = i >= 0 ? (db.sheets[i].bgd || {}) : {};   // chỉ BGĐ được chấm cột BGĐ
      row.score = sheetScore(row.objectives); row.score_bgd = bgdScore(row);
      if (i >= 0) db.sheets[i] = row; else db.sheets.push(row);
      this._save(db);
      return row;
    },
    async deleteSheet(user, dep, year, month) {
      if (user.role !== "admin") throw new Error("Chỉ Ban giám đốc được xoá phiếu.");
      const db = this._db();
      db.sheets = db.sheets.filter(s => !(s.department_id === dep && s.year === Number(year) && s.month === Number(month)));
      this._save(db);
    },
    async users() { return this._db().users.map(u => this._pub(u)); },
    async saveUser(actor, u) {
      if (actor.role !== "admin") throw new Error("Chỉ Ban giám đốc quản lý tài khoản.");
      const db = this._db();
      const email = String(u.email || "").trim().toLowerCase();
      if (!email) throw new Error("Thiếu email.");
      if (db.users.some(x => x.email.toLowerCase() === email && x.id !== u.id)) throw new Error("Email đã tồn tại.");
      if (u.id) {
        const x = db.users.find(y => y.id === u.id);
        Object.assign(x, { email, full_name: u.full_name, role: u.role, department_id: u.department_id || null, employee_code: u.employee_code || "", title: u.title || "", hr_level: u.hr_level || "", staff_group: u.staff_group || "", join_date: u.join_date || "" });
        if (u.password) x.password = u.password;
      } else {
        if (!u.password) throw new Error("Cần đặt mật khẩu cho tài khoản mới.");
        db.users.push({ id: "u-" + uid(), email, password: u.password, full_name: u.full_name, role: u.role, department_id: u.department_id || null, employee_code: u.employee_code || "", title: u.title || "", hr_level: u.hr_level || "", staff_group: u.staff_group || "", join_date: u.join_date || "" });
      }
      this._save(db);
    },
    async deleteUser(actor, id) {
      if (actor.role !== "admin") throw new Error("Chỉ Ban giám đốc quản lý tài khoản.");
      if (id === actor.id) throw new Error("Không thể xoá chính mình.");
      const db = this._db(); db.users = db.users.filter(u => u.id !== id); this._save(db);
    },
    async changePassword(user, oldPw, newPw) {
      const db = this._db(); const u = db.users.find(x => x.id === user.id);
      if (!u || u.password !== oldPw) throw new Error("Mật khẩu hiện tại không đúng.");
      u.password = newPw; this._save(db);
    },
    // ---- file đính kèm (demo) ----
    async uploadAttachment(user, sheet, file, krId) {
      assertCanAttach(user, sheet, file);
      const meta = attachMeta(user, sheet, file, krId);
      await FileDB.put(meta.path, file);
      return meta;
    },
    async attachmentUrl(meta) {
      const blob = await FileDB.get(meta.path);
      if (!blob) throw new Error(`Không tìm thấy file "${meta.name}" trên máy này (chế độ demo chỉ lưu file trên trình duyệt đã tải lên).`);
      return URL.createObjectURL(new Blob([blob], { type: meta.type }));
    },
    async deleteAttachmentFiles(metas) { for (const m of metas || []) { try { await FileDB.del(m.path); } catch (e) { console.warn(e); } } },
    async resetDemo() { const s = buildSeed(); this._save(s); try { await FileDB.clear(); } catch (e) {} },
    async clearAllSheets() { const db = this._db(); db.sheets = []; this._save(db); try { await FileDB.clear(); } catch (e) {} }
  };

  // ============================================================
  //  BACKEND SUPABASE
  // ============================================================
  function makeSupabaseBackend() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    async function profileOf(authUser) {
      const p = chk(await sb.from("profiles").select("*").eq("id", authUser.id).maybeSingle());
      return { ...(p || {}), id: authUser.id, email: authUser.email, full_name: p?.full_name || authUser.email, role: p?.role || "viewer", department_id: p?.department_id || null };
    }
    return {
      mode: "supabase",
      async login(email, password) {
        const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Sai email hoặc mật khẩu." : error.message);
        return profileOf(data.user);
      },
      async currentUser() {
        const { data } = await sb.auth.getSession();
        return data.session ? profileOf(data.session.user) : null;
      },
      async logout() { await sb.auth.signOut(); },
      async departments() { return chk(await sb.from("departments").select("*").order("sort")); },
      async sheetsByYear(year) { return chk(await sb.from("okr_sheets").select("*").eq("year", Number(year))); },
      async getSheet(dep, year, month) {
        return chk(await sb.from("okr_sheets").select("*").eq("department_id", dep).eq("year", Number(year)).eq("month", Number(month)).maybeSingle());
      },
      // Khoá lạc quan: chỉ ghi khi phiếu trên máy chủ chưa bị ai đổi kể từ lúc mình mở (so updated_at).
      // updated_at do máy chủ tự đặt (trigger), không phụ thuộc giờ trên điện thoại.
      async saveSheet(user, sheet, opts = {}) {
        const row = { department_id: sheet.department_id, year: sheet.year, month: sheet.month, objectives: sheet.objectives, bgd: sheet.bgd || {}, attachments: sheet.attachments || [], comment: sheet.comment || "", status: sheet.status, score: sheetScore(sheet.objectives), score_bgd: bgdScore(sheet), updated_by: user.id };
        if (sheet.id) {
          let q = sb.from("okr_sheets").update(row).eq("id", sheet.id);
          if (!opts.force) q = q.eq("updated_at", sheet.updated_at);
          const data = chk(await q.select());
          if (data && data.length) return data[0];
          const cur = await this.getSheet(sheet.department_id, sheet.year, sheet.month);
          if (cur && cur.updated_at !== sheet.updated_at && !opts.force) throw conflictError(cur);
          throw new Error("Không lưu được (phiếu đã nộp hoặc bạn không có quyền).");
        }
        const { data, error } = await sb.from("okr_sheets").insert(row).select().maybeSingle();
        if (error) {
          if (error.code === "23505") throw conflictError(await this.getSheet(sheet.department_id, sheet.year, sheet.month));
          throw new Error(error.message);
        }
        if (!data) throw new Error("Không lưu được (bạn không có quyền với bộ phận này).");
        return data;
      },
      async deleteSheet(user, dep, year, month) {
        chk(await sb.from("okr_sheets").delete().eq("department_id", dep).eq("year", Number(year)).eq("month", Number(month)));
      },
      // ---- file đính kèm (Supabase Storage, bucket riêng tư) ----
      async uploadAttachment(user, sheet, file, krId) {
        assertCanAttach(user, sheet, file);
        const meta = attachMeta(user, sheet, file, krId);
        const { error } = await sb.storage.from(ATT.BUCKET).upload(meta.path, file, { contentType: meta.type, upsert: false, cacheControl: "3600" });
        if (error) {
          const m = String(error.message || "");
          if (/bucket not found/i.test(m)) throw new Error(`Chưa có kho file "${ATT.BUCKET}". Chạy lại supabase/schema.sql trong SQL Editor.`);
          if (/row-level security|unauthorized|403/i.test(m)) throw new Error("Máy chủ từ chối: bạn không có quyền đính kèm vào phiếu này (hoặc phiếu đã nộp).");
          if (/size|too large|413/i.test(m)) throw new Error(`"${file.name}": vượt quá dung lượng cho phép.`);
          throw new Error(`Không tải lên được "${file.name}": ${m}`);
        }
        return meta;
      },
      async attachmentUrl(meta, opts = {}) {
        const { data, error } = await sb.storage.from(ATT.BUCKET).createSignedUrl(meta.path, 3600, opts.download ? { download: meta.name } : undefined);
        if (error) throw new Error(`Không mở được "${meta.name}": ${error.message}`);
        return data.signedUrl;
      },
      async deleteAttachmentFiles(metas) {
        const paths = (metas || []).map(m => m.path).filter(Boolean);
        if (!paths.length) return;
        const { error } = await sb.storage.from(ATT.BUCKET).remove(paths);
        if (error) console.warn("Không xoá được file đính kèm:", error.message);
      },
      async users() { return chk(await sb.from("profiles").select("*").order("email")); },
      async saveUser(actor, u) {
        if (!u.id) throw new Error("Tạo tài khoản mới trong Supabase > Authentication > Add user, sau đó gán bộ phận tại đây.");
        chk(await sb.from("profiles").update({ full_name: u.full_name, role: u.role, department_id: u.department_id || null, employee_code: u.employee_code || null, title: u.title || null, hr_level: u.hr_level || null, staff_group: u.staff_group || null, join_date: u.join_date || null }).eq("id", u.id));
      },
      async deleteUser() { throw new Error("Xoá tài khoản trong Supabase > Authentication > Users."); },
      async changePassword(user, oldPw, newPw) {
        const { error: e1 } = await sb.auth.signInWithPassword({ email: user.email, password: oldPw });
        if (e1) throw new Error("Mật khẩu hiện tại không đúng.");
        const { error } = await sb.auth.updateUser({ password: newPw });
        if (error) throw new Error(error.message);
      }
    };
  }

  const useSupabase = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
  window.OKR = {
    api: useSupabase ? makeSupabaseBackend() : DemoBackend,
    perm,
    calc: { krAchievement, objectiveScore, sheetScore, bgdScore, bgdGetter, validateSheet, rating, period },
    files: { check: checkFile, isImage, ext: extOf, accept: fileAccept, maxMb: ATT.MAX_MB, maxPerSheet: ATT.MAX_PER_SHEET },
    uid
  };
})();
