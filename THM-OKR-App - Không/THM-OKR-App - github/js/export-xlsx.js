// ============================================================
//  XUẤT EXCEL theo đúng bố cục biểu mẫu OKR
//  - Sheet "Tong hop KQDG Bo phan": bảng tổng hợp toàn đơn vị
//  - Mỗi bộ phận 1 sheet: "BIỂU MẪU GIAO MỤC TIÊU VÀ ĐÁNH GIÁ HIỆU QUẢ CÔNG VIỆC (OKR)"
//  Công thức Excel giữ nguyên như biểu mẫu (tự tính lại khi sửa số).
// ============================================================
(function (root) {
  function factory(ExcelJS, OKR, CFG) {
    const calc = OKR.calc;
    const X = CFG.EXCEL || {};
    const FONT = "Cambria";
    const NAVY = "FF002060", LIGHT = "FFF2F2F2", GREY = "FFD9D9D9", WHITE = "FFFFFFFF";
    const thin = { style: "thin", color: { argb: "FF000000" } };
    const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
    const mm = (m) => String(m).padStart(2, "0");
    const CAP = CFG.MAX_ACHIEVEMENT || 1.5;

    function st(cell, o = {}) {
      cell.font = { name: FONT, size: o.size || 12, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color || "FF000000" } };
      cell.alignment = { horizontal: o.h, vertical: o.v || "middle", wrapText: !!o.wrap };
      if (o.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
      if (o.border) cell.border = BORDER;
      if (o.nf) cell.numFmt = o.nf;
      return cell;
    }
    const header = (cell, size) => st(cell, { size, bold: true, color: WHITE, fill: NAVY, h: "center", wrap: true, border: true });
    function boxRange(ws, r1, c1, r2, c2, o) {
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) st(ws.getCell(r, c), o);
    }
    // Ước lượng chiều cao dòng cho ô xuống dòng
    function fitHeight(ws, r, cols, size = 12, min = 31.5) {
      let lines = 1;
      cols.forEach(c => {
        const v = ws.getCell(r, c).value; if (v == null || typeof v === "object") return;
        const w = (ws.getColumn(c).width || 10) * (12 / size) * 1.05;
        const n = String(v).split("\n").reduce((s, part) => s + Math.max(1, Math.ceil(part.length / w)), 0);
        lines = Math.max(lines, n);
      });
      ws.getRow(r).height = Math.max(min, lines * size * 1.35 + 6);
    }
    const fx = (formula, result) => ({ formula, result: result == null ? "" : result });
    const num = (v) => v === "" || v == null || isNaN(Number(v)) ? null : Number(v);
    const safeSheetName = (s, used) => {
      let n = String(s).replace(/[\\/?*\[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
      let k = n, i = 2; while (used.has(k)) { k = n.slice(0, 28) + " " + i++; } used.add(k); return k;
    };
    const lead = (users) => users.find(u => u.role === "admin") || {};
    const headOf = (users, dep) => users.find(u => u.role === "head" && u.department_id === dep) || {};

    // ---------------- Sheet OKR 1 bộ phận ----------------
    function addDepartmentSheet(wb, name, sheet, dep, head, boss) {
      const ws = wb.addWorksheet(name, {
        views: [{ showGridLines: false, zoomScale: 70 }],
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } }
      });
      const W = { A: 2, B: 2, C: 2, D: 8, E: 24, F: 48, G: 34, H: 10, I: 15, J: 20, K: 14, L: 14, M: 11, N: 11, O: 12, P: 12, Q: 15, R: 15, S: 30 };
      Object.entries(W).forEach(([c, w]) => ws.getColumn(c).width = w);

      // Tiêu đề & kỳ
      ws.mergeCells("D1:S1");
      st(ws.getCell("D1"), { bold: true, h: "center" }).value = "BIỂU MẪU GIAO MỤC TIÊU VÀ ĐÁNH GIÁ HIỆU QUẢ CÔNG VIỆC CỦA BỘ PHẬN (OKR)";
      ws.getRow(1).height = 28.9;
      st(ws.getCell("I2"), { bold: true, h: "right" }).value = "Kỳ đánh giá: ";
      st(ws.getCell("J2"), { bold: true, h: "center", fill: LIGHT }).value = "Tháng " + mm(sheet.month);
      st(ws.getCell("L2"), { bold: true, h: "left", fill: LIGHT }).value = "Năm " + sheet.year;
      ws.getCell("J2").dataValidation = { type: "list", allowBlank: true, formulae: ['"Tháng 01,Tháng 02,Tháng 03,Tháng 04,Tháng 05,Tháng 06,Tháng 07,Tháng 08,Tháng 09,Tháng 10,Tháng 11,Tháng 12"'] };

      // A. Thông tin
      st(ws.getCell("D5"), { bold: true, h: "center" }).value = "A.";
      st(ws.getCell("E5"), { bold: true }).value = "THÔNG TIN ĐỐI TƯỢNG ĐÁNH GIÁ";
      ws.mergeCells("E6:H6"); header(ws.getCell("E6")).value = "THÔNG TIN CỦA CÁN BỘ NHÂN VIÊN (TRƯỞNG BỘ PHẬN)";
      ws.mergeCells("J6:S6"); header(ws.getCell("J6")).value = "THÔNG TIN CỦA QUẢN LÝ TRỰC TIẾP (BAN GIÁM ĐỐC)";
      ws.getRow(6).height = 22;
      const L = (a, t, right) => st(ws.getCell(a), { bold: true, h: right ? "right" : undefined }).value = t;
      const V = (a, t) => st(ws.getCell(a), { fill: LIGHT }).value = t || "";
      const rowsInfo = [
        ["Mã nhân viên:", head.employee_code, boss.employee_code],
        ["Họ và tên:", (head.full_name || "").toUpperCase(), (boss.full_name || "").toUpperCase()],
        ["Chức danh:", head.title || ("Trưởng bộ phận " + dep.name), boss.title || "Ban Giám đốc"],
        null,
        ["Đơn vị:", X.DON_VI || CFG.COMPANY, X.DON_VI || CFG.COMPANY],
        ["Phòng/Bộ phận:", dep.name, "Ban Giám đốc"],
        ["Mã bộ phận:", dep.id, "BGĐ"]
      ];
      rowsInfo.forEach((r, i) => {
        const row = 7 + i;
        if (!r) {
          L("E10", "Cấp bậc nhân sự:"); V("F10", head.hr_level); L("G10", "Nhóm CBNV:", true); V("H10", head.staff_group);
          L("J10", "Cấp bậc nhân sự:"); V("K10", boss.hr_level); L("O10", "Nhóm CBNV:", true); V("Q10", boss.staff_group);
          return;
        }
        L("E" + row, r[0]); V("F" + row, r[1]); L("J" + row, r[0]); V("K" + row, r[2]);
      });

      // B. Bảng OKR
      st(ws.getCell("D15"), { bold: true, h: "center" }).value = "B.";
      st(ws.getCell("E15"), { bold: true }).value = "THÔNG TIN ĐÁNH GIÁ MỨC ĐỘ HOÀN THÀNH CÔNG VIỆC";
      ws.getRow(16).height = 5;
      const H2 = { D: "STT", E: "Mục tiêu", F: "Nội dung OKR", G: "Phương pháp đo lường", H: "Đơn vị tính", I: "Chiều hướng (Thuận/ Nghịch)", J: "Tỷ trọng (%)", K: "Ngày bắt đầu", L: "Ngày kết thúc", M: "Chỉ tiêu năm", N: "Chỉ tiêu tháng", S: "Ghi chú" };
      Object.entries(H2).forEach(([c, t]) => { ws.mergeCells(`${c}17:${c}18`); header(ws.getCell(c + "17")).value = t; header(ws.getCell(c + "18")); });
      ws.mergeCells("O17:P17"); header(ws.getCell("O17")).value = "KẾT QUẢ THỰC HIỆN"; header(ws.getCell("P17"));
      ws.mergeCells("Q17:R17"); header(ws.getCell("Q17")).value = "MỨC ĐỘ HOÀN THÀNH SO VỚI KẾ HOẠCH"; header(ws.getCell("R17"));
      header(ws.getCell("O18")).value = "CBNV đánh giá"; header(ws.getCell("P18")).value = "QLTT đánh giá";
      header(ws.getCell("Q18")).value = "CBNV đánh giá"; header(ws.getCell("R18")).value = "QLTT đánh giá";
      ws.getRow(17).height = 28.9; ws.getRow(18).height = 48;
      for (let c = 4; c <= 19; c++) {
        const col = ws.getColumn(c).letter;
        const cell = st(ws.getCell(col + "19"), { italic: true, h: "center", wrap: true, border: true, fill: GREY });
        if ("FGHIJKLMNOP".includes(col)) cell.value = "[Điền tay]";
        if (col === "Q" || col === "R") cell.value = "[Công thức tự động]";
      }
      ws.getRow(19).height = 26.65;

      const per = calc.period(sheet.year, sheet.month);
      const gB = calc.bgdGetter(sheet);
      let r = 20; const objRows = []; const dirCells = [];
      sheet.objectives.forEach((o, oi) => {
        const or = r; objRows.push(or);
        const first = or + 1, last = or + Math.max(o.krs.length, 1);
        boxRange(ws, or, 4, or, 19, { border: true, fill: LIGHT, bold: true });
        st(ws.getCell(or, 4), { bold: true, h: "center", border: true, fill: LIGHT }).value = oi + 1;
        ws.getCell(or, 5).value = "Mục tiêu " + (oi + 1);
        st(ws.getCell(or, 6), { bold: true, wrap: true, border: true, fill: LIGHT }).value = o.title || "";
        st(ws.getCell(or, 10), { bold: true, h: "center", border: true, fill: LIGHT, nf: "0%" }).value = (Number(o.weight) || 0) / 100;
        const os = calc.objectiveScore(o), osb = calc.objectiveScore(o, gB);
        st(ws.getCell(or, 17), { bold: true, h: "center", border: true, fill: GREY, nf: "0.0%" }).value = fx(`IFERROR(AVERAGE(Q${first}:Q${last}),"")`, os);
        st(ws.getCell(or, 18), { bold: true, h: "center", border: true, fill: GREY, nf: "0.0%" }).value = fx(`IFERROR(AVERAGE(R${first}:R${last}),"")`, osb);
        fitHeight(ws, or, [6], 12, 41.65);
        r++;
        o.krs.forEach((k, ki) => {
          boxRange(ws, r, 4, r, 19, { border: true });
          const c = (col, v, o2 = {}) => { st(ws.getCell(col + r), { border: true, ...o2 }).value = v; };
          c("D", `${oi + 1}.${ki + 1}`, { h: "center" });
          c("E", "Kết quả then chốt " + (ki + 1));
          c("F", k.title || "", { wrap: true });
          c("G", k.method || "", { wrap: true });
          c("H", k.unit || "", { h: "center" });
          c("I", k.direction === "down" ? "Nghịch" : "Thuận", { h: "center" });
          c("J", null, { h: "center", nf: "0%" });
          c("K", per.start, { h: "center", nf: "dd/mm/yyyy" });
          c("L", per.end, { h: "center", nf: "dd/mm/yyyy" });
          c("M", num(k.target_year), { h: "center" });
          c("N", num(k.target), { h: "center" });
          c("O", num(k.actual), { h: "center" });
          c("P", num(gB(k)), { h: "center" });
          const f = (col) => `IFERROR(MAX(IF(${col}${r}="","",IF($N${r}=0,IF(${col}${r}=0,1,IF($I${r}="Thuận",IF(${col}${r}>0,${CAP},0),IF(${col}${r}<0,${CAP},0))),IF($I${r}="Thuận",MIN(1+(${col}${r}-$N${r})/ABS($N${r}),${CAP}),MIN(1-(${col}${r}-$N${r})/ABS($N${r}),${CAP})))),0),"")`;
          c("Q", fx(f("O"), calc.krAchievement(k)), { h: "center", nf: "0.0%", fill: GREY });
          c("R", fx(f("P"), calc.krAchievement(k, gB(k))), { h: "center", nf: "0.0%", fill: GREY });
          c("S", k.note || "", { wrap: true });
          dirCells.push("I" + r);
          fitHeight(ws, r, [6, 7, 19]);
          r++;
        });
        if (!o.krs.length) { boxRange(ws, r, 4, r, 19, { border: true }); r++; }
      });
      dirCells.forEach(a => ws.getCell(a).dataValidation = { type: "list", allowBlank: true, formulae: ['"Thuận,Nghịch"'] });

      // Dòng tổng
      const tr = r, top = 20, bot = Math.max(20, r - 1);
      boxRange(ws, tr, 4, tr, 19, { bold: true, color: WHITE, fill: NAVY, h: "center", border: true, wrap: true });
      ws.mergeCells(`E${tr}:H${tr}`); ws.getCell(`E${tr}`).value = "KẾT QUẢ CÔNG VIỆC (OKR)";
      ws.getCell(`J${tr}`).value = fx(objRows.length ? `SUM(${objRows.map(x => "J" + x).join(",")})` : "0", sheet.objectives.reduce((s, o) => s + (Number(o.weight) || 0), 0) / 100);
      ws.getCell(`J${tr}`).numFmt = "0%";
      const self = calc.sheetScore(sheet.objectives), bgd = calc.bgdScore(sheet);
      ws.getCell(`Q${tr}`).value = fx(`SUMPRODUCT($J$${top}:$J$${bot},Q${top}:Q${bot})`, self == null ? 0 : self / 100);
      ws.getCell(`R${tr}`).value = fx(`SUMPRODUCT($J$${top}:$J$${bot},R${top}:R${bot})`, bgd == null ? 0 : bgd / 100);
      ws.getCell(`Q${tr}`).numFmt = "0.0%"; ws.getCell(`R${tr}`).numFmt = "0.0%";
      ws.getRow(tr).height = 30;

      let nr = tr + 2;
      if (sheet.comment) {
        st(ws.getCell("E" + nr), { bold: true, v: "top" }).value = "Nhận xét chung:";
        ws.mergeCells(`F${nr}:S${nr}`);
        st(ws.getCell("F" + nr), { wrap: true, v: "top" }).value = sheet.comment;
        ws.getRow(nr).height = Math.max(31.5, Math.ceil(sheet.comment.length / 200 + sheet.comment.split("\n").length) * 16 + 6);
        nr += 2;
      }
      // Ký tên
      const sg = nr + 1;
      st(ws.getCell("F" + sg), { size: 16, bold: true, h: "center" }).value = "TRƯỞNG BỘ PHẬN";
      ws.mergeCells(`O${sg}:R${sg}`); st(ws.getCell("O" + sg), { size: 16, bold: true, h: "center" }).value = "QUẢN LÝ TRỰC TIẾP (BAN GIÁM ĐỐC)";
      st(ws.getCell("F" + (sg + 2)), { size: 16, bold: true, h: "center" }).value = "Chữ ký";
      ws.mergeCells(`O${sg + 2}:R${sg + 2}`); st(ws.getCell("O" + (sg + 2)), { size: 16, bold: true, h: "center" }).value = "Chữ ký";
      ws.getRow(sg + 3).height = 90;
      st(ws.getCell("F" + (sg + 4)), { size: 14, bold: true, h: "center" }).value = head.full_name || "";
      ws.mergeCells(`O${sg + 4}:R${sg + 4}`); st(ws.getCell("O" + (sg + 4)), { size: 14, bold: true, h: "center" }).value = boss.full_name || "";
      st(ws.getCell("F" + (sg + 5)), { size: 16, italic: true, h: "center" }).value = "Ngày          /           /";
      ws.mergeCells(`O${sg + 5}:R${sg + 5}`); st(ws.getCell("O" + (sg + 5)), { size: 16, italic: true, h: "center" }).value = "Ngày          /           /";
      ws.pageSetup.printArea = `D1:S${sg + 5}`;
      return { ws, totalRow: tr };
    }

    // ---------------- Sheet tổng hợp tháng ----------------
    function addSummarySheet(ws, year, month, deps, users, links) {
      const W = { A: 2.6, B: 7, C: 15.6, D: 33.3, E: 36.1, F: 16.7, G: 19.3, H: 23, I: 30, J: 25.7, K: 14.7, L: 18, M: 18, N: 30 };
      Object.entries(W).forEach(([c, w]) => ws.getColumn(c).width = w);
      const F = 16;
      ws.getRow(1).height = 20.25;
      ws.mergeCells("B2:N2");
      st(ws.getCell("B2"), { size: F, bold: true, h: "center" }).value = "BẢNG TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ OKR CÁC BỘ PHẬN TOÀN ĐƠN VỊ";
      ws.getRow(2).height = 36.6;
      st(ws.getCell("G3"), { size: F, bold: true, h: "right" }).value = "Kỳ đánh giá: ";
      st(ws.getCell("H3"), { size: F, bold: true, h: "center", fill: LIGHT }).value = "Tháng " + mm(month);
      st(ws.getCell("I3"), { size: F, bold: true, h: "left", fill: LIGHT }).value = "Năm " + year;
      ws.getRow(3).height = 31.9; ws.getRow(4).height = 4.5;
      st(ws.getCell("B5"), { size: F, bold: true }).value = "A. ";
      st(ws.getCell("C5"), { size: F, bold: true }).value = "THÔNG TIN ĐƠN VỊ";
      const submitted = links.filter(l => l.sheet && l.sheet.status === "submitted").length;
      [["Đơn vị:", X.DON_VI || CFG.COMPANY], ["Phạm vi đánh giá:", X.PHAM_VI || "Toàn công ty"], ["Số bộ phận thuộc diện đánh giá:", deps.length], ["Số bộ phận đã nộp đánh giá:", submitted]]
        .forEach(([l, v], i) => {
          st(ws.getCell("C" + (6 + i)), { size: F, bold: true, h: "left" }).value = l;
          ws.mergeCells(`E${6 + i}:H${6 + i}`);
          st(ws.getCell("E" + (6 + i)), { size: F, h: "left", fill: LIGHT }).value = v;
          ws.getRow(6 + i).height = 24;
        });
      st(ws.getCell("B11"), { size: F, bold: true }).value = "B. ";
      st(ws.getCell("C11"), { size: F, bold: true }).value = "TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ OKR CÁC BỘ PHẬN";
      ws.mergeCells("B12:H12"); header(ws.getCell("B12"), F).value = "THÔNG TIN TRƯỞNG BỘ PHẬN";
      ws.mergeCells("I12:K12"); header(ws.getCell("I12"), F).value = "THÔNG TIN BỘ PHẬN";
      ws.mergeCells("L12:M12"); header(ws.getCell("L12"), F).value = "KẾT QUẢ OKR BỘ PHẬN";
      header(ws.getCell("N12"), F);
      ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"].forEach(c => header(ws.getCell(c + "12"), F));
      const H13 = ["TT", "MÃ NV", "HỌ TÊN", "CHỨC DANH", "CẤP NS", "NHÓM CBNV", "NGÀY VÀO CÔNG TY", "ĐƠN VỊ", "BỘ PHẬN", "MÃ BP", "Bộ phận tự đánh giá", "QLTT (BGĐ) đánh giá", "GHI CHÚ"];
      H13.forEach((t, i) => header(ws.getCell(13, 2 + i), F).value = t);
      ws.getRow(12).height = 54.75; ws.getRow(13).height = 81;
      for (let c = 2; c <= 14; c++) {
        const col = ws.getColumn(c).letter;
        const cell = st(ws.getCell(col + "14"), { size: F, italic: true, h: "center", wrap: true, border: true, fill: GREY });
        if ("CDEFHIJK".includes(col)) cell.value = "[Dữ liệu từ app]";
        if (col === "L" || col === "M") cell.value = "[Công thức tự động]";
      }
      ws.getRow(14).height = 40.5;
      let r = 15;
      links.forEach((l, i) => {
        const h = l.head;
        boxRange(ws, r, 2, r, 14, { size: F, border: true, h: "center", wrap: true });
        ws.getCell("B" + r).value = i + 1;
        ws.getCell("C" + r).value = h.employee_code || "";
        st(ws.getCell("D" + r), { size: F, border: true, h: "left", wrap: true }).value = h.full_name || "";
        st(ws.getCell("E" + r), { size: F, border: true, h: "left", wrap: true }).value = h.title || ("Trưởng bộ phận " + l.dep.name);
        ws.getCell("F" + r).value = h.hr_level || "";
        ws.getCell("G" + r).value = h.staff_group || "";
        if (h.join_date) { ws.getCell("H" + r).value = new Date(h.join_date); ws.getCell("H" + r).numFmt = "dd/mm/yyyy"; }
        ws.getCell("I" + r).value = X.DON_VI || CFG.COMPANY;
        ws.getCell("J" + r).value = l.dep.name;
        ws.getCell("K" + r).value = l.dep.id;
        if (l.sheetName) {
          const q = `'${l.sheetName.replace(/'/g, "''")}'`;
          const s = calc.sheetScore(l.sheet.objectives), b = calc.bgdScore(l.sheet);
          ws.getCell("L" + r).value = fx(`${q}!Q${l.totalRow}`, s == null ? 0 : s / 100);
          ws.getCell("M" + r).value = fx(`${q}!R${l.totalRow}`, b == null ? 0 : b / 100);
          ws.getCell("L" + r).numFmt = "0.0%"; ws.getCell("M" + r).numFmt = "0.0%";
          ws.getCell("N" + r).value = l.sheet.status === "submitted" ? (Object.keys(l.sheet.bgd || {}).length ? "Đã nộp · BGĐ đã đánh giá" : "Đã nộp · chờ BGĐ đánh giá") : "Nháp – chưa nộp";
        } else ws.getCell("N" + r).value = "Chưa nhập OKR";
        ws.getRow(r).height = 51;
        r++;
      });
      // Ký duyệt
      const sg = r + 2;
      st(ws.getCell("D" + sg), { size: F, bold: true }).value = X.NGUOI_LAP || "NGƯỜI LẬP BẢNG";
      st(ws.getCell("M" + sg), { size: F, bold: true }).value = X.PHE_DUYET || "CẤP PHÊ DUYỆT";
      ws.getRow(sg + 1).height = 90;
      st(ws.getCell("D" + (sg + 2)), { size: F, italic: true }).value = "Ngày          /           /";
      st(ws.getCell("M" + (sg + 2)), { size: F, italic: true }).value = "Ngày          /           /";
      ws.pageSetup.printArea = `B2:N${sg + 2}`;
      return ws;
    }

    // ---------------- API ----------------
    function newBook() {
      const wb = new ExcelJS.Workbook();
      wb.creator = CFG.APP_NAME || "OKR"; wb.created = new Date();
      wb.calcProperties = { fullCalcOnLoad: true };
      return wb;
    }
    function buildDepartmentMonth(sheet, users, deps) {
      const wb = newBook();
      const dep = deps.find(d => d.id === sheet.department_id) || { id: sheet.department_id, name: sheet.department_id };
      addDepartmentSheet(wb, safeSheetName(dep.name, new Set()), sheet, dep, headOf(users, dep.id), lead(users));
      return { wb, fileName: `${dep.name}_OKR Kỳ tháng ${mm(sheet.month)}.${sheet.year}.xlsx` };
    }
    function buildMonth(year, month, sheets, users, deps) {
      const wb = newBook();
      const used = new Set(["Tong hop KQDG Bo phan"]);
      const boss = lead(users);
      const links = deps.map(dep => ({ dep, head: headOf(users, dep.id), sheet: sheets.find(s => s.department_id === dep.id && s.month === month && s.year === year) }));
      // sheet tổng hợp đứng đầu => tạo trước, điền sau khi biết dòng tổng của từng sheet
      const sumWs = wb.addWorksheet("Tong hop KQDG Bo phan", {
        views: [{ showGridLines: false, zoomScale: 55 }],
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });
      links.forEach(l => {
        if (!l.sheet) return;
        l.sheetName = safeSheetName(l.dep.name, used);
        l.totalRow = addDepartmentSheet(wb, l.sheetName, l.sheet, l.dep, l.head, boss).totalRow;
      });
      addSummarySheet(sumWs, year, month, deps, users, links);
      return { wb, fileName: `Tổng hợp OKR các bộ phận Kỳ tháng ${mm(month)}.${year}.xlsx` };
    }
    function buildYear(year, sheets, deps, onlySubmitted) {
      const wb = newBook();
      const ws = wb.addWorksheet("Tong hop nam " + year, { views: [{ showGridLines: false, zoomScale: 80 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
      ws.getColumn("A").width = 2.6; ws.getColumn("B").width = 6; ws.getColumn("C").width = 28;
      for (let c = 4; c <= 15; c++) ws.getColumn(c).width = 10;
      ws.getColumn(16).width = 12; ws.getColumn(17).width = 12; ws.getColumn(18).width = 16;
      ws.mergeCells("B2:R2");
      st(ws.getCell("B2"), { size: 14, bold: true, h: "center" }).value = "BẢNG TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ OKR CÁC BỘ PHẬN THEO THÁNG";
      ws.getRow(2).height = 30;
      st(ws.getCell("I3"), { bold: true, h: "right" }).value = "Năm đánh giá: ";
      st(ws.getCell("J3"), { bold: true, h: "center", fill: LIGHT }).value = year;
      st(ws.getCell("B4"), { italic: true }).value = `Đơn vị: ${X.DON_VI || CFG.COMPANY} · Điểm = bộ phận tự đánh giá${onlySubmitted ? " (chỉ tính phiếu đã nộp)" : ""} · Ô trống = chưa có dữ liệu`;
      const hdr = ["TT", "BỘ PHẬN", ...Array.from({ length: 12 }, (_, i) => "Tháng " + mm(i + 1)), "TB NĂM", "TB BGĐ ĐG", "XẾP LOẠI"];
      hdr.forEach((t, i) => header(ws.getCell(6, 2 + i)).value = t);
      ws.getRow(6).height = 36;
      const eff = (s) => !s || (onlySubmitted && s.status !== "submitted") ? null : (s.score ?? calc.sheetScore(s.objectives));
      let r = 7;
      deps.forEach((d, i) => {
        boxRange(ws, r, 2, r, 18, { border: true, h: "center" });
        ws.getCell(r, 2).value = i + 1;
        st(ws.getCell(r, 3), { border: true, bold: true }).value = d.name;
        const vals = [], bvals = [];
        for (let m = 1; m <= 12; m++) {
          const s = sheets.find(x => x.department_id === d.id && x.month === m);
          const v = eff(s); if (v != null) vals.push(v);
          if (s && s.score_bgd != null && (!onlySubmitted || s.status === "submitted")) bvals.push(s.score_bgd);
          const c = ws.getCell(r, 3 + m); c.value = v == null ? null : v / 100; c.numFmt = "0.0%";
        }
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        const c1 = ws.getCell(r, 16); c1.value = fx(`IFERROR(AVERAGE(D${r}:O${r}),"")`, avg == null ? "" : avg / 100); c1.numFmt = "0.0%"; c1.font = { name: FONT, size: 12, bold: true };
        const bavg = bvals.length ? bvals.reduce((a, b) => a + b, 0) / bvals.length / 100 : null;
        const c2 = ws.getCell(r, 17); c2.value = bavg; c2.numFmt = "0.0%";
        ws.getCell(r, 18).value = avg == null ? "" : (calc.rating(avg) || {}).label;
        ws.getRow(r).height = 24;
        r++;
      });
      boxRange(ws, r, 2, r, 18, { border: true, bold: true, h: "center", fill: LIGHT });
      ws.mergeCells(`B${r}:C${r}`); ws.getCell(r, 2).value = "TB TOÀN CÔNG TY";
      for (let c = 4; c <= 17; c++) {
        const col = ws.getColumn(c).letter;
        ws.getCell(r, c).value = { formula: `IFERROR(AVERAGE(${col}7:${col}${r - 1}),"")` }; ws.getCell(r, c).numFmt = "0.0%";
      }
      ws.getRow(r).height = 24;
      const sg = r + 3;
      st(ws.getCell("C" + sg), { bold: true, h: "center" }).value = X.NGUOI_LAP || "NGƯỜI LẬP BẢNG";
      ws.mergeCells(`N${sg}:R${sg}`); st(ws.getCell("N" + sg), { bold: true, h: "center" }).value = X.PHE_DUYET || "CẤP PHÊ DUYỆT";
      ws.getRow(sg + 1).height = 80;
      st(ws.getCell("C" + (sg + 2)), { italic: true, h: "center" }).value = "Ngày          /           /";
      ws.mergeCells(`N${sg + 2}:R${sg + 2}`); st(ws.getCell("N" + (sg + 2)), { italic: true, h: "center" }).value = "Ngày          /           /";
      return { wb, fileName: `Tổng hợp OKR các bộ phận năm ${year}.xlsx` };
    }

    async function download({ wb, fileName }) {
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    return {
      buildDepartmentMonth, buildMonth, buildYear,
      exportDepartmentMonth: (s, users, deps) => download(buildDepartmentMonth(s, users, deps)),
      exportMonth: (y, m, sheets, users, deps) => download(buildMonth(y, m, sheets, users, deps)),
      exportYear: (y, sheets, deps, only) => download(buildYear(y, sheets, deps, only))
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = factory;
  else root.OKRExport = factory(root.ExcelJS, root.OKR, root.OKR_CONFIG);
})(typeof window !== "undefined" ? window : globalThis);
