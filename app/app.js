"use strict";

// --- אלמנטים ---
const els = {
  listView: document.getElementById("listView"),
  articleView: document.getElementById("articleView"),
  list: document.getElementById("briefingList"),
  listStatus: document.getElementById("listStatus"),
  backBtn: document.getElementById("backBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  installHint: document.getElementById("installHint"),
};

const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function formatDate(iso) {
  // iso = YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayName = HE_DAYS[dt.getUTCDay()];
  return { dayName, pretty: `${d}.${m}.${y}` };
}

function todayISO() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

// --- טעינת אינדקס התדריכים ---
async function loadIndex() {
  els.listStatus.hidden = false;
  els.listStatus.textContent = "טוען תדריכים…";
  els.list.innerHTML = "";
  try {
    const res = await fetch(`../briefings/index.json?ts=${Date.now()}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = (data.briefings || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    renderList(items);
  } catch (err) {
    els.listStatus.hidden = false;
    els.listStatus.innerHTML =
      "עדיין אין תדריכים 📭<br><small>התדריך הראשון ייווצר בהרצת הבוקר הבאה של השגרה.</small>";
  }
}

function renderList(items) {
  if (!items.length) {
    els.listStatus.hidden = false;
    els.listStatus.innerHTML =
      "עדיין אין תדריכים 📭<br><small>התדריך הראשון ייווצר בהרצת הבוקר הבאה של השגרה.</small>";
    return;
  }
  els.listStatus.hidden = true;
  const today = todayISO();
  const frag = document.createDocumentFragment();
  for (const item of items) {
    const { dayName, pretty } = formatDate(item.date);
    const li = document.createElement("li");
    const card = document.createElement("a");
    card.className = "briefing-card" + (item.date === today ? " today" : "");
    card.href = `#${item.date}`;
    card.innerHTML = `
      <div class="date-row">
        <span>${pretty}${item.date === today ? " · היום" : ""}</span>
        <span class="day-badge">יום ${dayName}</span>
      </div>
      <h2>${escapeHtml(item.title || "תדריך יומי")}</h2>`;
    card.addEventListener("click", (e) => {
      e.preventDefault();
      openBriefing(item);
    });
    li.appendChild(card);
    frag.appendChild(li);
  }
  els.list.appendChild(frag);
}

// --- פתיחת תדריך בודד ---
async function openBriefing(item) {
  els.articleView.hidden = false;
  els.listView.hidden = true;
  els.backBtn.hidden = false;
  els.articleView.innerHTML = `<p class="status">טוען…</p>`;
  window.scrollTo(0, 0);
  location.hash = item.date;
  try {
    const res = await fetch(`../briefings/${item.file}?ts=${Date.now()}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    els.articleView.innerHTML = window.marked.parse(md);
    // קישורים חיצוניים נפתחים בטאב חדש
    els.articleView.querySelectorAll("a[href^='http']").forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });
  } catch (err) {
    els.articleView.innerHTML = `<p class="status">לא ניתן לטעון את התדריך 😕</p>`;
  }
}

function showList() {
  els.articleView.hidden = true;
  els.listView.hidden = false;
  els.backBtn.hidden = true;
  if (location.hash) history.replaceState(null, "", location.pathname);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// --- אירועים ---
els.backBtn.addEventListener("click", showList);
els.refreshBtn.addEventListener("click", () => {
  showList();
  loadIndex();
});

// רמז התקנה ל-iOS (Safari, כשלא רץ כאפליקציה מותקנת)
(function installHint() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
  if (isIOS && !standalone) els.installHint.hidden = false;
})();

// service worker (אופליין)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

loadIndex();
