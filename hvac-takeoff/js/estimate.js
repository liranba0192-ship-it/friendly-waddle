"use strict";
/*
 * App.estimate — Bill of Materials (BOM) + blank quotation matrix + PDF export.
 *
 * Compiles a takeoff from the current project: placed assets are counted per
 * type, and routes are summed (linear meters) per line type — grouped cleanly
 * by material type. The full-screen overlay renders this as a financial matrix
 * with EMPTY unit-price / labor-rate inputs (no pre-filled prices); an input
 * listener multiplies entries by quantities to keep row subtotals and a rolling
 * grand total live. "Export Project PDF" produces a 2-page A4 document:
 *   Page 1 — high-res snapshot of the marked-up blueprint.
 *   Page 2 — a formal quotation table with the entered prices.
 *
 * Hebrew is rendered via html2canvas (browser fonts) rather than jsPDF text,
 * so RTL/Hebrew display correctly; jsPDF hosts the two page images.
 */
window.App = window.App || {};

App.estimate = (function () {
  // entered prices survive overlay re-opens and feed the PDF, keyed by row key.
  const prices = {}; // key -> { unit:Number, labor:Number }
  const el = {};

  function nis(n) {
    return "₪ " + (Math.round(n * 100) / 100).toLocaleString("he-IL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // ---- BOM compilation ----------------------------------------------------
  /** Build grouped rows from the current assets + routes. */
  function buildBOM() {
    const assets = App.state.getAssets();
    const routes = App.state.getRoutes();
    const aDefs = App.routing.getAssetDefs();

    // equipment: count per asset type
    const counts = {};
    assets.forEach((a) => (counts[a.type] = (counts[a.type] || 0) + 1));
    const equip = Object.keys(counts).map((type) => ({
      key: "asset:" + type,
      label: (aDefs[type] && aDefs[type].label) || type,
      color: (aDefs[type] && aDefs[type].color) || "#94a3b8",
      qty: counts[type],
      unit: "יח׳",
    }));

    // piping/ducts: sum meters per line type AND diameter (needs calibration)
    const agg = {}; // key -> { label, color, meters }
    routes.forEach((r) => {
      const m = App.routing.lengthMeters(r);
      if (m == null) return;
      const key = App.routing.routeKey(r);
      if (!agg[key]) {
        agg[key] = {
          key,
          label: App.routing.routeLabel(r),
          color: App.routing.getLineDef(r.lineType).color,
          meters: 0,
        };
      }
      agg[key].meters += m;
    });
    const piping = Object.values(agg).map((g) => ({
      key: g.key,
      label: g.label,
      color: g.color,
      qty: Math.round(g.meters * 100) / 100,
      unit: "מ׳",
    }));

    const groups = [];
    if (equip.length) groups.push({ title: "יחידות מיזוג", rows: equip });
    if (piping.length) groups.push({ title: "צנרת ותעלות", rows: piping });
    return groups;
  }

  function rowTotal(key, qty) {
    const p = prices[key] || { unit: 0, labor: 0 };
    return qty * ((p.unit || 0) + (p.labor || 0));
  }

  // ---- overlay table ------------------------------------------------------
  function open() {
    cache();
    if (!App.state.getActivePage()) {
      App.ui && App.ui.toast && App.ui.toast("טען שרטוט קודם");
      return;
    }
    renderTable();
    el.overlay.classList.add("is-open");
  }
  function close() {
    if (el.overlay) el.overlay.classList.remove("is-open");
  }

  function cache() {
    if (el.overlay) return;
    el.overlay = document.getElementById("estimate-overlay");
    el.body = document.getElementById("estimate-body");
    el.grand = document.getElementById("estimate-grand");
    el.empty = document.getElementById("estimate-empty");
    document.getElementById("estimate-close").addEventListener("click", close);
    document.getElementById("estimate-export").addEventListener("click", exportPDF);
    el.overlay.addEventListener("pointerdown", (e) => {
      if (e.target === el.overlay) close();
    });
  }

  function renderTable() {
    const groups = buildBOM();
    el.body.innerHTML = "";
    const hasRows = groups.some((g) => g.rows.length);
    el.empty.classList.toggle("hidden", hasRows);
    el.grand.closest(".estimate-foot").classList.toggle("hidden", !hasRows);

    groups.forEach((group) => {
      const head = document.createElement("tr");
      head.className = "est-group";
      head.innerHTML = `<td colspan="5">${group.title}</td>`;
      el.body.appendChild(head);

      group.rows.forEach((r) => {
        const p = prices[r.key] || { unit: "", labor: "" };
        const tr = document.createElement("tr");
        tr.dataset.key = r.key;
        tr.dataset.qty = r.qty;
        tr.innerHTML =
          `<td class="est-item"><span class="est-dot" style="background:${r.color}"></span>${escapeHtml(r.label)}</td>` +
          `<td class="est-num">${r.qty} <span class="est-unit">${r.unit}</span></td>` +
          `<td><input class="est-input" type="number" min="0" step="0.01" inputmode="decimal" data-field="unit" placeholder="0.00" value="${p.unit}"></td>` +
          `<td><input class="est-input" type="number" min="0" step="0.01" inputmode="decimal" data-field="labor" placeholder="0.00" value="${p.labor}"></td>` +
          `<td class="est-sub est-num">${nis(rowTotal(r.key, r.qty))}</td>`;
        el.body.appendChild(tr);
      });
    });

    // wire inputs (event delegation)
    el.body.oninput = onPriceInput;
    recompute();
  }

  function onPriceInput(e) {
    const input = e.target;
    if (!input.classList.contains("est-input")) return;
    const tr = input.closest("tr");
    const key = tr.dataset.key;
    const val = parseFloat(input.value);
    prices[key] = prices[key] || { unit: 0, labor: 0 };
    prices[key][input.dataset.field] = isFinite(val) && val >= 0 ? val : 0;
    tr.querySelector(".est-sub").textContent = nis(rowTotal(key, Number(tr.dataset.qty)));
    recompute();
  }

  function recompute() {
    let total = 0;
    el.body.querySelectorAll("tr[data-key]").forEach((tr) => {
      total += rowTotal(tr.dataset.key, Number(tr.dataset.qty));
    });
    el.grand.textContent = nis(total);
    return total;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ---- PDF export ---------------------------------------------------------
  async function captureBlueprint() {
    const canvas = document.getElementById("board");
    const saved = App.viewport.getTransform();
    App.viewport.fitToScreen(); // show the whole plan + overlays
    App.renderer.markDirty();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dataUrl = canvas.toDataURL("image/png");
    const dims = { w: canvas.width, h: canvas.height };
    App.viewport.setTransform(saved); // restore the user's view
    return { dataUrl, dims };
  }

  /** A4-proportioned, white, print-styled page node rendered off-screen. */
  function makePage() {
    const page = document.createElement("div");
    page.className = "pdf-page";
    page.style.cssText =
      "position:fixed;left:-99999px;top:0;width:794px;height:1123px;background:#ffffff;" +
      "color:#0f172a;box-sizing:border-box;padding:48px;font-family:Heebo,Arial,sans-serif;" +
      "direction:rtl;";
    document.body.appendChild(page);
    return page;
  }

  function biz() {
    return (App.business && App.business.get()) || { name: "", phone: "", email: "", logo: "" };
  }

  function pageHeader(subtitle) {
    const today = new Date().toLocaleDateString("he-IL");
    const title = biz().name || "HVAC Takeoff Pro";
    return (
      `<div style="display:flex;justify-content:space-between;align-items:flex-end;` +
      `border-bottom:3px solid #0ea5e9;padding-bottom:14px;margin-bottom:24px;">` +
      `<div><div style="font-size:24px;font-weight:800;color:#0b1220;">${escapeHtml(title)}</div>` +
      `<div style="font-size:14px;color:#64748b;margin-top:2px;">${subtitle}</div></div>` +
      `<div style="text-align:left;font-size:12px;color:#64748b;">` +
      `<div>${escapeHtml(App.state.getFileName() || "פרויקט")}</div><div>${today}</div></div></div>`
    );
  }

  /** Corporate invoice header for page 2: contractor logo (top-right in RTL)
   *  + business details, with the quotation title/date on the left. */
  function quoteHeader() {
    const b = biz();
    const today = new Date().toLocaleDateString("he-IL");
    const logo = b.logo
      ? `<img src="${b.logo}" style="max-height:66px;max-width:170px;object-fit:contain;display:block;">`
      : `<div style="font-size:22px;font-weight:800;color:#0b1220;">${escapeHtml(b.name || "HVAC Takeoff Pro")}</div>`;
    const contactLines = [];
    if (b.logo && b.name) contactLines.push(`<div style="font-size:16px;font-weight:700;color:#0b1220;">${escapeHtml(b.name)}</div>`);
    if (b.phone) contactLines.push(`טלפון: ${escapeHtml(b.phone)}`);
    if (b.email) contactLines.push(`דוא"ל: ${escapeHtml(b.email)}`);
    const contact = contactLines.length
      ? `<div style="font-size:12px;color:#475569;margin-top:4px;line-height:1.7;">${contactLines.join("<br>")}</div>`
      : "";
    return (
      `<div style="display:flex;justify-content:space-between;align-items:flex-start;` +
      `border-bottom:3px solid #0ea5e9;padding-bottom:16px;margin-bottom:22px;">` +
      `<div>${logo}${contact}</div>` +
      `<div style="text-align:left;">` +
      `<div style="font-size:22px;font-weight:800;color:#0ea5e9;">הצעת מחיר</div>` +
      `<div style="font-size:12px;color:#64748b;margin-top:6px;line-height:1.7;">` +
      `${escapeHtml(App.state.getFileName() || "פרויקט")}<br>תאריך: ${today}</div></div></div>`
    );
  }

  async function exportPDF() {
    if (!window.jspdf || !window.html2canvas) {
      App.ui && App.ui.toast && App.ui.toast("ספריות הייצוא לא נטענו (נדרש אינטרנט)");
      return;
    }
    const btn = document.getElementById("estimate-export");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "מ ייצא…";
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const PW = 210, PH = 297, M = 12;

      // ---- Page 1: blueprint snapshot ----
      const shot = await captureBlueprint();
      const p1 = makePage();
      p1.innerHTML =
        pageHeader("תכנית מסומנת — מדידות וניתוב") +
        `<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#0b0f17;">` +
        `<img src="${shot.dataUrl}" style="display:block;width:100%;height:auto;"></div>` +
        `<div style="margin-top:14px;font-size:12px;color:#94a3b8;">קנה מידה: ` +
        `${App.state.isCalibrated() ? Math.round(App.state.getPixelsPerMeter()) + " יח׳ למטר" : "לא מכויל"}</div>`;
      const c1 = await window.html2canvas(p1, { scale: 2, backgroundColor: "#ffffff", logging: false });
      document.body.removeChild(p1);
      doc.addImage(c1.toDataURL("image/png"), "PNG", 0, 0, PW, PH);

      // ---- Page 2: quotation table ----
      doc.addPage();
      const p2 = makePage();
      p2.innerHTML = quoteHeader() + buildQuoteTable();
      const c2 = await window.html2canvas(p2, { scale: 2, backgroundColor: "#ffffff", logging: false });
      document.body.removeChild(p2);
      // fit the table image within margins, preserving aspect ratio
      const availW = PW - M * 2;
      const imgH = (c2.height / c2.width) * availW;
      doc.addImage(c2.toDataURL("image/png"), "PNG", M, M, availW, Math.min(imgH, PH - M * 2));

      const fname = (App.state.getFileName() || "hvac-project").replace(/\.[^.]+$/, "");
      doc.save(fname + "-quote.pdf");
    } catch (err) {
      console.error("PDF export failed:", err);
      App.ui && App.ui.toast && App.ui.toast("ייצוא ה‑PDF נכשל");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  /** Static HTML quotation table for the PDF (quantities + entered prices). */
  function buildQuoteTable() {
    const groups = buildBOM();
    let grand = 0;
    const th =
      "padding:10px 12px;font-size:12px;color:#475569;text-align:right;border-bottom:2px solid #cbd5e1;";
    const td = "padding:9px 12px;font-size:13px;border-bottom:1px solid #eef2f7;";
    let rows = "";
    groups.forEach((g) => {
      rows +=
        `<tr><td colspan="5" style="padding:12px 12px 6px;font-weight:700;font-size:13px;` +
        `color:#0ea5e9;">${escapeHtml(g.title)}</td></tr>`;
      g.rows.forEach((r) => {
        const p = prices[r.key] || { unit: 0, labor: 0 };
        const sub = rowTotal(r.key, r.qty);
        grand += sub;
        rows +=
          `<tr><td style="${td}"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;` +
          `background:${r.color};margin-inline-start:6px;"></span>${escapeHtml(r.label)}</td>` +
          `<td style="${td}text-align:center;">${r.qty} ${r.unit}</td>` +
          `<td style="${td}text-align:center;">${p.unit ? nis(p.unit) : "—"}</td>` +
          `<td style="${td}text-align:center;">${p.labor ? nis(p.labor) : "—"}</td>` +
          `<td style="${td}text-align:left;font-weight:600;">${nis(sub)}</td></tr>`;
      });
    });
    return (
      `<table style="width:100%;border-collapse:collapse;">` +
      `<thead><tr><th style="${th}">פריט</th><th style="${th}text-align:center;">כמות</th>` +
      `<th style="${th}text-align:center;">מחיר יחידה</th><th style="${th}text-align:center;">עלות עבודה</th>` +
      `<th style="${th}text-align:left;">סה"כ</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div style="display:flex;justify-content:flex-start;margin-top:20px;">` +
      `<div style="min-width:260px;background:#f1f5f9;border-radius:10px;padding:14px 18px;` +
      `display:flex;justify-content:space-between;align-items:center;">` +
      `<span style="font-size:15px;font-weight:700;color:#0b1220;">סה"כ כללי</span>` +
      `<span style="font-size:20px;font-weight:800;color:#0ea5e9;">${nis(grand)}</span></div></div>` +
      `<div style="margin-top:28px;font-size:11px;color:#94a3b8;line-height:1.7;">` +
      `המחירים אינם כוללים מע"מ אלא אם צוין אחרת · הצעה זו נוצרה אוטומטית מתוך התכנית המסומנת.</div>`
    );
  }

  return { open, close, exportPDF, buildBOM };
})();
