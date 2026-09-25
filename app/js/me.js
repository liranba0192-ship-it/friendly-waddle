"use strict";
window.App = window.App || {};

// טאב "אני" — עמוד אחד פשוט: פרופיל, תזכורות/גיבוי/תצוגה (App.more, ישירות בעמוד), עזרה, התנתקות.
// הלימוד ותדריכי הבוקר נמצאים בטאב בית.
App.me = (function () {
  const U = App.util, I = App.icon;
  let root, settingsEl;

  function mount(el) {
    root = el;
    render();
  }
  function show() { render(); }

  // App.nav.go("me", "settings") — גלילה לאזור ההגדרות
  function open(sub) {
    if (sub === "settings" && settingsEl) settingsEl.scrollIntoView({ block: "start" });
  }

  function render() {
    const email = App.sync && App.sync.email ? App.sync.email() : null;
    const name = email ? email.split("@")[0] : "חלבונינץ";
    root.innerHTML = `
      <header class="home-head" style="padding-bottom:8px"><div><h1 class="t1">אני</h1></div></header>
      <div class="stack">
        <section class="card me-head">
          <div class="avatar" aria-hidden="true">${U.esc(name.charAt(0).toUpperCase())}</div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
            <span class="t2" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:right">${U.esc(name)}</span>
            <span class="perk">${I("gift", 16)}5% הנחה בחנות · מנוי</span>
          </div>
        </section>
        <div id="me-settings"></div>
        <h2 class="sec-title">עזרה וחשבון</h2>
        <section class="card list-group">
          <button class="list-row" id="me-help"><div class="itile">${I("chat")}</div>
            <span class="grow"><span style="font-weight:600">בוט עזרה</span><span class="lbl">שאלות נפוצות על האפליקציה</span></span><span class="chev">${I("chev")}</span></button>
          ${email ? `<button class="list-row danger" id="me-logout"><div class="itile" style="color:var(--danger)">${I("logout")}</div>
            <span class="grow"><span style="font-weight:600">התנתקות</span><span class="lbl">${U.esc(email)}</span></span></button>` : ""}
        </section>
      </div>`;
    settingsEl = root.querySelector("#me-settings");
    App.more.mount(settingsEl);
    root.querySelector("#me-help").addEventListener("click", () => App.helpbot && App.helpbot.open());
    const lo = root.querySelector("#me-logout");
    if (lo) lo.addEventListener("click", async () => {
      if (!confirm("להתנתק מהחשבון?")) return;
      if (App.sync) await App.sync.signOut().catch(() => {});
      location.reload();
    });
  }

  return { mount, show, open, isHome: () => true };
})();
