"use strict";
window.App = window.App || {};

App.briefing = (function () {
  const U = App.util;
  let root, listEl, statusEl, freshEl, articleEl, backBtn, inArticle = false, loadSeq = 0;

  function daysAgo(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const then = Date.UTC(y, m - 1, d);
    const n = new Date();
    const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((today - then) / 86400000);
  }

  function html() {
    return `
      <div id="brf-list">
        <div id="brf-fresh" class="briefing-fresh" hidden></div>
        <p id="brf-status" class="status">טוען תדריכים…</p>
        <ul id="brf-items" class="briefing-list"></ul>
      </div>
      <article id="brf-article" class="article" hidden></article>
      <button id="brf-back" class="btn-secondary" hidden>‹ חזרה לרשימה</button>
    `;
  }

  function mount(el) {
    root = el;
    root.innerHTML = html();
    listEl = root.querySelector("#brf-items");
    statusEl = root.querySelector("#brf-status");
    freshEl = root.querySelector("#brf-fresh");
    articleEl = root.querySelector("#brf-article");
    backBtn = root.querySelector("#brf-back");
    backBtn.addEventListener("click", showList);
    load();
  }

  function show() {
    // נקרא בכל מעבר לטאב — רענון רשימה אם לא בתוך מאמר
    if (!inArticle) load();
  }

  async function load() {
    const seq = ++loadSeq;             // מזהה ייחודי לטעינה הנוכחית
    statusEl.hidden = false;
    statusEl.textContent = "טוען תדריכים…";
    try {
      const res = await fetch(`../briefings/index.json?ts=${Date.now()}`, { cache: "no-cache" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (seq !== loadSeq) return;     // טעינה חדשה יותר התחילה — בטל את הישנה
      const items = (data.briefings || []).slice().sort((a, b) => b.date.localeCompare(a.date));
      renderList(items);
    } catch {
      if (seq === loadSeq) empty();
    }
  }

  function empty() {
    listEl.innerHTML = "";
    if (freshEl) freshEl.hidden = true;
    statusEl.hidden = false;
    statusEl.innerHTML = "עדיין אין תדריכים 📭<br><small>התדריך הראשון ייווצר בהרצת הבוקר הבאה.</small>";
  }

  function renderList(items) {
    listEl.innerHTML = "";             // ניקוי סינכרוני ממש לפני ההוספה (מונע כפילויות)
    if (!items.length) return empty();
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
    for (const item of items) {
      const li = document.createElement("li");
      const card = document.createElement("button");
      card.className = "briefing-card" + (item.date === today ? " today" : "");
      card.innerHTML = `
        <div class="date-row">
          <span>${U.prettyDate(item.date)}${item.date === today ? " · היום" : ""}</span>
          <span class="day-badge">יום ${U.dayName(item.date)}</span>
        </div>
        <h2>${U.esc(item.title || "תדריך יומי")}</h2>`;
      card.addEventListener("click", () => open(item));
      li.appendChild(card);
      frag.appendChild(li);
    }
    listEl.appendChild(frag);
  }

  async function open(item) {
    inArticle = true;
    root.querySelector("#brf-list").hidden = true;
    articleEl.hidden = false;
    backBtn.hidden = false;
    articleEl.innerHTML = `<p class="status">טוען…</p>`;
    window.scrollTo(0, 0);
    try {
      const res = await fetch(`../briefings/${item.file}?ts=${Date.now()}`, { cache: "no-cache" });
      if (!res.ok) throw new Error();
      const md = await res.text();
      articleEl.innerHTML = window.marked.parse(md);
      articleEl.querySelectorAll("a[href^='http']").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      });
    } catch {
      articleEl.innerHTML = `<p class="status">לא ניתן לטעון את התדריך 😕</p>`;
    }
  }

  function showList() {
    inArticle = false;
    root.querySelector("#brf-list").hidden = false;
    articleEl.hidden = true;
    backBtn.hidden = true;
    window.scrollTo(0, 0);
  }

  return { mount, show };
})();
