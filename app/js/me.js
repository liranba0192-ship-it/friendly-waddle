"use strict";
window.App = window.App || {};

// טאב "אני" — פרופיל, המעקב שלי (שקילה/לימוד/תדריכים), הגדרות ותזכורות, עזרה, התנתקות.
// לימוד (App.learn) והגדרות (App.more) מותקנים כאן כתת-מסכים.
App.me = (function () {
  const U = App.util, S = App.store, I = App.icon;
  const SUBS = {
    learn: { title: "לימוד", mod: () => App.learn },
    settings: { title: "הגדרות ותזכורות", mod: () => App.more },
  };
  let root, listEl, subEl, subTitle, mountedSubs = {}, sub = null;

  function mount(el) {
    root = el;
    root.innerHTML = `
      <div id="me-list"></div>
      <div id="me-sub" hidden>
        <div class="subhead">
          <button class="ibtn ghost" id="me-back" aria-label="חזרה">${I("back")}</button>
          <span class="t3" id="me-sub-title"></span>
        </div>
        ${Object.keys(SUBS).map((k) => `<div id="me-sub-${k}" hidden></div>`).join("")}
      </div>`;
    listEl = root.querySelector("#me-list");
    subEl = root.querySelector("#me-sub");
    subTitle = root.querySelector("#me-sub-title");
    root.querySelector("#me-back").addEventListener("click", home);
    render();
  }
  function show() {
    if (!sub) render();
    else { const m = SUBS[sub].mod(); if (m.show) m.show(); }
  }

  async function open(name) {
    if (!SUBS[name]) return;
    sub = name;
    listEl.hidden = true;
    subEl.hidden = false;
    subTitle.textContent = SUBS[name].title;
    for (const k of Object.keys(SUBS)) root.querySelector(`#me-sub-${k}`).hidden = k !== name;
    const box = root.querySelector(`#me-sub-${name}`);
    const m = SUBS[name].mod();
    if (!mountedSubs[name]) { await m.mount(box); mountedSubs[name] = true; }
    else if (m.show) await m.show();
    App.updateChrome();
    window.scrollTo(0, 0);
  }
  function home() {
    sub = null;
    subEl.hidden = true;
    listEl.hidden = false;
    render();
    App.updateChrome();
    window.scrollTo(0, 0);
  }
  function isHome() { return !sub; }

  function displayName(email) {
    if (!email) return "";
    return email.split("@")[0];
  }

  function row(icon, title, sub, attrs, extra) {
    return `<button class="list-row" ${attrs}>
      <div class="itile">${I(icon)}</div>
      <span class="grow"><span style="font-weight:600">${title}</span>${sub ? `<span class="lbl">${sub}</span>` : ""}</span>
      ${extra || `<span class="chev">${I("chev")}</span>`}
    </button>`;
  }

  async function render() {
    const email = App.sync && App.sync.email ? App.sync.email() : null;
    const name = displayName(email) || "חלבונינץ";
    const logs = S.get("weight.logs", []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const lastW = logs.length ? `${logs[logs.length - 1].kg} ק״ג` : "עוד לא נשקלת";
    const theme = localStorage.getItem("mb.theme") || "dark";
    const themeName = { dark: "כהה", light: "בהיר", auto: "אוטומטי" }[theme] || "כהה";

    listEl.innerHTML = `
      <header class="home-head" style="padding-bottom:8px"><div><h1 class="t1">אני</h1></div></header>
      <section class="card me-head">
        <div class="avatar" aria-hidden="true">${U.esc(name.charAt(0).toUpperCase())}</div>
        <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
          <span class="t2" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:right">${U.esc(name)}</span>
          <span class="perk">${I("gift", 16)}5% הנחה בחנות · מנוי</span>
        </div>
      </section>

      <h2 class="sec-title">המעקב שלי</h2>
      <section class="card list-group">
        ${row("scale", "שקילה", lastW, 'data-go="food" data-sub="weight"')}
        ${row("book", "לימוד", '<span id="me-words">אנגלית · פיננסים · AI</span>', 'data-open="learn"')}
        ${row("news", "תדריכי בוקר", "ארכיון התדריכים", 'data-go="home" data-sub="briefing"')}
      </section>

      <h2 class="sec-title">חשבון</h2>
      <section class="card list-group">
        ${row("bell", "תזכורות והגדרות", `תצוגה: ${themeName}`, 'data-open="settings"')}
        ${row("bag", "החנות", "halbonintz.com", 'data-go="shop"')}
      </section>

      <h2 class="sec-title">עזרה</h2>
      <section class="card list-group">
        ${row("chat", "בוט עזרה", "שאלות נפוצות על האפליקציה", 'id="me-help"')}
      </section>

      ${email ? `<section class="card list-group" style="margin-top:12px">
        <button class="list-row danger" id="me-logout"><div class="itile" style="color:var(--danger)">${I("logout")}</div><span class="grow"><span style="font-weight:600">התנתקות</span></span></button>
      </section>` : ""}
    `;
    listEl.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => App.nav.go(b.dataset.go, b.dataset.sub)));
    listEl.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => open(b.dataset.open)));
    listEl.querySelector("#me-help").addEventListener("click", () => App.helpbot && App.helpbot.open());
    const lo = listEl.querySelector("#me-logout");
    if (lo) lo.addEventListener("click", async () => {
      if (App.sync) await App.sync.signOut().catch(() => {});
      location.reload();
    });
    try {
      const p = App.learn && App.learn.todayProgress ? await App.learn.todayProgress() : null;
      const el = listEl.querySelector("#me-words");
      if (p && el) el.textContent = `${p.done}/${p.total} מילים היום`;
    } catch {}
  }

  return { mount, show, open, home, isHome };
})();
