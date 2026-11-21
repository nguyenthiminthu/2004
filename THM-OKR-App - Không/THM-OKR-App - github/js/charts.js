// ============================================================
//  BIỂU ĐỒ (Chart.js) – màu lấy từ biến CSS, hỗ trợ sáng/tối
// ============================================================
(function () {
  const registry = new Map();
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function wrapLabel(s, max = 12) {
    if (Array.isArray(s) || String(s).length <= max) return s;
    const words = String(s).split(" "); const lines = []; let cur = "";
    words.forEach(w => { if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
    if (cur) lines.push(cur);
    return lines;
  }

  // Tooltip HTML bám theo con trỏ
  function externalTooltip(fmt) {
    return (ctx) => {
      const { chart, tooltip } = ctx;
      const host = chart.canvas.parentNode;
      let el = host.querySelector(".tt");
      if (!el) { el = document.createElement("div"); el.className = "tt"; host.appendChild(el); }
      if (tooltip.opacity === 0) { el.style.opacity = 0; return; }
      const title = (tooltip.title || []).join(" ");
      const rows = (tooltip.dataPoints || []).map(dp => {
        const color = dp.dataset.backgroundColor;
        const v = dp.raw;
        return `<div class="r"><i style="background:${Array.isArray(color) ? color[dp.dataIndex] : color}"></i>${dp.dataset.label || ""}<b>${fmt(v, dp)}</b></div>`;
      }).join("");
      el.innerHTML = `<div class="t">${title}</div>${rows}`;
      el.style.opacity = 1;
      const x = tooltip.caretX, y = tooltip.caretY;
      const w = el.offsetWidth, hw = host.clientWidth;
      el.style.left = Math.min(Math.max(0, x - w / 2), hw - w) + "px";
      el.style.top = Math.max(0, y - el.offsetHeight - 12) + "px";
    };
  }

  // Ghi giá trị trên đỉnh cột (chỉ dùng khi 1 chuỗi dữ liệu)
  const valueLabels = {
    id: "valueLabels",
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.enabled) return;
      const { ctx } = chart;
      ctx.save();
      ctx.font = "600 11px 'Segoe UI', Roboto, Arial, sans-serif";
      ctx.fillStyle = css("--text-secondary");
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((bar, i) => {
          const v = ds.data[i];
          if (v == null) return;
          if (opts.horiz) { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(opts.format ? opts.format(v) : v, bar.x + 4, bar.y); }
          else ctx.fillText(opts.format ? opts.format(v) : v, bar.x, bar.y - 4);
        });
      });
      ctx.restore();
    }
  };

  function bar(canvas, cfg) {
    const old = registry.get(canvas.id); if (old) old.destroy();
    const fmt = cfg.format || ((v) => v == null ? "—" : v.toFixed(1) + "%");
    const single = cfg.datasets.length === 1;
    const dmax = Math.max(0, ...cfg.datasets.flatMap(d => d.data.filter(v => v != null)));
    const yMax = cfg.yMax ?? Math.max(100, Math.ceil((dmax + (single ? 8 : 0)) / 20) * 20);
    const horiz = !!cfg.horizontalOnNarrow && canvas.parentNode.clientWidth < 560;
    canvas.parentNode.style.height = horiz ? (cfg.labels.length * 30 + 40) + "px" : "";
    const catAxis = { grid: { display: false }, border: { color: css("--border") }, ticks: { color: css("--text-secondary"), font: { size: 11 }, autoSkip: false, maxRotation: 0 } };
    const valAxis = {
      min: 0, max: yMax, grid: { color: css("--grid"), drawTicks: false }, border: { display: false },
      ticks: { color: css("--text-muted"), padding: 6, stepSize: cfg.step ?? 20, callback: (v) => v + (cfg.unit ?? "%") }
    };
    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: horiz ? cfg.labels : cfg.labels.map(l => wrapLabel(l, cfg.wrap || 9)),
        datasets: cfg.datasets.map(d => ({
          label: d.label,
          data: d.data,
          backgroundColor: d.colors || css(d.colorVar || "--series-1"),
          hoverBackgroundColor: d.colors || css(d.colorVar || "--series-1"),
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: single ? 44 : 22,
          categoryPercentage: single ? 0.72 : 0.78,
          barPercentage: single ? 0.9 : 0.82,
          borderWidth: single ? 0 : { top: 0, left: 1, right: 1, bottom: 0 },
          borderColor: css("--surface-1")
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 250 },
        indexAxis: horiz ? "y" : "x",
        layout: { padding: horiz ? { right: 36 } : { top: single && cfg.valueLabels !== false ? 18 : 6 } },
        interaction: { mode: single ? "nearest" : "index", intersect: false, axis: horiz ? "y" : "x" },
        onClick: cfg.onClick ? (e, els) => { if (els.length) cfg.onClick(els[0].index); } : undefined,
        onHover: cfg.onClick ? (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; } : undefined,
        scales: horiz ? { y: catAxis, x: valAxis } : { x: catAxis, y: valAxis },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, external: externalTooltip(fmt) },
          valueLabels: { enabled: single && cfg.valueLabels !== false, horiz, format: (v) => v.toFixed(1) }
        }
      },
      plugins: [valueLabels]
    });
    registry.set(canvas.id, chart);
    return chart;
  }

  function destroyAll() { registry.forEach(c => c.destroy()); registry.clear(); }

  // Màu theo thang tuần tự (1 sắc xanh, nhạt → đậm) cho bảng nhiệt
  function seqColor(score) {
    if (score == null) return { bg: "transparent", fg: css("--text-muted") };
    const steps = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6"];
    const idx = score >= 95 ? 5 : score >= 90 ? 4 : score >= 80 ? 3 : score >= 70 ? 2 : score >= 60 ? 1 : 0;
    const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
    const lightText = dark ? idx <= 3 : idx >= 3;
    return { bg: css(steps[idx]), fg: lightText ? "#ffffff" : "#0b0b0b" };
  }

  window.OKRCharts = { bar, destroyAll, seqColor, css };
})();
