"use strict";
window.App = window.App || {};

/* סורק ברקוד למוצרים: מצלמה (ZXing) + חיפוש ב-Open Food Facts. */
App.scanner = (function () {
  const U = App.util;
  let overlay, video, statusEl, retryBtn, reader, onFound, busy = false, libLoading = null;

  function loadLib() {
    if (window.ZXing) return Promise.resolve();
    if (libLoading) return libLoading;
    libLoading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "vendor/zxing.min.js";
      s.onload = res; s.onerror = () => rej(new Error("load failed"));
      document.head.appendChild(s);
    });
    return libLoading;
  }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "scan-overlay";
    overlay.innerHTML = `
      <div class="scan-top">
        <button id="scan-close" class="scan-close">✕ סגור</button>
        <span class="scan-title">📷 סריקת ברקוד</span>
        <span style="width:60px"></span>
      </div>
      <div class="scan-video-wrap">
        <video id="scan-video" playsinline muted autoplay></video>
        <div class="scan-frame"></div>
      </div>
      <p id="scan-status" class="scan-status">מכוון את הברקוד למסגרת…</p>
      <button id="scan-retry" class="btn-primary" hidden>סרוק שוב</button>`;
    document.body.appendChild(overlay);
    video = overlay.querySelector("#scan-video");
    statusEl = overlay.querySelector("#scan-status");
    retryBtn = overlay.querySelector("#scan-retry");
    overlay.querySelector("#scan-close").addEventListener("click", close);
    retryBtn.addEventListener("click", () => { retryBtn.hidden = true; busy = false; start(); });
  }

  function setStatus(t) { if (statusEl) statusEl.textContent = t; }

  async function open(cb) {
    onFound = cb; busy = false;
    if (!overlay) build();
    overlay.hidden = false;
    retryBtn.hidden = true;
    setStatus("טוען סורק…");
    try { await loadLib(); } catch { setStatus("לא ניתן לטעון את הסורק 😕"); return; }
    start();
  }

  async function start() {
    setStatus("מבקש גישה למצלמה…");
    try {
      reader = new window.ZXing.BrowserMultiFormatReader();
      await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        video,
        (result) => { if (result && !busy) handle(result.getText()); }
      );
      setStatus("מכוון את הברקוד למסגרת…");
    } catch {
      setStatus("אין גישה למצלמה. אפשר את ההרשאה ונסה שוב.");
      retryBtn.hidden = false;
    }
  }

  function stop() { try { reader && reader.reset(); } catch {} }
  function close() { stop(); if (overlay) overlay.hidden = true; }

  async function handle(code) {
    busy = true; stop();
    // 1) חיפוש מהיר במאגר המקומי — נמצא מיידית גם בלי אינטרנט
    if (App.food && App.food.findByBarcode) {
      const local = App.food.findByBarcode(code);
      if (local) { setStatus(`נמצא: ${local.name} ✅`); close(); onFound && onFound(local); return; }
    }
    setStatus(`מחפש מוצר (${code})…`);
    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_he,brands,nutriments`;
      const r = await fetch(url);
      const j = await r.json();
      const p = j && j.product;
      if (!p || j.status === 0) {
        setStatus(`המוצר (${code}) לא נמצא במאגר 🤷 אפשר להוסיף ידנית בכפתור "הוסף מאכל משלי".`);
        retryBtn.hidden = false;
        return;
      }
      const n = p.nutriments || {};
      let kcal = n["energy-kcal_100g"];
      if (kcal == null && n["energy_100g"] != null) kcal = n["energy_100g"] / 4.184;
      const name = (p.product_name_he || p.product_name || ((p.brands ? p.brands + " " : "") + "מוצר " + code)).trim();
      const food = {
        name, cat: "סרוק", barcode: code,
        kcal: Math.round(kcal || 0),
        protein: U.round(n["proteins_100g"] || 0),
        carbs: U.round(n["carbohydrates_100g"] || 0),
        fat: U.round(n["fat_100g"] || 0),
      };
      close();
      onFound && onFound(food);
    } catch {
      setStatus("שגיאת רשת — בדוק חיבור ונסה שוב.");
      retryBtn.hidden = false;
    }
  }

  return { open };
})();
