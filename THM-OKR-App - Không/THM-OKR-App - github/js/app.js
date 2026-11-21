// ============================================================
//  APP OKR – giao diện & điều hướng
// ============================================================
(function () {
  const CFG = window.OKR_CONFIG;
  const api = window.OKR.api;
  const calc = window.OKR.calc;
  const C = window.OKRCharts;
  const $app = document.getElementById("app");

  const MONTHS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
  const now = new Date();
  const state = {
    user: null, deps: [], route: "dashboard",
    year: now.getFullYear(), month: now.getMonth() + 1,
    dashMonth: null, onlySubmitted: false,
    reportDep: null, reportMonth: null,
    editDep: null, editYear: now.getFullYear(), editMonth: now.getDate() <= 10 ? (now.getMonth() || 12) : now.getMonth() + 1,
    sheet: null, dirty: false,
    pendingUp: [], pendingDel: [], filePicking: false,   // file đính kèm: vừa tải lên / chờ xoá (chưa lưu phiếu)
    compareSel: [], views: {}
  };
  if (now.getDate() <= 10 && now.getMonth() === 0) state.editYear = now.getFullYear() - 1;

  // ---------------- tiện ích ----------------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (v, d = 1) => v == null || isNaN(v) ? "—" : Number(v).toFixed(d);
  const fmtPct = (v) => v == null ? "—" : fmt(v) + "%";
  const depName = (id) => (state.deps.find(d => d.id === id) || {}).name || id || "—";
  const avg = (arr) => { const a = arr.filter(v => v != null); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
  const yearsList = () => { const y = now.getFullYear(); return [y - 2, y - 1, y, y + 1]; };
  const P = window.OKR.perm;
  const canEdit = (dep) => P.canEdit(state.user, dep);
  let usersCache = [];
  const userName = (id) => (usersCache.find(u => u.id === id) || {}).full_name || "—";
  const visibleDeps = () => state.deps.filter(d => P.canView(state.user, d.id));

  function ratingBadge(score) {
    const r = calc.rating(score);
    if (!r) return `<span class="badge none"><i></i>Chưa có</span>`;
    return `<span class="badge ${r.key}"><i></i>${r.label}</span>`;
  }
  function statusBadge(sheet) {
    if (!sheet) return `<span class="badge none"><i></i>Chưa nhập</span>`;
    return sheet.status === "submitted" ? `<span class="badge submitted"><i></i>Đã nộp</span>` : `<span class="badge draft"><i></i>Nháp</span>`;
  }
  function toast(msg, err) {
    document.querySelectorAll(".toast").forEach(x => x.remove());
    const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), err ? 5000 : 2600);
  }
  function modal(html, onMount, variant) {
    const bg = document.createElement("div"); bg.className = "modal-bg" + (variant ? " " + variant : "");
    bg.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.addEventListener("mousedown", e => { if (e.target === bg) close(); });
    onMount && onMount(bg.querySelector(".modal"), close);
    return close;
  }
  function confirmBox(msg, okText = "Đồng ý", danger) {
    return new Promise(res => {
      modal(`<h2>Xác nhận</h2><div class="sec">${msg}</div><div class="actions"><button class="btn" data-x>Huỷ</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${okText}</button></div>`,
        (m, close) => {
          m.querySelector("[data-x]").onclick = () => { close(); res(false); };
          m.querySelector("[data-ok]").onclick = () => { close(); res(true); };
        });
    });
  }
  const sel = (opts, val, attrs = "") => `<select ${attrs}>${opts.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(val) ? "selected" : ""}>${esc(o.t)}</option>`).join("")}</select>`;
  const yearSel = (val, attrs) => sel(yearsList().map(y => ({ v: y, t: "Năm " + y })), val, attrs);
  const monthSel = (val, attrs) => sel(MONTHS.map((m, i) => ({ v: i + 1, t: "Tháng " + (i + 1) })), val, attrs);
  const depSel = (val, attrs) => sel(state.deps.map(d => ({ v: d.id, t: d.name })), val, attrs);

  // Dựng bảng tra: dep -> month -> sheet
  function indexSheets(sheets) {
    const idx = {};
    state.deps.forEach(d => idx[d.id] = {});
    sheets.forEach(s => { (idx[s.department_id] = idx[s.department_id] || {})[s.month] = s; });
    return idx;
  }
  const effScore = (s) => !s ? null : (state.onlySubmitted && s.status !== "submitted") ? null : (s.score ?? calc.sheetScore(s.objectives));

  // ---------------- icons ----------------
  const I = {
    dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    okr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
    rep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    cmp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
    usr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/></svg>'
  };

  // ============================================================
  //  ĐĂNG NHẬP
  // ============================================================
  async function renderLogin() {
    C.destroyAll();
    let demoHtml = "";
    if (api.mode === "demo") {
      const users = await api.users();
      demoHtml = `<div class="demo-box"><b>Chế độ DEMO</b> – dữ liệu lưu trên trình duyệt này.<br>
        Ban giám đốc: <code>admin@sonthehemoi.vn</code> / <code>admin123</code><br>
        Trưởng bộ phận: mật khẩu <code>123456</code>
        ${sel([{ v: "", t: "— Chọn nhanh tài khoản demo —" }, ...users.map(u => ({ v: u.email, t: u.full_name + " · " + u.email }))], "", 'id="demoPick"')}</div>`;
    }
    $app.innerHTML = `<div class="login-wrap"><div class="login-card">
      <div class="logo">THM</div>
      <h1>Đánh giá OKR bộ phận</h1>
      <div class="muted">${esc(CFG.COMPANY)}</div>
      <form id="loginForm">
        <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="username" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
        <label class="field"><span>Mật khẩu</span><input type="password" name="password" required autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
        <button class="btn primary" type="submit" style="justify-content:center;padding:10px">Đăng nhập</button>
      </form>${demoHtml}</div></div>`;
    const f = document.getElementById("loginForm");
    const pick = document.getElementById("demoPick");
    if (pick) pick.onchange = () => {
      f.email.value = pick.value;
      f.password.value = pick.value.startsWith("admin@") ? "admin123" : (pick.value ? "123456" : "");
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button"); btn.disabled = true;
      const email = f.email.value.trim().toLowerCase();   // bàn phím điện thoại hay tự viết hoa chữ đầu / thêm dấu cách
      try {
        state.user = await api.login(email, f.password.value);
      } catch (err) {
        btn.disabled = false;
        let msg = err.message;
        if (api.mode === "demo" && /sai email/i.test(msg)) msg += " (Chế độ DEMO: tài khoản tạo hoặc mật khẩu đổi trên máy khác không có trên máy này.)";
        return showLoginError(msg);
      }
      try { await afterLogin(); }
      catch (err) { btn.disabled = false; state.user = null; showLoginError("Đăng nhập được nhưng không tải được dữ liệu: " + err.message); }
    };
    function showLoginError(msg) {
      let el = document.getElementById("loginErr");
      if (!el) { el = document.createElement("div"); el.id = "loginErr"; el.className = "login-err"; f.after(el); }
      el.textContent = msg; toast(msg, true);
    }
  }

  async function afterLogin() {
    state.deps = await api.departments();
    try { usersCache = await api.users(); } catch (e) { usersCache = []; }
    state.reportDep = state.user.department_id || state.deps[0].id;
    state.editDep = state.user.department_id || state.deps[0].id;
    if (!location.hash || location.hash === "#/") location.hash = state.user.role === "head" && !P.isFull(state.user) ? "#/okr" : "#/dashboard";
    else route();
  }

  // ============================================================
  //  KHUNG
  // ============================================================
  // ---------------- Cài app (PWA) ----------------
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; document.querySelectorAll("[data-install]").forEach(b => b.classList.remove("hidden")); });
  window.addEventListener("appinstalled", () => { installEvt = null; toast("Đã cài app THM OKR lên máy."); });
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const inZalo = () => /zalo|FBAN|FBAV|Instagram/i.test(navigator.userAgent);
  async function installApp() {
    if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; return; }
    const ios = isIOS();
    modal(`<h2>Cài app lên điện thoại</h2>
      ${inZalo() ? `<div class="warn-list" style="padding-left:14px;margin:0">Bạn đang mở trong Zalo/Facebook – trình duyệt này không cài được app. Bấm <b>⋯</b> › <b>Mở bằng trình duyệt</b> (${ios ? "Safari" : "Chrome"}) rồi làm theo hướng dẫn dưới.</div>` : ""}
      ${location.protocol !== "https:" && location.hostname !== "localhost" ? `<div class="warn-list" style="padding-left:14px;margin:0">App cần được mở từ địa chỉ web <b>https://</b> (sau khi đưa lên Vercel) mới cài được. Mở file trực tiếp trên máy tính thì không cài được.</div>` : ""}
      ${ios ? `<ol class="steps"><li>Mở trang này bằng <b>Safari</b>.</li><li>Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên ↑) ở thanh dưới.</li><li>Chọn <b>Thêm vào MH chính</b> (Add to Home Screen) › <b>Thêm</b>.</li><li>Mở app <b>THM OKR</b> từ màn hình chính.</li></ol>`
            : `<ol class="steps"><li>Mở trang này bằng <b>Chrome</b>.</li><li>Bấm <b>⋮</b> (góc trên bên phải).</li><li>Chọn <b>Cài đặt ứng dụng</b> hoặc <b>Thêm vào màn hình chính</b>.</li><li>Mở app <b>THM OKR</b> từ màn hình chính.</li></ol>`}
      <div class="actions"><button class="btn primary" data-x>Đã hiểu</button></div>`, (m, close) => { m.querySelector("[data-x]").onclick = close; });
  }

  const NAV_SHORT = { dashboard: "Tổng quan", okr: "Nhập OKR", report: "Báo cáo", compare: "So sánh", users: "Tài khoản" };
  function shell(inner) {
    const u = state.user;
    const roleTxt = u.role === "admin" ? "Ban giám đốc" : u.role === "head" ? "Trưởng bộ phận · " + depName(u.department_id) + (P.isFull(u) ? " · quản lý OKR toàn công ty" : "") : "Chỉ xem";
    const all = P.seesAll(u);
    const nav = [
      ...(all ? [["dashboard", "Tổng quan", I.dash]] : []),
      ["okr", "Nhập OKR", I.okr],
      ["report", "Báo cáo bộ phận", I.rep],
      ...(all ? [["compare", "So sánh cả năm", I.cmp]] : []),
      ...(u.role === "admin" ? [["users", "Tài khoản", I.usr]] : [])
    ];
    const showInstall = !isStandalone();
    const initials = (u.full_name || "?").split(" ").filter(Boolean).slice(-2).map(w => w[0]).join("").toUpperCase();
    return `<div class="shell">
      <aside class="side">
        <div class="brand"><div class="logo">THM</div><div><b>OKR Bộ phận</b><span>${esc(CFG.COMPANY)}</span></div></div>
        <nav class="nav">${nav.map(([r, t, ic]) => `<a href="#/${r}" class="${state.route === r ? "active" : ""}">${ic}<span>${t}</span></a>`).join("")}</nav>
        <div class="foot">
          <div class="who">${esc(u.full_name)}</div>
          <div class="muted">${esc(roleTxt)}</div>
          ${api.mode === "demo" ? '<div style="margin-top:6px"><span class="mode-pill" title="Dữ liệu chỉ lưu trên máy này">DEMO · chỉ lưu trên máy này</span></div>' : ""}
          <div class="row"><button class="btn sm" data-act="pw">Đổi mật khẩu</button><button class="btn sm" data-act="theme" title="Đổi giao diện sáng/tối">Sáng/Tối</button><button class="btn sm" data-act="out">Đăng xuất</button></div>
          ${showInstall ? `<div class="row"><button class="btn sm" data-act="install">📱 Cài app lên điện thoại</button></div>` : ""}
        </div>
      </aside>
      <header class="mtop">
        <div class="logo">THM</div>
        <div class="mt-title"><b>${esc((nav.find(n => n[0] === state.route) || nav[0])[1])}</b><span>${esc(u.role === "head" ? depName(u.department_id) : roleTxt)}</span></div>
        ${api.mode === "demo" ? '<span class="mode-pill">DEMO</span>' : ""}
        <button class="avatar" data-act="menu" aria-label="Tài khoản">${esc(initials)}</button>
      </header>
      <main class="main" id="main">${inner}</main>
      <nav class="mbar" style="--n:${nav.length}">${nav.map(([r, t, ic]) => `<a href="#/${r}" class="${state.route === r ? "active" : ""}">${ic}<span>${NAV_SHORT[r]}</span></a>`).join("")}</nav>
    </div>`;
  }
  async function doLogout() {
    if (state.dirty && !(await confirmBox("Có thay đổi chưa lưu. Vẫn đăng xuất?"))) return;
    state.dirty = false; state.sheet = null; await api.logout(); state.user = null; location.hash = ""; renderLogin();
  }
  function toggleTheme() {
    const r = document.documentElement;
    const cur = r.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    r.setAttribute("data-theme", next);
    try { localStorage.setItem("thm_okr_theme", next); } catch (e) {}
    route();
  }
  function changePw() {
    modal(`<h2>Đổi mật khẩu</h2>
      <label class="field"><span>Mật khẩu hiện tại</span><input type="password" id="pw0"></label>
      <label class="field"><span>Mật khẩu mới (≥ 6 ký tự)</span><input type="password" id="pw1"></label>
      <div class="actions"><button class="btn" data-x>Huỷ</button><button class="btn primary" data-ok>Lưu</button></div>`, (m, close) => {
      m.querySelector("[data-x]").onclick = close;
      m.querySelector("[data-ok]").onclick = async () => {
        const a = m.querySelector("#pw0").value, b = m.querySelector("#pw1").value;
        if (b.length < 6) return toast("Mật khẩu mới phải từ 6 ký tự.", true);
        try { await api.changePassword(state.user, a, b); close(); toast("Đã đổi mật khẩu."); } catch (e) { toast(e.message, true); }
      };
    });
  }
  function accountMenu() {
    const u = state.user;
    modal(`<div class="acct"><div class="avatar big">${esc((u.full_name || "?").split(" ").filter(Boolean).slice(-2).map(w => w[0]).join("").toUpperCase())}</div>
        <div><b>${esc(u.full_name)}</b><div class="muted">${esc(u.email)}</div></div></div>
      <div class="menu-list">
        ${!isStandalone() ? `<button class="btn" data-m="install">📱 Cài app lên điện thoại</button>` : ""}
        <button class="btn" data-m="pw">🔑 Đổi mật khẩu</button>
        <button class="btn" data-m="theme">◐ Giao diện sáng / tối</button>
        <button class="btn danger" data-m="out">⎋ Đăng xuất</button>
      </div>
      <div class="actions"><button class="btn" data-x>Đóng</button></div>`, (m, close) => {
      m.querySelector("[data-x]").onclick = close;
      const acts = { install: installApp, pw: changePw, theme: toggleTheme, out: doLogout };
      m.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { close(); acts[b.dataset.m](); });
    }, "sheet");
  }
  function bindShell() {
    const acts = { out: doLogout, theme: toggleTheme, pw: changePw, install: installApp, menu: accountMenu };
    document.querySelectorAll("[data-act]").forEach(b => b.onclick = () => acts[b.dataset.act]());
  }

  // Thẻ biểu đồ có nút chuyển sang dạng bảng
  function chartCard(id, title, sub, extra = "") {
    const v = state.views[id] || "chart";
    return `<div class="card">
      <div class="card-head"><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}</div>
        <div style="display:flex;gap:8px;align-items:center">${extra}<div class="seg view-toggle" data-view="${id}"><button class="${v === "chart" ? "on" : ""}" data-v="chart">Biểu đồ</button><button class="${v === "table" ? "on" : ""}" data-v="table">Bảng</button></div></div></div>
      <div class="chart-box ${v === "table" ? "hidden" : ""}"><canvas id="${id}"></canvas></div>
      <div class="tbl-wrap ${v === "chart" ? "hidden" : ""}" id="${id}-tbl"></div>
    </div>`;
  }
  function bindViewToggles() {
    document.querySelectorAll("[data-view]").forEach(seg => seg.querySelectorAll("button").forEach(b => b.onclick = () => {
      state.views[seg.dataset.view] = b.dataset.v; route();
    }));
  }
  function simpleTable(headers, rows) {
    return `<table class="tbl"><thead><tr>${headers.map(h => `<th class="${h.r ? "r" : ""}">${h.t}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${headers[i].r ? "r num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  // ============================================================
  //  TỔNG QUAN
  // ============================================================
  async function pageDashboard() {
    const sheets = await api.sheetsByYear(state.year);
    const idx = indexSheets(sheets);
    if (state.dashMonth == null) {
      // tháng gần nhất có ≥ 1/2 bộ phận đã nhập
      let m = state.year === now.getFullYear() ? now.getMonth() + 1 : 12;
      for (; m > 1; m--) if (state.deps.filter(d => idx[d.id][m]).length >= Math.ceil(state.deps.length / 2)) break;
      state.dashMonth = m;
    }
    const M = state.dashMonth;
    const rows = state.deps.map(d => {
      const s = idx[d.id][M];
      const ytd = avg(Array.from({ length: 12 }, (_, i) => effScore(idx[d.id][i + 1])));
      return { d, s, score: effScore(s), ytd };
    });
    const scored = rows.filter(r => r.score != null);
    const compAvg = avg(scored.map(r => r.score));
    const prevAvg = M > 1 ? avg(state.deps.map(d => effScore(idx[d.id][M - 1]))) : null;
    const submitted = rows.filter(r => r.s && r.s.status === "submitted").length;
    const sorted = scored.slice().sort((a, b) => b.score - a.score);
    const best = sorted[0], worst = sorted[sorted.length - 1];
    const monthly = Array.from({ length: 12 }, (_, i) => avg(state.deps.map(d => effScore(idx[d.id][i + 1]))));
    const ytdAvg = avg(monthly);
    const delta = compAvg != null && prevAvg != null ? compAvg - prevAvg : null;

    const html = `
      <div class="page-head"><div><h1>Tổng quan OKR</h1><p>Điểm hoàn thành OKR của ${state.deps.length} bộ phận · tháng ${M}/${state.year}</p></div>
        <button class="btn no-print" id="bXlsxMonth">⬇ Xuất Excel tổng hợp T${M}/${state.year}</button></div>
      <div class="filters">
        <label>${yearSel(state.year, 'id="fYear"')}</label>
        <label>${monthSel(M, 'id="fMonth"')}</label>
        <label><input type="checkbox" id="fSub" ${state.onlySubmitted ? "checked" : ""}> Chỉ tính phiếu đã nộp</label>
      </div>
      <div class="tiles">
        <div class="card tile"><div class="lbl">Điểm TB toàn công ty · T${M}</div><div class="val">${fmt(compAvg)}<small>%</small></div>
          <div class="foot">${delta == null ? "&nbsp;" : (delta >= 0 ? "▲ +" : "▼ ") + fmt(delta) + " điểm so với T" + (M - 1)}</div></div>
        <div class="card tile"><div class="lbl">Bộ phận đã nộp</div><div class="val">${submitted}<small> / ${state.deps.length}</small></div>
          <div class="foot">${rows.filter(r => r.s && r.s.status === "draft").length} nháp · ${rows.filter(r => !r.s).length} chưa nhập</div></div>
        <div class="card tile"><div class="lbl">Cao nhất tháng</div><div class="val">${best ? fmt(best.score) + "<small>%</small>" : "—"}</div>
          <div class="foot">${best ? esc(best.d.name) : "&nbsp;"}</div></div>
        <div class="card tile"><div class="lbl">TB lũy kế năm ${state.year}</div><div class="val">${fmt(ytdAvg)}<small>%</small></div>
          <div class="foot">${worst && sorted.length > 1 ? "Thấp nhất T" + M + ": " + esc(worst.d.name) + " (" + fmt(worst.score) + "%)" : "&nbsp;"}</div></div>
      </div>
      <div class="cols-2">
        ${chartCard("chDeps", `Điểm OKR theo bộ phận · Tháng ${M}/${state.year}`, "Xếp từ cao xuống thấp · bấm vào cột để xem chi tiết bộ phận")}
        ${chartCard("chMonths", `Điểm TB toàn công ty theo tháng · ${state.year}`, "Trung bình các bộ phận có dữ liệu trong tháng")}
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>Bảng xếp hạng tháng ${M}/${state.year}</h2><div class="sub">Lũy kế = TB các tháng đã có điểm trong năm</div></div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>#</th><th>Bộ phận</th><th class="r">Tự ĐG</th><th style="width:18%" class="hide-sm"></th><th class="r hide-sm">BGĐ đánh giá</th><th>Xếp loại</th><th class="hide-sm">Trạng thái</th><th class="r hide-sm">Lũy kế năm</th><th class="hide-sm"></th></tr></thead>
          <tbody>${rows.slice().sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((r, i) => `<tr class="clickable" data-rowrep="${r.d.id}">
            <td class="muted">${r.score != null ? i + 1 : ""}</td>
            <td><b>${esc(r.d.name)}</b></td>
            <td class="r num"><b>${fmtPct(r.score)}</b></td>
            <td class="hide-sm"><div class="meter"><div style="width:${Math.min(100, r.score ?? 0)}%"></div></div></td>
            <td class="r num hide-sm">${fmtPct(r.s ? r.s.score_bgd : null)}</td>
            <td>${ratingBadge(r.score)}</td>
            <td class="hide-sm">${statusBadge(r.s)}</td>
            <td class="r num hide-sm">${fmtPct(r.ytd)}</td>
            <td class="r hide-sm"><a href="#/report" data-rep="${r.d.id}" class="btn sm ghost">Chi tiết →</a></td></tr>`).join("")}
          </tbody></table></div>
      </div>`;
    $app.innerHTML = shell(html); bindShell(); bindViewToggles();

    document.getElementById("fYear").onchange = e => { state.year = +e.target.value; state.dashMonth = null; route(); };
    document.getElementById("fMonth").onchange = e => { state.dashMonth = +e.target.value; route(); };
    document.getElementById("fSub").onchange = e => { state.onlySubmitted = e.target.checked; route(); };
    document.getElementById("bXlsxMonth").onclick = async () => {
      try { await window.OKRExport.exportMonth(state.year, M, sheets.filter(x => x.month === M), await api.users(), state.deps); } catch (e) { toast("Không xuất được Excel: " + e.message, true); }
    };
    document.querySelectorAll("[data-rep]").forEach(a => a.onclick = () => { state.reportDep = a.dataset.rep; state.reportMonth = M; });
    document.querySelectorAll("[data-rowrep]").forEach(tr => tr.onclick = (e) => { if (e.target.closest("a")) return; state.reportDep = tr.dataset.rowrep; state.reportMonth = M; location.hash = "#/report"; });

    const depData = sorted.concat(rows.filter(r => r.score == null));
    C.bar(document.getElementById("chDeps"), {
      labels: depData.map(r => r.d.name), datasets: [{ label: "Điểm OKR", data: depData.map(r => r.score) }], horizontalOnNarrow: true,
      onClick: (i) => { state.reportDep = depData[i].d.id; state.reportMonth = M; location.hash = "#/report"; }
    });
    document.getElementById("chDeps-tbl").innerHTML = simpleTable([{ t: "Bộ phận" }, { t: "Điểm", r: 1 }, { t: "Xếp loại" }], depData.map(r => [esc(r.d.name), fmtPct(r.score), ratingBadge(r.score)]));
    C.bar(document.getElementById("chMonths"), {
      labels: MONTHS, datasets: [{ label: "Điểm TB công ty", data: monthly.map(v => v == null ? null : Math.round(v * 10) / 10) }],
      onClick: (i) => { state.dashMonth = i + 1; route(); }
    });
    document.getElementById("chMonths-tbl").innerHTML = simpleTable([{ t: "Tháng" }, { t: "Điểm TB", r: 1 }, { t: "Số bộ phận có điểm", r: 1 }],
      monthly.map((v, i) => ["Tháng " + (i + 1), fmtPct(v), state.deps.filter(d => effScore(idx[d.id][i + 1]) != null).length]));
  }

  // ============================================================
  //  NHẬP OKR
  // ============================================================
  function blankKR() { return { id: window.OKR.uid(), title: "", method: "", unit: "%", target: "", target_year: "", actual: "", direction: "up", note: "" }; }
  function blankObj() { return { id: window.OKR.uid(), title: "", weight: 50, krs: [blankKR(), blankKR()] }; }

  async function loadSheet() {
    // Bỏ phiếu đang sửa => xoá các file vừa tải lên nhưng chưa lưu vào phiếu
    if (state.pendingUp.length) api.deleteAttachmentFiles(state.pendingUp).catch(() => {});
    state.pendingUp = []; state.pendingDel = []; state.filePicking = false;
    const s = await api.getSheet(state.editDep, state.editYear, state.editMonth);
    state.sheet = s ? JSON.parse(JSON.stringify(s)) : { department_id: state.editDep, year: state.editYear, month: state.editMonth, objectives: [], bgd: {}, attachments: [], comment: "", status: "draft", _new: true };
    state.sheet.bgd = state.sheet.bgd || {};
    state.sheet.attachments = state.sheet.attachments || [];
    state.dirty = false;
  }

  // ============================================================
  //  FILE ĐÍNH KÈM (minh chứng cho từng KR + tài liệu chung của phiếu)
  //  - Tải lên ngay khi chọn file, nhưng chỉ ghi vào phiếu khi bấm Lưu/Nộp.
  //  - Gỡ file: chỉ xoá khỏi kho sau khi lưu phiếu thành công.
  // ============================================================
  const F = window.OKR.files;
  const fmtSize = (b) => b < 1024 ? b + " B" : b < 1048576 ? Math.round(b / 1024) + " KB" : (b / 1048576).toFixed(1) + " MB";
  const FILE_ICON = { doc: "DOC", docx: "DOC", xls: "XLS", xlsx: "XLS", csv: "CSV" };
  const urlCache = new Map();
  async function fileUrl(meta, download) {
    const key = meta.path + (download ? "|dl" : "");
    const c = urlCache.get(key);
    if (c && c.exp > Date.now()) return c.url;
    const url = await api.attachmentUrl(meta, { download: !!download });
    urlCache.set(key, { url, exp: Date.now() + 50 * 60 * 1000 });   // link có hạn 60 phút
    return url;
  }
  async function downloadFile(meta) {
    const url = await fileUrl(meta, true);
    const a = document.createElement("a"); a.href = url; a.download = meta.name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function openFile(meta) {
    try {
      if (!F.isImage(meta)) return await downloadFile(meta);
      const url = await fileUrl(meta);
      modal(`<div class="lb-head"><b>${esc(meta.name)}</b><span class="muted">${fmtSize(meta.size)}${meta.uploaded_by ? " · " + esc(userName(meta.uploaded_by)) : ""}${meta.uploaded_at ? " · " + new Date(meta.uploaded_at).toLocaleString("vi-VN") : ""}</span></div>
        <img class="lb-img" src="${esc(url)}" alt="${esc(meta.name)}">
        <div class="actions"><button class="btn" data-dl>⬇ Tải về</button><button class="btn primary" data-x>Đóng</button></div>`, (m, close) => {
        m.querySelector("[data-x]").onclick = close;
        m.querySelector("[data-dl]").onclick = () => downloadFile(meta).catch(e => toast(e.message, true));
      }, "lightbox");
    } catch (e) { toast(e.message, true); }
  }
  function fileChip(meta, removable) {
    const img = F.isImage(meta);
    return `<div class="att" title="${esc(meta.name)} · ${fmtSize(meta.size)}">
      <button type="button" class="att-open" data-open="${esc(meta.id)}">
        ${img ? `<img class="att-thumb" data-thumb="${esc(meta.id)}" alt="">` : `<span class="att-ico ${esc(meta.ext)}">${FILE_ICON[meta.ext] || "FILE"}</span>`}
        <span class="att-txt"><span class="att-name">${esc(meta.name)}</span><span class="att-size">${fmtSize(meta.size)}</span></span>
      </button>${removable ? `<button type="button" class="att-del" data-rmatt="${esc(meta.id)}" title="Gỡ file">✕</button>` : ""}</div>`;
  }
  // Khối file của 1 KR (krId) hoặc tài liệu chung (krId = null)
  function filesBlock(sheet, krId, editable, addLabel) {
    const list = (sheet.attachments || []).filter(a => (a.kr_id || null) === (krId || null));
    if (!editable && !list.length) return "";
    return `<div class="att-box" data-files="${esc(krId || "")}">${list.map(a => fileChip(a, editable)).join("")}${editable ? `<button type="button" class="btn sm att-add" data-addfile="${esc(krId || "")}">📎 ${addLabel || "Đính kèm"}</button>` : ""}</div>`;
  }
  function loadThumbs(root, sheet) {
    root.querySelectorAll("img[data-thumb]:not([src])").forEach(img => {
      const meta = (sheet.attachments || []).find(a => a.id === img.dataset.thumb);
      if (meta) fileUrl(meta).then(u => { img.src = u; }).catch(() => img.classList.add("broken"));
    });
  }
  function refreshFiles(krId) {
    const box = document.querySelector(`[data-files="${CSS.escape(krId || "")}"]`);
    if (!box) return;
    box.outerHTML = filesBlock(state.sheet, krId, true, krId ? "Đính kèm" : "Thêm file");
    const nb = document.querySelector(`[data-files="${CSS.escape(krId || "")}"]`);
    if (nb) loadThumbs(nb, state.sheet);
    const cnt = document.getElementById("attCount"); if (cnt) cnt.textContent = (state.sheet.attachments || []).length;
  }
  function pickFiles(krId) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.multiple = true; inp.accept = F.accept;
    state.filePicking = true;   // điện thoại: chọn file làm app chạy nền, không tự tải lại phiếu khi quay về
    inp.addEventListener("cancel", () => { state.filePicking = false; });
    inp.onchange = () => uploadFiles([...inp.files], krId);
    inp.click();
  }
  async function uploadFiles(files, krId) {
    const s = state.sheet;
    state.filePicking = true;
    const errs = []; let ok = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const bad = F.check(f); if (bad) { errs.push(bad); continue; }
        toast(`Đang tải lên ${files.length > 1 ? `${i + 1}/${files.length}: ` : ""}${f.name}…`);
        try {
          const meta = await api.uploadAttachment(state.user, s, f, krId);
          if (state.sheet !== s) { api.deleteAttachmentFiles([meta]).catch(() => {}); return; }   // đã chuyển sang phiếu khác
          s.attachments = s.attachments || [];
          s.attachments.push(meta); state.pendingUp.push(meta);
          state.dirty = true; ok++; refreshFiles(krId);
        } catch (e) { errs.push(e.message); }
      }
    } finally { state.filePicking = false; }
    if (errs.length) {
      modal(`<h2>${ok ? `Đã đính kèm ${ok} file, ` : ""}${errs.length} file không đính kèm được</h2><ul class="warn-list">${errs.map(e => `<li>${esc(e)}</li>`).join("")}</ul>
        <div class="muted" style="font-size:12.5px">Chấp nhận: ${esc(F.accept.replace(/,/g, ", "))} · tối đa ${F.maxMb} MB/file.</div>
        <div class="actions"><button class="btn primary" data-x>Đóng</button></div>`, (m, close) => { m.querySelector("[data-x]").onclick = close; });
    } else if (ok) toast(`Đã đính kèm ${ok} file. Bấm 💾 Lưu để ghi vào phiếu.`);
  }
  // Gỡ file khỏi phiếu (KR bị xoá, sao chép tháng trước…). File thật được xoá sau khi lưu.
  function dropAttachments(pred) {
    const s = state.sheet, gone = (s.attachments || []).filter(pred);
    if (!gone.length) return 0;
    s.attachments = s.attachments.filter(a => !pred(a));
    state.pendingDel.push(...gone);
    return gone.length;
  }
  // Gắn sự kiện (uỷ quyền) cho vùng chứa file: mở, gỡ, thêm, kéo-thả
  function bindFiles(root, getSheet, editable) {
    if (!root) return;
    loadThumbs(root, getSheet());
    root.addEventListener("click", async (e) => {
      const sheet = getSheet();
      const op = e.target.closest("[data-open]");
      if (op) { const m = (sheet.attachments || []).find(a => a.id === op.dataset.open); if (m) openFile(m); return; }
      if (!editable) return;
      const rm = e.target.closest("[data-rmatt]");
      if (rm) {
        const m = (sheet.attachments || []).find(a => a.id === rm.dataset.rmatt); if (!m) return;
        if (!(await confirmBox(`Gỡ file <b>${esc(m.name)}</b> khỏi phiếu?<br><span class="muted">File bị xoá hẳn khi bạn bấm Lưu.</span>`, "Gỡ file", true))) return;
        dropAttachments(a => a.id === m.id); state.dirty = true; refreshFiles(m.kr_id || null);
        return;
      }
      const add = e.target.closest("[data-addfile]");
      if (add) pickFiles(add.dataset.addfile || null);
    });
    if (!editable) return;
    root.addEventListener("dragover", (e) => { const b = e.target.closest("[data-files]"); if (b && e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); b.classList.add("drop"); } });
    root.addEventListener("dragleave", (e) => { const b = e.target.closest("[data-files]"); if (b && !b.contains(e.relatedTarget)) b.classList.remove("drop"); });
    root.addEventListener("drop", (e) => {
      const b = e.target.closest("[data-files]"); if (!b) return;
      e.preventDefault(); b.classList.remove("drop");
      if (e.dataTransfer.files.length) uploadFiles([...e.dataTransfer.files], b.dataset.files || null);
    });
  }

  async function pageOkr() {
    if (!state.editDep || !P.canView(state.user, state.editDep)) state.editDep = state.user.department_id || visibleDeps()[0].id;
    if (!state.sheet || state.sheet.department_id !== state.editDep || state.sheet.year !== state.editYear || state.sheet.month !== state.editMonth) await loadSheet();
    const s = state.sheet;
    const isAdmin = P.isAdmin(state.user);
    const isFull = P.isFull(state.user);
    const editable = P.canEditSheet(state.user, s);
    // Danh sách đủ 11 bộ phận cho mọi tài khoản; trưởng bộ phận chỉ sửa được bộ phận của mình, bộ phận khác chỉ xem
    const myDep = state.user.department_id;
    const depPicker = visibleDeps().length === 1 ? `<b style="padding:0 4px">${esc(depName(state.editDep))}</b>` : `<label>${sel(visibleDeps().map(d => ({ v: d.id, t: d.name + (d.id === myDep ? " (bộ phận của tôi)" : "") })), state.editDep, 'id="eDep"')}</label>`;

    const html = `
      <div class="page-head"><div><h1>Nhập & tự đánh giá OKR</h1>
        <p class="hide-sm">Mỗi bộ phận tự đặt mục tiêu, kết quả then chốt (KR) và tỷ trọng mục tiêu (tổng = 100%). % hoàn thành KR: Thuận = 1 + (TH − CT)/CT, Nghịch = 1 − (TH − CT)/CT, tối đa ${Math.round((CFG.MAX_ACHIEVEMENT || 1.5) * 100)}%. Cột “KQ BGĐ ĐG” do Ban giám đốc nhập.</p></div></div>
      <div class="filters">${depPicker}<label>${yearSel(state.editYear, 'id="eYear"')}</label><label>${monthSel(state.editMonth, 'id="eMonth"')}</label>
        <span>${statusBadge(s._new ? null : s)}</span></div>
      <div class="card sheet-bar">
        <div class="score-pill"><div><div class="muted" style="font-size:12.5px">Bộ phận tự đánh giá · T${s.month}/${s.year}</div><span class="big" id="sheetScore">—</span></div><span id="sheetRating"></span>
          <div style="margin-left:18px;padding-left:18px;border-left:1px solid var(--border)"><div class="muted" style="font-size:12.5px">BGĐ (QLTT) đánh giá</div><span class="big" id="sheetScoreBgd" style="font-size:24px">—</span></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap" class="no-print">
          ${editable ? `<button class="btn" id="bCopy">⧉ Sao chép từ tháng trước</button><button class="btn" id="bAddObj">＋ Thêm mục tiêu</button>
            <button class="btn" id="bSave">💾 Lưu nháp</button>${s.status === "draft" ? `<button class="btn primary" id="bSubmit">✓ Nộp đánh giá</button>` : ""}` : ""}
          ${isFull && s.status === "submitted" ? `<button class="btn" id="bReopen">↺ Mở lại cho bộ phận sửa</button>` : ""}
          ${isAdmin && !s._new ? `<button class="btn danger" id="bDel">Xoá phiếu</button>` : ""}
          <button class="btn" id="bXlsx">⬇ Xuất Excel</button>
          <button class="btn" onclick="window.print()">In</button>
        </div>
      </div>
      ${s.status === "submitted" ? `<div class="lock-note">✓ Phiếu đã nộp${isFull ? " – bạn vẫn có thể chỉnh sửa hoặc mở lại cho bộ phận." : ". Muốn sửa, liên hệ Ban giám đốc hoặc Hành chính nhân sự để mở lại."}</div>` : ""}
      ${!canEdit(s.department_id) ? `<div class="lock-note">Bạn đang xem OKR của bộ phận <b>${esc(depName(s.department_id))}</b> (chỉ xem).${myDep ? ` <a href="javascript:void 0" id="bMine">Về bộ phận của tôi →</a>` : ""}</div>` : ""}
      ${!s._new && s.updated_at ? `<div class="muted upd-info">Cập nhật lần cuối: ${esc(userName(s.updated_by))} · ${new Date(s.updated_at).toLocaleString("vi-VN")}</div>` : ""}
      <ul class="warn-list hidden" id="warns"></ul>
      <div id="objs"></div>
      <div class="card" style="margin-top:6px"><label class="field"><span>Nhận xét chung / nguyên nhân chưa đạt / hành động cải tiến tháng tới</span>
        <textarea id="sComment" rows="3" ${editable ? "" : "disabled"}>${esc(s.comment || "")}</textarea></label></div>
      <div class="card" style="margin-top:12px" id="genFiles">
        <div class="att-head"><span>📎 File đính kèm của phiếu · <b id="attCount">${(s.attachments || []).length}</b> file</span>
          <span class="muted hide-sm">Ảnh (jpg, png, gif, bmp, webp), Word, Excel, CSV · tối đa ${F.maxMb} MB/file${editable ? " · kéo thả file vào đây" : ""}</span></div>
        <div class="muted" style="font-size:12.5px;margin:2px 0 8px">Tài liệu chung cho cả phiếu. Minh chứng cho từng KR đính kèm ngay dưới KR đó.</div>
        ${filesBlock(s, null, editable, "Thêm file") || `<div class="muted">Chưa có tài liệu chung.</div>`}
      </div>
      ${editable ? `<div class="m-actions"><button class="btn" data-proxy="bAddObj">＋ Mục tiêu</button><button class="btn" data-proxy="bSave">💾 Lưu</button>${s.status === "draft" ? `<button class="btn primary" data-proxy="bSubmit">✓ Nộp</button>` : ""}</div>` : ""}`;
    $app.innerHTML = shell(html); bindShell();
    renderObjectives(editable);
    bindFiles(document.getElementById("objs"), () => state.sheet, editable);
    bindFiles(document.getElementById("genFiles"), () => state.sheet, editable);

    const reload = async () => { state.sheet = null; route(); };
    const guard = async () => !state.dirty || await confirmBox("Có thay đổi chưa lưu. Bỏ qua thay đổi?", "Bỏ qua", true);
    document.querySelectorAll("[data-proxy]").forEach(b => b.onclick = () => { const t = document.getElementById(b.dataset.proxy); if (t) t.click(); });
    const mine = document.getElementById("bMine");
    if (mine) mine.onclick = () => { state.editDep = myDep; reload(); };
    const eDep = document.getElementById("eDep");
    if (eDep) eDep.onchange = async e => { if (!(await guard())) { e.target.value = state.editDep; return; } state.editDep = e.target.value; reload(); };
    document.getElementById("eYear").onchange = async e => { if (!(await guard())) { e.target.value = state.editYear; return; } state.editYear = +e.target.value; reload(); };
    document.getElementById("eMonth").onchange = async e => { if (!(await guard())) { e.target.value = state.editMonth; return; } state.editMonth = +e.target.value; reload(); };
    document.getElementById("sComment").oninput = e => { s.comment = e.target.value; state.dirty = true; };

    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on("bAddObj", () => { s.objectives.push(blankObj()); state.dirty = true; renderObjectives(true); });
    on("bCopy", async () => {
      const pm = s.month === 1 ? 12 : s.month - 1, py = s.month === 1 ? s.year - 1 : s.year;
      const prev = await api.getSheet(s.department_id, py, pm);
      if (!prev || !prev.objectives.length) return toast(`Tháng ${pm}/${py} chưa có OKR để sao chép.`, true);
      const krFiles = (s.attachments || []).filter(a => a.kr_id).length;
      if (s.objectives.length && !(await confirmBox("Thay toàn bộ mục tiêu hiện tại bằng OKR tháng trước (giữ chỉ tiêu, xoá số thực tế)?" + (krFiles ? `<br>${krFiles} file minh chứng của các KR hiện tại sẽ bị gỡ (tài liệu chung được giữ lại).` : "")))) return;
      s.objectives = prev.objectives.map(o => ({ ...o, id: window.OKR.uid(), krs: o.krs.map(k => ({ ...k, id: window.OKR.uid(), actual: "", note: "" })) }));
      s.bgd = {};
      dropAttachments(a => !!a.kr_id);   // minh chứng là của từng tháng, không sao chép
      state.dirty = true; renderObjectives(true); toast(`Đã sao chép OKR tháng ${pm}/${py}. Nhập số thực tế rồi lưu.`);
    });
    on("bSave", async () => { await save(s.status); });
    on("bXlsx", async () => {
      if (state.dirty) toast("Lưu ý: file xuất theo dữ liệu đang hiển thị (chưa lưu).");
      try { await window.OKRExport.exportDepartmentMonth(s, await api.users(), state.deps); } catch (e) { toast("Không xuất được Excel: " + e.message, true); }
    });
    on("bSubmit", async () => {
      const errs = calc.validateSheet(s.objectives);
      if (errs.length) { showWarns(errs, true); return toast("Chưa thể nộp – xem các mục cần sửa ở trên.", true); }
      if (!(await confirmBox(`Nộp đánh giá OKR tháng ${s.month}/${s.year} với điểm <b>${fmtPct(calc.sheetScore(s.objectives))}</b>?<br>Sau khi nộp, bộ phận không thể tự sửa.`, "Nộp"))) return;
      await save("submitted");
    });
    on("bReopen", async () => { if (await confirmBox("Mở lại phiếu về trạng thái Nháp để bộ phận chỉnh sửa?")) await save("draft"); });
    on("bDel", async () => {
      if (!(await confirmBox(`Xoá phiếu OKR ${depName(s.department_id)} tháng ${s.month}/${s.year}?`, "Xoá", true))) return;
      try {
        await api.deleteSheet(state.user, s.department_id, s.year, s.month);
        api.deleteAttachmentFiles([...(s.attachments || []), ...state.pendingDel]).catch(() => {});
        state.pendingDel = [];
        toast("Đã xoá phiếu."); reload();
      } catch (e) { toast(e.message, true); }
    });
  }

  async function save(status, force) {
    const s = state.sheet;
    try {
      const { _new, ...clean } = s;
      const saved = await api.saveSheet(state.user, { ...clean, status }, { force: !!force });
      state.sheet = JSON.parse(JSON.stringify(saved)); state.dirty = false;
      state.sheet.attachments = state.sheet.attachments || [];
      // Đã lưu => file mới chính thức thuộc phiếu; file đã gỡ thì xoá hẳn khỏi kho
      const kept = new Set(state.sheet.attachments.map(a => a.path));
      const del = state.pendingDel.filter(a => !kept.has(a.path));
      state.pendingUp = []; state.pendingDel = [];
      if (del.length) api.deleteAttachmentFiles(del).catch(() => {});
      toast(status === "submitted" && s.status !== "submitted" ? "Đã nộp đánh giá." : "Đã lưu.");
      route();
    } catch (e) {
      if (e.code !== "CONFLICT") return toast(e.message, true);
      const cur = e.current || {};
      modal(`<h2>Phiếu vừa được người khác cập nhật</h2>
        <div class="sec"><b>${esc(userName(cur.updated_by))}</b> đã lưu phiếu OKR ${esc(depName(s.department_id))} tháng ${s.month}/${s.year} lúc ${cur.updated_at ? new Date(cur.updated_at).toLocaleString("vi-VN") : "—"}, sau khi bạn mở phiếu.</div>
        <div class="sec">Chọn <b>Tải bản mới nhất</b> để xem thay đổi của họ (thay đổi chưa lưu của bạn sẽ mất), hoặc <b>Ghi đè</b> để lưu bản của bạn thay thế.</div>
        <div class="actions"><button class="btn" data-x>Huỷ</button><button class="btn danger" data-over>Ghi đè</button><button class="btn primary" data-reload>Tải bản mới nhất</button></div>`, (m, close) => {
        m.querySelector("[data-x]").onclick = close;
        m.querySelector("[data-reload]").onclick = () => { close(); state.dirty = false; state.sheet = null; route(); };
        m.querySelector("[data-over]").onclick = () => {
          close();
          if (cur.id) { s.id = cur.id; s.updated_at = cur.updated_at; delete s._new; }
          save(status, true);
        };
      });
    }
  }

  function showWarns(errs, force) {
    const w = document.getElementById("warns"); if (!w) return;
    if (!errs.length || (!force && !state.sheet.objectives.length)) { w.classList.add("hidden"); w.innerHTML = ""; return; }
    w.classList.remove("hidden");
    w.innerHTML = errs.slice(0, 8).map(e => `<li>${esc(e)}</li>`).join("") + (errs.length > 8 ? `<li>… và ${errs.length - 8} mục khác</li>` : "");
  }

  function renderObjectives(editable) {
    const s = state.sheet;
    const box = document.getElementById("objs");
    const dis = editable ? "" : "disabled";
    const disB = state.user.role === "admin" ? "" : "disabled";   // cột BGĐ chỉ admin nhập
    if (!s.objectives.length) {
      box.innerHTML = `<div class="empty">Chưa có mục tiêu nào cho tháng ${s.month}/${s.year}.${editable ? "<br>Bấm <b>＋ Thêm mục tiêu</b> hoặc <b>⧉ Sao chép từ tháng trước</b>." : ""}</div>`;
      updateScores(); return;
    }
    box.innerHTML = s.objectives.map((o, oi) => `
      <div class="obj" data-oi="${oi}">
        <div class="obj-head">
          <div class="idx">O${oi + 1}</div>
          <input class="title" data-f="title" placeholder="Mục tiêu ${oi + 1} – ví dụ: Đảm bảo sản lượng theo kế hoạch" value="${esc(o.title)}" ${dis}>
          <div class="w-input"><span class="muted" style="font-size:12px">Tỷ trọng</span><input type="number" inputmode="numeric" min="0" max="100" step="1" data-f="weight" value="${esc(o.weight)}" ${dis}><span>%</span></div>
          <div class="obj-score"><span class="muted" style="font-size:12px">Tự ĐG </span><b id="os-${oi}">—</b><br><span class="muted" style="font-size:12px">BGĐ </span><span class="num" id="osb-${oi}">—</span></div>
          <div class="acts">${editable ? `<button class="btn sm ghost danger" data-delobj="${oi}" title="Xoá mục tiêu">✕</button>` : ""}</div>
        </div>
        <div style="padding:4px 10px 0;overflow-x:auto"><table class="kr-table">
          <thead><tr><th style="width:4%">STT</th><th style="width:28%">Kết quả then chốt (KR)</th><th style="width:7%">ĐVT</th><th style="width:11%">Chiều hướng</th><th style="width:8%">Chỉ tiêu năm</th><th style="width:8%">Chỉ tiêu tháng</th><th style="width:8%">KQ tự ĐG</th><th style="width:8%">KQ BGĐ ĐG</th><th style="width:7%;text-align:right">HT tự ĐG</th><th style="width:7%;text-align:right">HT BGĐ</th><th></th></tr></thead>
          ${o.krs.map((k, ki) => `<tbody class="kr" data-ki="${ki}"><tr>
            <td class="muted num kr-no">${oi + 1}.${ki + 1}</td>
            <td class="kr-title" data-label="Kết quả then chốt ${oi + 1}.${ki + 1}"><input data-k="title" value="${esc(k.title)}" placeholder="Nội dung KR ${ki + 1}" ${dis}></td>
            <td data-label="ĐVT"><input data-k="unit" value="${esc(k.unit)}" ${dis}></td>
            <td data-label="Chiều hướng">${sel([{ v: "up", t: "Thuận ↑" }, { v: "down", t: "Nghịch ↓" }], k.direction, `data-k="direction" ${dis}`)}</td>
            <td data-label="Chỉ tiêu năm"><input class="n" type="number" inputmode="decimal" step="any" data-k="target_year" value="${esc(k.target_year ?? "")}" ${dis}></td>
            <td data-label="Chỉ tiêu tháng"><input class="n" type="number" inputmode="decimal" step="any" data-k="target" value="${esc(k.target)}" ${dis}></td>
            <td data-label="KQ tự đánh giá"><input class="n" type="number" inputmode="decimal" step="any" data-k="actual" value="${esc(k.actual)}" ${dis}></td>
            <td data-label="KQ BGĐ đánh giá"><input class="n" type="number" inputmode="decimal" step="any" data-b="1" value="${esc((s.bgd || {})[k.id] ?? "")}" ${disB} title="Chỉ Ban giám đốc nhập"></td>
            <td class="ach" data-label="HT tự ĐG" id="ka-${oi}-${ki}">—</td>
            <td class="ach" data-label="HT BGĐ" id="kb-${oi}-${ki}">—</td>
            <td class="kr-del">${editable ? `<button class="btn sm ghost danger" data-delkr="${oi}-${ki}" title="Xoá KR">✕</button>` : ""}</td></tr>
            <tr class="kr-sub"><td class="kr-no"></td><td colspan="4" data-label="Phương pháp đo lường"><input data-k="method" value="${esc(k.method || "")}" placeholder="Phương pháp đo lường – ví dụ: Không hoàn thành trừ 5%" ${dis}></td>
              <td colspan="5" data-label="Ghi chú"><input data-k="note" value="${esc(k.note || "")}" placeholder="Ghi chú" ${editable || !disB ? "" : "disabled"}></td><td></td></tr>
            ${(() => { const fb = filesBlock(s, k.id, editable, "Đính kèm minh chứng"); return fb ? `<tr class="kr-files"><td class="kr-no"></td><td colspan="10" data-label="Minh chứng KR ${oi + 1}.${ki + 1}">${fb}</td></tr>` : ""; })()}</tbody>`).join("")}
          </table></div>
        <div class="obj-foot">
          <div>${editable ? `<button class="btn sm" data-addkr="${oi}">＋ Thêm KR</button>` : ""}</div>
          <div class="muted" style="font-size:12.5px">Điểm mục tiêu = trung bình % hoàn thành các KR</div>
        </div>
      </div>`).join("") + `<div class="muted" id="ow" style="text-align:right;font-size:12.5px;margin:-4px 2px 10px"></div>`;

    box.querySelectorAll(".obj").forEach(card => {
      const oi = +card.dataset.oi, o = s.objectives[oi];
      card.querySelectorAll("[data-f]").forEach(inp => inp.oninput = () => { o[inp.dataset.f] = inp.dataset.f === "weight" ? (inp.value === "" ? "" : +inp.value) : inp.value; state.dirty = true; updateScores(); });
      card.querySelectorAll("tbody.kr").forEach(tb => {
        const k = o.krs[+tb.dataset.ki];
        tb.querySelectorAll("[data-k]").forEach(inp => {
          const h = () => { const f = inp.dataset.k; k[f] = ["target", "actual", "target_year"].includes(f) ? (inp.value === "" ? "" : +inp.value) : inp.value; state.dirty = true; updateScores(); };
          inp.oninput = h; inp.onchange = h;
        });
        tb.querySelectorAll("[data-b]").forEach(inp => inp.oninput = () => {
          s.bgd = s.bgd || {};
          if (inp.value === "") delete s.bgd[k.id]; else s.bgd[k.id] = +inp.value;
          state.dirty = true; updateScores();
        });
      });
    });
    box.querySelectorAll("[data-addkr]").forEach(b => b.onclick = () => { s.objectives[+b.dataset.addkr].krs.push(blankKR()); state.dirty = true; renderObjectives(true); });
    const filesOf = (ids) => (s.attachments || []).filter(a => a.kr_id && ids.includes(a.kr_id)).length;
    box.querySelectorAll("[data-delkr]").forEach(b => b.onclick = async () => {
      const [oi, ki] = b.dataset.delkr.split("-").map(Number), k = s.objectives[oi].krs[ki];
      const n = filesOf([k.id]);
      if (n && !(await confirmBox(`KR này có ${n} file minh chứng. Xoá KR cùng các file?`, "Xoá", true))) return;
      s.objectives[oi].krs.splice(ki, 1); dropAttachments(a => a.kr_id === k.id); state.dirty = true; renderObjectives(true);
    });
    box.querySelectorAll("[data-delobj]").forEach(b => b.onclick = async () => {
      const o = s.objectives[+b.dataset.delobj], ids = o.krs.map(k => k.id), n = filesOf(ids);
      if (!(await confirmBox("Xoá mục tiêu này cùng các KR của nó?" + (n ? `<br>${n} file minh chứng của các KR cũng bị gỡ.` : ""), "Xoá", true))) return;
      s.objectives.splice(+b.dataset.delobj, 1); dropAttachments(a => ids.includes(a.kr_id)); state.dirty = true; renderObjectives(true);
    });
    loadThumbs(box, s);
    const cnt = document.getElementById("attCount"); if (cnt) cnt.textContent = (s.attachments || []).length;
    updateScores();
  }

  const pct = (frac) => frac == null ? "—" : fmt(frac * 100) + "%";
  function updateScores() {
    const s = state.sheet;
    const gB = calc.bgdGetter(s);
    const total = calc.sheetScore(s.objectives);
    const el = document.getElementById("sheetScore"); if (el) el.textContent = fmtPct(total);
    const elB = document.getElementById("sheetScoreBgd"); if (elB) elB.textContent = fmtPct(calc.bgdScore(s));
    const rt = document.getElementById("sheetRating"); if (rt) rt.innerHTML = ratingBadge(total);
    let ow = 0;
    s.objectives.forEach((o, oi) => {
      ow += Number(o.weight) || 0;
      const os = document.getElementById("os-" + oi); if (os) os.textContent = pct(calc.objectiveScore(o));
      const osb = document.getElementById("osb-" + oi); if (osb) osb.textContent = pct(calc.objectiveScore(o, gB));
      o.krs.forEach((k, ki) => {
        const c = document.getElementById(`ka-${oi}-${ki}`); if (c) c.textContent = pct(calc.krAchievement(k));
        const cb = document.getElementById(`kb-${oi}-${ki}`); if (cb) cb.textContent = pct(calc.krAchievement(k, gB(k)));
      });
    });
    const owEl = document.getElementById("ow");
    if (owEl) owEl.innerHTML = `Tổng tỷ trọng mục tiêu: <b style="color:${Math.abs(ow - 100) < 0.01 ? "inherit" : "var(--critical)"}">${ow}%</b>`;
    showWarns(calc.validateSheet(s.objectives).filter(e => !e.includes("chưa nhập kết quả")));
  }

  // ============================================================
  //  BÁO CÁO BỘ PHẬN
  // ============================================================
  async function pageReport() {
    const sheets = await api.sheetsByYear(state.year);
    const idx = indexSheets(sheets);
    if (!state.reportDep || !P.canView(state.user, state.reportDep)) state.reportDep = state.user.department_id || visibleDeps()[0].id;
    const dep = state.reportDep;
    const showComp = P.seesAll(state.user);   // bộ phận bị giới hạn không thấy số liệu toàn công ty
    const byM = Array.from({ length: 12 }, (_, i) => idx[dep]?.[i + 1] || null);
    const scores = byM.map(effScore);
    const compM = Array.from({ length: 12 }, (_, i) => avg(state.deps.map(d => effScore(idx[d.id][i + 1]))));
    const have = scores.map((v, i) => ({ v, m: i + 1 })).filter(x => x.v != null);
    const hi = have.slice().sort((a, b) => b.v - a.v)[0], lo = have.slice().sort((a, b) => a.v - b.v)[0];
    const yAvg = avg(scores);
    if (state.reportMonth == null || !byM[state.reportMonth - 1]) state.reportMonth = (have[have.length - 1] || {}).m || null;
    const detail = state.reportMonth ? byM[state.reportMonth - 1] : null;

    const html = `
      <div class="page-head"><div><h1>Báo cáo bộ phận</h1><p>Điểm OKR từng tháng và cả năm của một bộ phận</p></div></div>
      <div class="filters">${visibleDeps().length > 1 ? `<label>${sel(visibleDeps().map(d => ({ v: d.id, t: d.name })), dep, 'id="rDep"')}</label>` : `<b style="padding:0 4px">${esc(depName(dep))}</b>`}<label>${yearSel(state.year, 'id="rYear"')}</label>
        <label><input type="checkbox" id="fSub" ${state.onlySubmitted ? "checked" : ""}> Chỉ tính phiếu đã nộp</label></div>
      <div class="tiles">
        <div class="card tile"><div class="lbl">Điểm TB năm ${state.year}</div><div class="val">${fmt(yAvg)}<small>%</small></div><div class="foot">${ratingBadge(yAvg)}</div></div>
        <div class="card tile"><div class="lbl">Tháng cao nhất</div><div class="val">${hi ? fmt(hi.v) + "<small>%</small>" : "—"}</div><div class="foot">${hi ? "Tháng " + hi.m : "&nbsp;"}</div></div>
        <div class="card tile"><div class="lbl">Tháng thấp nhất</div><div class="val">${lo ? fmt(lo.v) + "<small>%</small>" : "—"}</div><div class="foot">${lo ? "Tháng " + lo.m : "&nbsp;"}</div></div>
        <div class="card tile"><div class="lbl">Số tháng đã đánh giá</div><div class="val">${have.length}<small> / 12</small></div><div class="foot">${byM.filter(s => s && s.status === "submitted").length} tháng đã nộp</div></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h2>${esc(depName(dep))} · điểm OKR theo tháng ${state.year}</h2><div class="sub">${showComp ? "So với điểm TB toàn công ty · " : ""}bấm vào cột để xem chi tiết tháng</div></div>
          <div class="seg view-toggle" data-view="chRep"><button class="${(state.views.chRep || "chart") === "chart" ? "on" : ""}" data-v="chart">Biểu đồ</button><button class="${state.views.chRep === "table" ? "on" : ""}" data-v="table">Bảng</button></div></div>
        <div class="legend"><span><i style="background:var(--series-1)"></i>${esc(depName(dep))}</span>${showComp ? `<span><i style="background:var(--series-2)"></i>TB toàn công ty</span>` : ""}</div>
        <div class="chart-box ${state.views.chRep === "table" ? "hidden" : ""}"><canvas id="chRep"></canvas></div>
        <div class="tbl-wrap ${state.views.chRep === "table" ? "" : "hidden"}">${showComp ? simpleTable([{ t: "Tháng" }, { t: depName(dep), r: 1 }, { t: "TB công ty", r: 1 }, { t: "Xếp loại" }, { t: "Trạng thái" }],
          byM.map((s, i) => ["Tháng " + (i + 1), fmtPct(scores[i]), fmtPct(compM[i]), ratingBadge(scores[i]), statusBadge(s)]))
          : simpleTable([{ t: "Tháng" }, { t: depName(dep), r: 1 }, { t: "Xếp loại" }, { t: "Trạng thái" }],
          byM.map((s, i) => ["Tháng " + (i + 1), fmtPct(scores[i]), ratingBadge(scores[i]), statusBadge(s)]))}</div>
      </div>
      <div class="card" style="margin-top:16px" id="detail">
        ${detail ? detailHtml(detail) : `<div class="empty">Chưa có phiếu OKR nào của bộ phận này trong năm ${state.year}.</div>`}
      </div>`;
    $app.innerHTML = shell(html); bindShell(); bindViewToggles();
    const rDep = document.getElementById("rDep");
    if (rDep) rDep.onchange = e => { state.reportDep = e.target.value; state.reportMonth = null; route(); };
    document.getElementById("rYear").onchange = e => { state.year = +e.target.value; state.reportMonth = null; state.dashMonth = null; route(); };
    document.getElementById("fSub").onchange = e => { state.onlySubmitted = e.target.checked; route(); };
    if (detail) bindFiles(document.getElementById("detailFiles"), () => detail, false);
    const xd = document.getElementById("bXlsxDetail");
    if (xd) xd.onclick = async () => { try { await window.OKRExport.exportDepartmentMonth(detail, await api.users(), state.deps); } catch (e) { toast("Không xuất được Excel: " + e.message, true); } };
    const ed = document.getElementById("bEditDetail");
    if (ed) ed.onclick = () => { state.editDep = dep; state.editYear = state.year; state.editMonth = state.reportMonth; state.sheet = null; location.hash = "#/okr"; };
    C.bar(document.getElementById("chRep"), {
      labels: MONTHS,
      datasets: [{ label: depName(dep), data: scores, colorVar: "--series-1" }, ...(showComp ? [{ label: "TB toàn công ty", data: compM.map(v => v == null ? null : Math.round(v * 10) / 10), colorVar: "--series-2" }] : [])],
      onClick: (i) => { if (byM[i]) { state.reportMonth = i + 1; route(); } }
    });
  }

  function detailHtml(s) {
    const self = calc.sheetScore(s.objectives), bgd = calc.bgdScore(s), gB = calc.bgdGetter(s);
    return `<div class="card-head"><div><h2>Chi tiết OKR tháng ${s.month}/${s.year}</h2><div class="sub">Cập nhật ${new Date(s.updated_at).toLocaleString("vi-VN")}</div></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="muted">Tự ĐG</span><b class="num" style="font-size:18px">${fmtPct(self)}</b>${ratingBadge(self)}
        <span class="muted">BGĐ</span><b class="num" style="font-size:18px">${fmtPct(bgd)}</b>${statusBadge(s)}
        <button class="btn sm" id="bXlsxDetail">⬇ Excel</button>${canEdit(s.department_id) ? `<button class="btn sm" id="bEditDetail">Mở phiếu</button>` : ""}</div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>STT</th><th>Mục tiêu / KR</th><th>Phương pháp đo lường</th><th>ĐVT</th><th>Chiều</th><th class="r">Tỷ trọng</th><th class="r">CT tháng</th><th class="r">KQ tự ĐG</th><th class="r">KQ BGĐ</th><th class="r">HT tự ĐG</th><th class="r">HT BGĐ</th><th>Ghi chú</th></tr></thead><tbody>
      ${s.objectives.map((o, oi) => `<tr style="background:var(--surface-2)"><td><b>${oi + 1}</b></td><td colspan="4"><b>${esc(o.title)}</b></td><td class="r num"><b>${o.weight}%</b></td><td></td><td></td><td></td><td class="r num"><b>${pct(calc.objectiveScore(o))}</b></td><td class="r num"><b>${pct(calc.objectiveScore(o, gB))}</b></td><td></td></tr>
        ${o.krs.map((k, ki) => `<tr><td class="muted">${oi + 1}.${ki + 1}</td><td>${esc(k.title)}</td><td class="muted">${esc(k.method || "")}</td><td>${esc(k.unit)}</td><td>${k.direction === "down" ? "Nghịch" : "Thuận"}</td><td></td><td class="r num">${esc(k.target)}</td><td class="r num">${esc(k.actual === "" ? "—" : k.actual)}</td><td class="r num">${esc(gB(k) ?? "—")}</td><td class="r num">${pct(calc.krAchievement(k))}</td><td class="r num">${pct(calc.krAchievement(k, gB(k)))}</td><td>${esc(k.note || "")}</td></tr>`).join("")}`).join("")}
      </tbody></table></div>
      ${s.comment ? `<div style="margin-top:12px"><div class="muted" style="font-size:12.5px">Nhận xét</div><div style="white-space:pre-wrap">${esc(s.comment)}</div></div>` : ""}
      ${detailFiles(s)}`;
  }
  // Danh sách file đính kèm (chỉ xem) theo KR
  function detailFiles(s) {
    const att = s.attachments || [];
    if (!att.length) return "";
    const groups = [];
    const gen = filesBlock(s, null, false); if (gen) groups.push(["Tài liệu chung", gen]);
    s.objectives.forEach((o, oi) => o.krs.forEach((k, ki) => { const fb = filesBlock(s, k.id, false); if (fb) groups.push([`KR ${oi + 1}.${ki + 1} · ${k.title || ""}`, fb]); }));
    return `<div style="margin-top:14px" id="detailFiles"><div class="muted" style="font-size:12.5px;margin-bottom:6px">📎 File đính kèm (${att.length})</div>
      ${groups.map(([t, fb]) => `<div class="att-group"><div class="att-group-t">${esc(t)}</div>${fb}</div>`).join("")}</div>`;
  }

  // ============================================================
  //  SO SÁNH CẢ NĂM
  // ============================================================
  async function pageCompare() {
    const sheets = await api.sheetsByYear(state.year);
    const idx = indexSheets(sheets);
    const rows = state.deps.map(d => {
      const m = Array.from({ length: 12 }, (_, i) => effScore(idx[d.id][i + 1]));
      return { d, m, y: avg(m) };
    });
    const compM = Array.from({ length: 12 }, (_, i) => avg(rows.map(r => r.m[i])));
    if (!state.compareSel.length) state.compareSel = rows.slice().filter(r => r.y != null).sort((a, b) => b.y - a.y).slice(0, 3).map(r => r.d.id);
    const ranked = rows.slice().sort((a, b) => (b.y ?? -1) - (a.y ?? -1));
    const SER = ["--series-1", "--series-2", "--series-3"];

    const heat = `<table class="tbl heat"><thead><tr><th>Bộ phận</th>${MONTHS.map(m => `<th class="c">${m}</th>`).join("")}<th class="r">TB năm</th><th>Xếp loại</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.d.name)}</b></td>${r.m.map(v => { const c = C.seqColor(v); return `<td class="cell" style="background:${c.bg};color:${c.fg}">${v == null ? "·" : fmt(v, 0)}</td>`; }).join("")}
        <td class="r num"><b>${fmtPct(r.y)}</b></td><td>${ratingBadge(r.y)}</td></tr>`).join("")}
      <tr><td><b>TB toàn công ty</b></td>${compM.map(v => `<td class="c num"><b>${v == null ? "·" : fmt(v, 0)}</b></td>`).join("")}<td class="r num"><b>${fmtPct(avg(compM))}</b></td><td></td></tr>
      </tbody></table>`;
    const scale = [["< 60", 50], ["60–69", 65], ["70–79", 75], ["80–89", 85], ["90–94", 92], ["≥ 95", 97]]
      .map(([t, v]) => { const c = C.seqColor(v); return `<span><i style="background:${c.bg};border:1px solid var(--border)"></i>${t}</span>`; }).join("");

    const html = `
      <div class="page-head"><div><h1>So sánh giữa các bộ phận</h1><p>Điểm OKR từng tháng và trung bình cả năm ${state.year}</p></div>
        <button class="btn no-print" id="bCsv">⬇ Xuất Excel cả năm</button></div>
      <div class="filters"><label>${yearSel(state.year, 'id="cYear"')}</label>
        <label><input type="checkbox" id="fSub" ${state.onlySubmitted ? "checked" : ""}> Chỉ tính phiếu đã nộp</label></div>
      <div class="card"><div class="card-head"><div><h2>Bảng nhiệt điểm OKR theo tháng</h2><div class="sub">Màu càng đậm điểm càng cao · “·” = chưa có dữ liệu</div></div><div class="legend" style="margin:0">${scale}</div></div>
        <div class="tbl-wrap">${heat}</div></div>
      <div class="cols-2" style="margin-top:16px">
        ${chartCard("chYear", `Điểm TB cả năm ${state.year} theo bộ phận`, "Xếp từ cao xuống thấp")}
        <div class="card"><div class="card-head"><div><h2>So sánh theo tháng</h2><div class="sub">Chọn tối đa 3 bộ phận</div></div></div>
          <div class="chip-pick" id="pick">${state.deps.map(d => { const i = state.compareSel.indexOf(d.id); return `<label class="${i >= 0 ? "on" : ""}"><input type="checkbox" value="${d.id}" ${i >= 0 ? "checked" : ""}>${i >= 0 ? `<i style="background:var(${SER[i]})"></i>` : ""}${esc(d.name)}</label>`; }).join("")}</div>
          <div class="legend" style="margin-top:10px">${state.compareSel.map((id, i) => `<span><i style="background:var(${SER[i]})"></i>${esc(depName(id))}</span>`).join("")}</div>
          <div class="chart-box"><canvas id="chCmp"></canvas></div></div>
      </div>`;
    $app.innerHTML = shell(html); bindShell(); bindViewToggles();
    document.getElementById("cYear").onchange = e => { state.year = +e.target.value; state.compareSel = []; state.dashMonth = null; route(); };
    document.getElementById("fSub").onchange = e => { state.onlySubmitted = e.target.checked; route(); };
    document.querySelectorAll("#pick input").forEach(cb => cb.onchange = () => {
      if (cb.checked) { if (state.compareSel.length >= 3) { cb.checked = false; return toast("Chọn tối đa 3 bộ phận để biểu đồ dễ đọc.", true); } state.compareSel.push(cb.value); }
      else state.compareSel = state.compareSel.filter(x => x !== cb.value);
      route();
    });
    C.bar(document.getElementById("chYear"), {
      labels: ranked.map(r => r.d.name), horizontalOnNarrow: true, datasets: [{ label: "TB năm", data: ranked.map(r => r.y == null ? null : Math.round(r.y * 10) / 10) }],
      onClick: (i) => { state.reportDep = ranked[i].d.id; state.reportMonth = null; location.hash = "#/report"; }
    });
    document.getElementById("chYear-tbl").innerHTML = simpleTable([{ t: "#" }, { t: "Bộ phận" }, { t: "TB năm", r: 1 }, { t: "Số tháng có điểm", r: 1 }, { t: "Xếp loại" }],
      ranked.map((r, i) => [r.y != null ? i + 1 : "", esc(r.d.name), fmtPct(r.y), r.m.filter(v => v != null).length, ratingBadge(r.y)]));
    C.bar(document.getElementById("chCmp"), {
      labels: MONTHS,
      datasets: state.compareSel.map((id, i) => ({ label: depName(id), data: rows.find(r => r.d.id === id).m, colorVar: SER[i] }))
    });
    document.getElementById("bCsv").onclick = async () => {
      try { await window.OKRExport.exportYear(state.year, sheets, state.deps, state.onlySubmitted); } catch (e) { toast("Không xuất được Excel: " + e.message, true); }
    };
  }

  // ============================================================
  //  TÀI KHOẢN (admin)
  // ============================================================
  async function pageUsers() {
    if (state.user.role !== "admin") { location.hash = "#/dashboard"; return; }
    const users = await api.users();
    const roleTxt = { admin: "Ban giám đốc", head: "Trưởng bộ phận", viewer: "Chỉ xem" };
    const html = `
      <div class="page-head"><div><h1>Tài khoản</h1><p>Gán mỗi trưởng bộ phận vào đúng bộ phận để họ chỉ sửa được OKR của mình.</p></div>
        ${api.mode === "demo" ? `<button class="btn primary" id="bNewU">＋ Thêm tài khoản</button>` : ""}</div>
      ${api.mode === "supabase" ? `<div class="lock-note">Tạo tài khoản mới trong <b>Supabase › Authentication › Users › Add user</b>; tài khoản sẽ tự xuất hiện ở đây để gán vai trò và bộ phận.</div>` : ""}
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mã NV</th><th>Họ tên</th><th>Chức danh</th><th>Email</th><th>Vai trò</th><th>Bộ phận</th><th></th></tr></thead><tbody>
        ${users.map(u => `<tr><td>${esc(u.employee_code || "")}</td><td><b>${esc(u.full_name)}</b></td><td>${esc(u.title || "")}</td><td>${esc(u.email)}</td><td>${roleTxt[u.role] || u.role}</td><td>${esc(u.department_id ? depName(u.department_id) : "—")}</td>
          <td class="r"><button class="btn sm" data-edit="${u.id}">Sửa</button>${api.mode === "demo" && u.id !== state.user.id ? ` <button class="btn sm danger" data-del="${u.id}">Xoá</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div></div>
      ${api.mode === "demo" ? `<div class="card" style="margin-top:16px"><h2>Dữ liệu demo</h2><p class="sec">Dữ liệu đang lưu trong trình duyệt này. Khi chuyển sang chạy thật với Supabase, dữ liệu demo không được dùng.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="bReset">↺ Khôi phục dữ liệu mẫu</button><button class="btn danger" id="bClear">Xoá toàn bộ phiếu OKR</button></div></div>` : ""}`;
    $app.innerHTML = shell(html); bindShell();

    const form = (u) => modal(`<h2>${u.id ? "Sửa tài khoản" : "Thêm tài khoản"}</h2>
      <label class="field"><span>Họ tên</span><input id="uName" value="${esc(u.full_name || "")}"></label>
      <label class="field"><span>Email</span><input id="uEmail" type="email" value="${esc(u.email || "")}" ${api.mode === "supabase" ? "disabled" : ""}></label>
      ${api.mode === "demo" ? `<label class="field"><span>Mật khẩu ${u.id ? "(để trống nếu không đổi)" : ""}</span><input id="uPw" type="text"></label>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field"><span>Mã nhân viên</span><input id="uCode" value="${esc(u.employee_code || "")}"></label>
        <label class="field"><span>Ngày vào công ty</span><input id="uJoin" type="date" value="${esc(u.join_date || "")}"></label>
      </div>
      <label class="field"><span>Chức danh</span><input id="uTitle" value="${esc(u.title || "")}" placeholder="Trưởng bộ phận ..."></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field"><span>Cấp bậc nhân sự</span><input id="uLevel" value="${esc(u.hr_level || "")}"></label>
        <label class="field"><span>Nhóm CBNV</span><input id="uGroup" value="${esc(u.staff_group || "")}"></label>
      </div>
      <label class="field"><span>Vai trò</span>${sel([{ v: "head", t: "Trưởng bộ phận" }, { v: "admin", t: "Ban giám đốc (xem & sửa tất cả)" }, { v: "viewer", t: "Chỉ xem" }], u.role || "head", 'id="uRole"')}</label>
      <label class="field"><span>Bộ phận</span>${sel([{ v: "", t: "— Không —" }, ...state.deps.map(d => ({ v: d.id, t: d.name }))], u.department_id || "", 'id="uDep"')}</label>
      <div class="actions"><button class="btn" data-x>Huỷ</button><button class="btn primary" data-ok>Lưu</button></div>`, (m, close) => {
      m.querySelector("[data-x]").onclick = close;
      m.querySelector("[data-ok]").onclick = async () => {
        const v = { id: u.id, full_name: m.querySelector("#uName").value.trim(), email: m.querySelector("#uEmail").value.trim(), password: m.querySelector("#uPw")?.value || "", role: m.querySelector("#uRole").value, department_id: m.querySelector("#uDep").value,
          employee_code: m.querySelector("#uCode").value.trim(), title: m.querySelector("#uTitle").value.trim(), hr_level: m.querySelector("#uLevel").value.trim(), staff_group: m.querySelector("#uGroup").value.trim(), join_date: m.querySelector("#uJoin").value };
        if (v.role === "head" && !v.department_id) return toast("Trưởng bộ phận cần được gán một bộ phận.", true);
        try { await api.saveUser(state.user, v); close(); toast("Đã lưu tài khoản."); route(); } catch (e) { toast(e.message, true); }
      };
    });
    document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => form(users.find(u => u.id === b.dataset.edit)));
    document.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      const u = users.find(x => x.id === b.dataset.del);
      if (!(await confirmBox(`Xoá tài khoản ${esc(u.email)}?`, "Xoá", true))) return;
      try { await api.deleteUser(state.user, u.id); route(); } catch (e) { toast(e.message, true); }
    });
    const nb = document.getElementById("bNewU"); if (nb) nb.onclick = () => form({});
    const rs = document.getElementById("bReset"); if (rs) rs.onclick = async () => { if (await confirmBox("Khôi phục toàn bộ dữ liệu mẫu (xoá dữ liệu hiện tại)?", "Khôi phục", true)) { await api.resetDemo(); state.sheet = null; toast("Đã khôi phục dữ liệu mẫu."); route(); } };
    const cl = document.getElementById("bClear"); if (cl) cl.onclick = async () => { if (await confirmBox("Xoá toàn bộ phiếu OKR của mọi bộ phận?", "Xoá hết", true)) { await api.clearAllSheets(); state.sheet = null; toast("Đã xoá."); route(); } };
  }

  // ============================================================
  //  ĐIỀU HƯỚNG
  // ============================================================
  let prevHash = location.hash;
  async function route() {
    if (!state.user) return renderLogin();
    const r = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?")[0];
    state.route = ["dashboard", "okr", "report", "compare", "users"].includes(r) ? r : "dashboard";
    if (["dashboard", "compare"].includes(state.route) && !P.seesAll(state.user)) { state.route = "okr"; if (location.hash !== "#/okr") { location.hash = "#/okr"; return; } }
    C.destroyAll();
    try {
      if (state.route === "dashboard") await pageDashboard();
      else if (state.route === "okr") await pageOkr();
      else if (state.route === "report") await pageReport();
      else if (state.route === "compare") await pageCompare();
      else if (state.route === "users") await pageUsers();
    } catch (e) { console.error(e); toast("Lỗi: " + e.message, true); }
    prevHash = location.hash;
  }
  window.addEventListener("hashchange", async () => {
    if (state.dirty && prevHash.includes("okr") && !location.hash.includes("okr")) {
      if (!(await confirmBox("Phiếu OKR có thay đổi chưa lưu. Rời trang và bỏ thay đổi?", "Rời trang", true))) { history.replaceState(null, "", prevHash); return; }
      state.dirty = false; state.sheet = null;
    }
    route();
  });
  // Quay lại app (mở lại tab / mở app trên điện thoại) => tải dữ liệu mới nhất của mọi người
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !state.user || state.dirty || state.filePicking || document.querySelector(".modal-bg")) return;
    if (state.route === "okr") state.sheet = null;
    route();
  });
  window.addEventListener("beforeunload", e => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });

  // khởi động
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW", e));
  }
  (async () => {
    try { const t = localStorage.getItem("thm_okr_theme"); if (t) document.documentElement.setAttribute("data-theme", t); } catch (e) {}
    try { state.user = await api.currentUser(); } catch (e) { state.user = null; }
    if (state.user) await afterLogin(); else renderLogin();
  })();
})();
