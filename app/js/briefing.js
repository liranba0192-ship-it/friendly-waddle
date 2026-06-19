"use strict";
window.App = window.App || {};

App.briefing = (function () {
  const U = App.util;
  let root, listEl, statusEl, articleEl, backBtn, inArticle = false;

  function html() {
    return `
      <div id="brf-list">
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
    statusEl.hidden = false;
    statusEl.textContent = "טוען תדריכים…";
    listEl.innerHTML = "";
    try {
      const res = await fetch(`../briefings/index.json?ts=${Date.now()}`, { cache: "no-cache" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const items = (data.briefings || []).slice().sort((a, b) => b.date.localeCompare(a.date));
      renderList(items);
    } catch {
      empty();
    }
  }

  function empty() {
    statusEl.hidden = false;
    statusEl.innerHTML = "עדיין אין תדריכים 📭<br><small>התדריך הראשון ייווצר בהרצת הבוקר הבאה.</small>";
  }

  function renderList(items) {
    if (!items.length) return empty();
    statusEl.hidden = true;
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
