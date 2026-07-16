"use strict";
window.App = window.App || {};

App.briefing = (function () {
  const U = App.util, S = App.store;
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
      <div class="seg" id="brf-seg">
        <button data-sec="fitness">💪 כושר ותזונה</button>
        <button data-sec="gk">🧠 ידע כללי</button>
      </div>
      <div id="brf-list">
        <div id="brf-fresh" class="briefing-fresh" hidden></div>
        <p id="brf-status" class="status">טוען…</p>
        <ul id="brf-items" class="briefing-list"></ul>
      </div>
      <article id="brf-article" class="article" hidden></article>
      <button id="brf-back" class="btn-secondary" hidden>‹ חזרה לרשימה</button>
      <button id="brf-close-fab" class="close-fab" hidden aria-label="סגור וחזור לרשימה">✕</button>
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
    segEl.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.sec === section));
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
    listEl.innerHTML = "";             // ניקוי סינכרוני ממש לפני ההוספה (מונע כפילויות)
    if (!items.length) return empty("עדיין אין תדריכים 📭<br><small>התדריך הראשון ייווצר בהרצת הבוקר הבאה.</small>");
    statusEl.hidden = true;

    // חיווי טריות — מתי נוצר התדריך האחרון
    const d = daysAgo(items[0].date);
    let txt, stale = false;
    if (d <= 0) txt = "✅ התדריך מעודכן להיום";
    else if (d === 1) txt = "🕒 התדריך האחרון: אתמול";
    else { txt = `⚠️ התדריך האחרון לפני ${d} ימים — ייתכן שהשגרה לא רצה`; stale = true; }
    freshEl.hidden = false;
    freshEl.className = "briefing-fresh" + (stale ? " stale" : "");
    freshEl.textContent = txt;

    const today = U.todayISO();
    const frag = document.createDocumentFragment();

    // כפתור הצעת תזכורת
    const cta = document.createElement("li");
    cta.innerHTML = `<button class="cta-reminder">🔔 קבל תזכורת ללימוד כל בוקר — להגדרה</button>`;
    cta.querySelector("button").addEventListener("click", () => App.openSettings && App.openSettings());
    frag.appendChild(cta);

    // רצף למידה
    const st = streakOf(items);
    if (st >= 2) {
      const li = document.createElement("li");
      li.innerHTML = `<div class="brf-streak">🔥 רצף למידה: ${st} ימים ברצף!</div>`;
      frag.appendChild(li);
    }

    for (const item of items) {
      const li = document.createElement("li");
      const card = document.createElement("button");
      card.className = "briefing-card" + (item.date === today ? " today" : "");
      const tags = (item.title || "").split("·").map((t) => t.trim()).filter(Boolean).slice(0, 3)
        .map((t) => `<span class="brf-tag">${U.esc(t)}</span>`).join("");
      const badge = isRead(item.date)
        ? `<span class="brf-tag brf-read">✓ נקרא</span>`
        : `<span class="brf-tag brf-new">🆕 חדש</span>`;
      card.innerHTML = `
        <div class="date-row">
          <span>${U.prettyDate(item.date)}${item.date === today ? " · היום" : ""} · ⏱️ ~7 דק'</span>
          ${badge}
        </div>
        <h2>${U.esc(item.title || "תדריך יומי")}</h2>
        <div class="brf-tags">${tags}<span class="brf-tag">יום ${U.dayName(item.date)}</span></div>`;
      card.addEventListener("click", () => open(item));
      li.appendChild(card);
      frag.appendChild(li);
    }
    listEl.appendChild(frag);
  }

  function renderGKList() {
    const items = gkLessons.slice().reverse(); // החדש ביותר קודם
    listEl.innerHTML = "";
    if (!items.length) return empty("עדיין אין נושאי ידע כללי 🧠<br><small>הנושא הראשון יגיע עם ההרצה הבאה של השגרה היומית.</small>");
    statusEl.hidden = true;
    freshEl.hidden = false;
    freshEl.className = "briefing-fresh";
    freshEl.textContent = `📚 ${items.length} נושא${items.length === 1 ? "" : "ים"} שנלמדו עד כה`;

    const frag = document.createDocumentFragment();
    items.forEach((gk, i) => {
      const li = document.createElement("li");
      const card = document.createElement("button");
      card.className = "briefing-card gk-card" + (i === 0 ? " today" : "");
      card.innerHTML = `
        <div class="date-row"><span>🧠 ידע כללי · ⏱️ ~3 דק'</span>${i === 0 ? `<span class="brf-tag brf-new">חדש</span>` : ""}</div>
        <h2>${U.esc(gk.icon || "🧠")} ${U.esc(gk.title)}</h2>
        <div class="brf-tags"><span class="brf-tag">${U.esc(gk.tip || "")}</span></div>`;
      card.addEventListener("click", () => openGK(gk));
      li.appendChild(card);
      frag.appendChild(li);
    });
    listEl.appendChild(frag);
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
          <button id="brf-nblm" class="btn-secondary full">📓 פתח ב-NotebookLM (שמע/סיכום/מפת חשיבה)</button>
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
    articleEl.innerHTML = `<h2 class="view-h2">${U.esc(gk.icon || "🧠")} ${U.esc(gk.title)}</h2>` + body + `
      <div class="card-block">
        <button id="brf-nblm" class="btn-secondary full">📓 פתח ב-NotebookLM (שמע/סיכום/מפת חשיבה)</button>
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

  return { mount, show, isHome: () => !inArticle };
})();
