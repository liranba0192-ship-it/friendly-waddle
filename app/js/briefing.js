"use strict";
window.App = window.App || {};

App.briefing = (function () {
  const U = App.util, S = App.store, I = App.icon;
  let root, segEl, listEl, statusEl, freshEl, articleEl, backBtn, closeFab, inArticle = false, loadSeq = 0;
  let section = "fitness";           // fitness | gk
  let gkLessons = [], fitnessItems = [];

  function daysAgo(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const then = Date.UTC(y, m - 1, d);
    const n = new Date();
    const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((today - then) / 86400000);
  }
  function dayDiff(a, b) { return daysAgo(a) - daysAgo(b); } // כמה ימים b אחרי a
  function readSet() { return S.get("briefing.read", []); }
  function isRead(date) { return readSet().includes(date); }
  function markRead(date) { const r = readSet(); if (!r.includes(date)) { r.push(date); S.set("briefing.read", r); } }
  function streakOf(items) { // רצף ימים רצופים מהחדש לאחור
    if (!items.length) return 0;
    let s = 1;
    for (let i = 1; i < items.length; i++) {
      if (dayDiff(items[i].date, items[i - 1].date) === 1) s++; else break;
    }
    return s;
  }

  function html() {
    return `
      <div id="brf-list">
        <div class="seg" id="brf-seg" role="tablist" aria-label="סוג תוכן" style="margin-bottom:12px">
          <button role="tab" data-sec="fitness">תדריך בוקר</button>
          <button role="tab" data-sec="gk">ידע כללי</button>
        </div>
        <p id="brf-fresh" class="lbl" style="margin:0 4px 10px" hidden></p>
        <p id="brf-status" class="status">טוען…</p>
        <div id="brf-items" class="stack"></div>
      </div>
      <button id="brf-back" class="btn btn-t" hidden style="padding:0 4px">${I("back", 20)}לכל התדריכים</button>
      <article id="brf-article" class="article" hidden></article>
      <button id="brf-close-fab" class="close-fab" hidden aria-label="סגור וחזור לרשימה">${I("x", 22)}</button>
    `;
  }

  function mount(el) {
    root = el;
    root.innerHTML = html();
    segEl = root.querySelector("#brf-seg");
    listEl = root.querySelector("#brf-items");
    statusEl = root.querySelector("#brf-status");
    freshEl = root.querySelector("#brf-fresh");
    articleEl = root.querySelector("#brf-article");
    backBtn = root.querySelector("#brf-back");
    closeFab = root.querySelector("#brf-close-fab");
    backBtn.addEventListener("click", showList);
    closeFab.addEventListener("click", showList);
    segEl.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { section = b.dataset.sec; renderSeg(); renderCurrent(); })
    );
    renderSeg();
    load();
  }

  function show() {
    // נקרא בכל מעבר לטאב — רענון רשימה אם לא בתוך מאמר
    if (!inArticle) load();
  }

  function renderSeg() {
    segEl.querySelectorAll("button").forEach((b) => { const on = b.dataset.sec === section; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  }

  async function load() {
    const seq = ++loadSeq;             // מזהה ייחודי לטעינה הנוכחית
    statusEl.hidden = false;
    statusEl.textContent = "טוען…";
    try {
      const g = await fetch(`data/general-knowledge.json?ts=${Date.now()}`, { cache: "no-cache" }).then((r) => r.json());
      if (seq !== loadSeq) return;
      gkLessons = g.lessons || [];
    } catch { gkLessons = []; }
    try {
      const res = await fetch(`../briefings/index.json?ts=${Date.now()}`, { cache: "no-cache" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (seq !== loadSeq) return;     // טעינה חדשה יותר התחילה — בטל את הישנה
      fitnessItems = (data.briefings || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      if (seq === loadSeq) fitnessItems = [];
    }
    if (seq === loadSeq) renderCurrent();
  }

  function renderCurrent() {
    if (section === "gk") renderGKList(); else renderFitnessList();
  }

  function empty(msg) {
    listEl.innerHTML = "";
    if (freshEl) freshEl.hidden = true;
    statusEl.hidden = false;
    statusEl.innerHTML = msg;
  }

  function renderFitnessList() {
    const items = fitnessItems;
    listEl.innerHTML = "";
    if (!items.length) return empty("עדיין אין תדריכים.<br><small>התדריך הראשון ייווצר בהרצת הבוקר הבאה.</small>");
    statusEl.hidden = true;
    const d = daysAgo(items[0].date);
    freshEl.hidden = false;
    freshEl.textContent = d <= 0 ? "התדריך מעודכן להיום" : d === 1 ? "התדריך האחרון: אתמול" : `התדריך האחרון לפני ${d} ימים — ייתכן שהשגרה לא רצה`;
    freshEl.style.color = d > 1 ? "var(--danger)" : "";
    const today = U.todayISO();
    const parts = (it) => (it.title || "תדריך יומי").split("·").map((x) => x.trim()).filter(Boolean);
    const [top, ...rest] = items;
    const tp = parts(top);
    const st = streakOf(items);
    const gk = gkLessons.length ? gkLessons[gkLessons.length - 1] : null;
    const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
    listEl.innerHTML = `
      <article class="hero" style="padding:20px;display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${top.date === today ? `<span class="tag hot">היום</span>` : ""}
          <span class="lbl">${U.dayName(top.date)} ${U.prettyDate(top.date).replace(/\.\d{4}$/, "")} · 4 דק׳ קריאה${isRead(top.date) ? " · נקרא" : ""}</span>
        </div>
        <h2 class="t1" style="font-size:24px">${U.esc(tp[0])}</h2>
        ${tp.length > 1 ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${tp.slice(1).map((x) => `<span class="tag">${U.esc(x)}</span>`).join("")}</div>` : ""}
        <button class="btn btn-p" data-open="${top.date}">${isRead(top.date) ? "קרא שוב" : "קרא את התדריך"}</button>
      </article>
      ${gk ? `<button class="card row-card" data-gk>
        <div class="itile">${I("book")}</div>
        <div class="grow"><span class="lbl">ידע כללי · ~3 דק׳</span><span style="font-weight:600">${U.esc(gk.title)}</span></div>
        <span class="chev">${I("chev")}</span></button>` : ""}
      <section class="card list-group">
        <button class="list-row" data-remind><div class="itile">${I("bell")}</div>
          <span class="grow"><span style="font-weight:600">תזכורת לימוד</span><span class="lbl">${st >= 2 ? `רצף של ${st} ימים — ` : ""}קבע שעה ביומן</span></span><span class="chev">${I("chev")}</span></button>
      </section>
      ${rest.length ? `<h2 class="sec-title">תדריכים קודמים</h2>
      <section class="card list-group">${rest.map((it) => {
        const p = parts(it), [, m, dd] = it.date.split("-").map(Number);
        return `<button class="list-row" data-open="${it.date}">
          <div class="date-chip"><span class="num" style="font-size:20px">${dd}</span><span class="lbl" style="font-size:11px">${MONTHS[m - 1]}</span></div>
          <span class="grow"><span style="font-weight:600">${U.esc(p[0])}</span><span class="lbl">${U.esc(p.slice(1).join(" · ") || "תדריך בוקר")}${isRead(it.date) ? " · נקרא" : ""}</span></span>
          <span class="chev">${I("chev")}</span></button>`;
      }).join("")}</section>` : ""}`;
    listEl.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => open(items.find((x) => x.date === b.dataset.open))));
    const g = listEl.querySelector("[data-gk]");
    if (g) g.addEventListener("click", () => openGK(gk));
    listEl.querySelector("[data-remind]").addEventListener("click", () => App.openSettings && App.openSettings());
  }

  function renderGKList() {
    const items = gkLessons.slice().reverse();
    listEl.innerHTML = "";
    if (!items.length) return empty("עדיין אין נושאי ידע כללי.<br><small>הנושא הראשון יגיע עם ההרצה הבאה של השגרה היומית.</small>");
    statusEl.hidden = true;
    freshEl.hidden = false;
    freshEl.style.color = "";
    freshEl.textContent = `${items.length} נושאים עד כה`;
    listEl.innerHTML = `<section class="card list-group">${items.map((gk, i) => `
      <button class="list-row" data-i="${i}"><div class="itile">${I("book")}</div>
        <span class="grow"><span style="font-weight:600">${U.esc(gk.title)}</span>${gk.tip ? `<span class="lbl">${U.esc(gk.tip)}</span>` : ""}</span>
        ${i === 0 ? `<span class="tag hot">חדש</span>` : `<span class="chev">${I("chev")}</span>`}</button>`).join("")}</section>`;
    listEl.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => openGK(items[+b.dataset.i])));
  }

  async function open(item) {
    inArticle = true;
    markRead(item.date);
    root.querySelector("#brf-list").hidden = true;
    articleEl.hidden = false;
    backBtn.hidden = false;
    closeFab.hidden = false;
    articleEl.innerHTML = `<p class="status">טוען…</p>`;
    window.scrollTo(0, 0);
    try {
      const res = await fetch(`../briefings/${item.file}?ts=${Date.now()}`, { cache: "no-cache" });
      if (!res.ok) throw new Error();
      const md = await res.text();
      articleEl.innerHTML = window.marked.parse(md) + `
        <div class="card-block">
          <button id="brf-nblm" class="btn btn-s full">פתח ב-NotebookLM (שמע, סיכום, מפת חשיבה)</button>
          <p class="section-hint" id="brf-nblm-hint" style="margin-top:8px"></p>
        </div>`;
      articleEl.querySelectorAll("a[href^='http']").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      });
      articleEl.querySelector("#brf-nblm").addEventListener("click", () =>
        openInNotebookLM(md, `תדריך בוקר — ${U.prettyDate(item.date)}`, "#brf-nblm-hint")
      );
    } catch {
      articleEl.innerHTML = `<p class="status">לא ניתן לטעון את התדריך 😕</p>`;
    }
  }

  // נושא ידע כללי — אותה תצוגת מאמר, בלי מעקב "נקרא" (זה לא מגיע מ-briefings/index.json)
  function openGK(gk) {
    inArticle = true;
    root.querySelector("#brf-list").hidden = true;
    articleEl.hidden = false;
    backBtn.hidden = false;
    closeFab.hidden = false;
    window.scrollTo(0, 0);
    const body = window.marked ? window.marked.parse(gk.md) : `<pre>${U.esc(gk.md)}</pre>`;
    articleEl.innerHTML = `<h2 class="view-h2">${U.esc(gk.title)}</h2>` + body + `
      <div class="card-block">
        <button id="brf-nblm" class="btn btn-s full">פתח ב-NotebookLM (שמע, סיכום, מפת חשיבה)</button>
        <p class="section-hint" id="brf-nblm-hint" style="margin-top:8px"></p>
      </div>`;
    articleEl.querySelectorAll("a[href^='http']").forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
    articleEl.querySelector("#brf-nblm").addEventListener("click", () =>
      openInNotebookLM(gk.md, gk.title, "#brf-nblm-hint")
    );
  }

  // מעתיק טקסט ללוח ופותח את NotebookLM בכרטיסייה חדשה — אין API רשמי
  // שמעביר תוכן אוטומטית, אז השלב האחרון (הדבקה) נשאר ידני.
  async function openInNotebookLM(md, label, hintSel) {
    const hint = articleEl.querySelector(hintSel);
    let copied = false;
    try {
      await navigator.clipboard.writeText(`${label}\n\n${md}`);
      copied = true;
    } catch {}
    window.open("https://notebooklm.google.com/", "_blank", "noopener");
    if (hint) {
      hint.innerHTML = copied
        ? `הטקסט הועתק ללוח ✅ ב-NotebookLM: <b>+ Add source → Paste text</b> → הדבק (Cmd/Ctrl+V) → Insert. אז תוכל לבחור <b>Audio Overview</b> (שמע), סיכום או מפת חשיבה.`
        : `לא הצלחנו להעתיק אוטומטית — פתח את NotebookLM והדבק את התוכן ידנית.`;
    }
  }

  function showList() {
    inArticle = false;
    root.querySelector("#brf-list").hidden = false;
    articleEl.hidden = true;
    backBtn.hidden = true;
    closeFab.hidden = true;
    window.scrollTo(0, 0);
    renderCurrent(); // רענון סינכרוני כדי שתג "נקרא" יתעדכן (ללא fetch מחדש)
  }

  return { mount, show, openItem: (item) => open(item), showList, isHome: () => !inArticle };
})();
