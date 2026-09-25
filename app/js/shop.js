"use strict";
window.App = window.App || {};

// טאב חנות: רשימת מוצרי חלבונינץ מתוך הקטלוג של האתר (products.js — מקור אמת אחד למחירים ולמלאי).
// לחיצה על מוצר פותחת את האתר עם ?src=app — שמפעיל שם 5% הנחת מנוי בקופה.
App.shop = (function () {
  const U = App.util, I = App.icon;
  const SITE = "https://halbonintz.com/";
  const SHOP_URL = SITE + "?src=app";
  const ICON = { bars: "bolt", powder: "dumbbell", creatine: "capsule", preworkout: "flame", iso: "drop", shaker: "shaker", caffeine: "capsule" };
  let root, cat = "הכל", catalog = null, state = "loading";

  function loadCatalog() {
    if (window.HALBONINTZ) return Promise.resolve(window.HALBONINTZ);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${SITE}products.js?ts=${Math.floor(Date.now() / 3600000)}`;
      s.onload = () => (window.HALBONINTZ ? resolve(window.HALBONINTZ) : reject(new Error("no catalog")));
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function mount(el) {
    root = el;
    render();
    loadCatalog()
      .then((c) => { catalog = c; state = "ready"; render(); })
      .catch(() => { state = "error"; render(); });
  }
  function show() {}

  function inStock(p, stock) {
    const s = stock ? stock[p.id] : undefined;
    if (s == null) return true;
    if (typeof s === "number") return s > 0;
    const vals = [];
    (function walk(o) { for (const v of Object.values(o)) typeof v === "number" ? vals.push(v) : walk(v); })(s);
    return vals.some((v) => v > 0);
  }
  function priceOf(p) {
    if (p.sizeVariants && p.sizeVariants.length) return { from: true, value: Math.min(...p.sizeVariants.map((v) => v.price)) };
    return { from: false, value: p.price };
  }
  function fmt(n) { return `${Number(n).toLocaleString("he-IL")} ₪`; }

  function render() {
    const products = (catalog && catalog.products) || [];
    const cats = ["הכל", ...Array.from(new Set(products.map((p) => p.cat).filter(Boolean)))];
    const list = products.filter((p) => cat === "הכל" || p.cat === cat);

    let body;
    if (state === "loading") body = `<p class="status">טוען את המוצרים…</p>`;
    else if (state === "error" || !products.length) body = `
      <section class="card stack-card" style="align-items:center;text-align:center">
        <div class="itile lg">${I("bag")}</div>
        <h2 class="t3">לא הצלחנו לטעון את המוצרים</h2>
        <p class="lbl" style="margin:0">אין חיבור לאינטרנט, או שהחנות לא זמינה כרגע.</p>
        <a class="btn btn-p full" href="${SHOP_URL}" target="_blank" rel="noopener">${I("ext", 20)}פתח את החנות</a>
      </section>`;
    else body = `
      <div class="chips scroll" role="group" aria-label="קטגוריות">
        ${cats.map((c) => `<button class="chip${c === cat ? " on" : ""}" data-cat="${U.esc(c)}" aria-pressed="${c === cat}">${U.esc(c)}</button>`).join("")}
      </div>
      <div class="prod-grid">
        ${list.map((p) => {
          const pr = priceOf(p), ok = inStock(p, catalog.stock);
          return `<a class="card prod${ok ? "" : " out"}" href="${SHOP_URL}" target="_blank" rel="noopener" aria-label="${U.esc(p.name)} — ${pr.from ? "החל מ-" : ""}${fmt(pr.value)}${ok ? "" : " — אזל מהמלאי"} (נפתח באתר החנות)">
            ${ok ? "" : `<span class="tag badge">אזל</span>`}
            <div class="pic">${I(ICON[p.id] || "bag", 40)}</div>
            <span class="name">${U.esc(p.name)}</span>
            <span class="sub">${U.esc(p.tag || "")}</span>
            <span class="price">${pr.from ? `<span class="lbl">החל מ-</span>` : ""}${fmt(pr.value)}</span>
          </a>`;
        }).join("")}
      </div>
      <a class="btn btn-s full" href="${SHOP_URL}" target="_blank" rel="noopener" style="margin-top:4px">${I("ext", 20)}פתח את halbonintz.com</a>
      <p class="shop-foot">המחירים באתר הם המחירים הקובעים. ההנחה למנויים (5%) מחושבת בעגלה באתר. התשלום ב-Bit או במזומן באיסוף, בתשלום אחד.</p>`;

    root.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <section class="hero shop-brand">
          <span class="brand">חלבו<span>נינץ</span></span>
          <span class="lbl" style="font-size:15px">דלק אמיתי. שיא אמיתי.</span>
          <span class="perk">${I("gift", 16)}5% הנחת מנויים מוחלת אוטומטית בקופה</span>
        </section>
        ${body}
      </div>`;
    root.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; render(); }));
  }

  return { mount, show, isHome: () => true };
})();
