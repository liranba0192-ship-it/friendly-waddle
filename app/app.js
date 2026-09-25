"use strict";
window.App = window.App || {};

(function () {
  const TABS = [
    { id: "home", label: "בית", icon: "home", title: "", mod: () => App.home },
    { id: "workout", label: "אימון", icon: "dumbbell", title: "", mod: () => App.workout },
    { id: "food", label: "תזונה", icon: "fork", title: "", mod: () => App.food },
    { id: "shop", label: "חנות", icon: "bag", title: "", mod: () => App.shop },
    { id: "me", label: "אני", icon: "user", title: "", mod: () => App.me },
  ];
  // טאבים ישנים (לפני העיצוב החדש) → טאב + תת-מסך חדשים
  const LEGACY = { briefing: ["home"], weight: ["food", "weight"], learn: ["me", "learn"] };
  const mounted = {};
  let active = null;

  // --- theme (ברירת מחדל: כהה) ---
  App.setTheme = function (theme) {
    localStorage.setItem("mb.theme", theme);
    applyTheme();
  };
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", localStorage.getItem("mb.theme") || "dark");
    requestAnimationFrame(() => {
      const meta = document.getElementById("themeColor");
      if (meta) meta.setAttribute("content", getComputedStyle(document.body).backgroundColor || "#0a0a0a");
    });
  }

  function updateChrome() {
    const tab = TABS.find((t) => t.id === active);
    const m = tab && tab.mod();
    const sub = !!(m && m.isHome && !m.isHome());
    if (m && m.chrome) m.chrome();
    // סרגל הטאבים מוסתר רק במסכי משנה "ממוקדים" (מסך תרגיל, מסך מאכל) — לפי העיצוב
    document.body.classList.toggle("subview", !!(m && m.hideTabbar && m.hideTabbar()));
    const header = document.querySelector(".app-header");
    header.hidden = sub || !tab.title;
  }
  App.updateChrome = () => requestAnimationFrame(updateChrome);

  async function switchTab(id, sub, opts) {
    if (LEGACY[id]) { [id, sub] = [LEGACY[id][0], sub || LEGACY[id][1]]; }
    if (!TABS.some((t) => t.id === id)) id = "home";
    active = id;
    localStorage.setItem("mb.lastTab", id);
    const tab = TABS.find((t) => t.id === id);
    document.getElementById("appTitle").textContent = tab.title;
    for (const t of TABS) {
      document.getElementById("view-" + t.id).hidden = t.id !== id;
      const b = document.getElementById("tab-" + t.id);
      b.classList.toggle("active", t.id === id);
      if (t.id === id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    }
    const view = document.getElementById("view-" + id);
    if (!mounted[id]) { await tab.mod().mount(view); mounted[id] = true; }
    else if (tab.mod().show) await tab.mod().show();
    if (sub && tab.mod().open) await tab.mod().open(sub, opts);
    view.classList.remove("enter");
    void view.offsetWidth;
    view.classList.add("enter");
    window.scrollTo(0, 0);
    history.replaceState(null, "", "#" + id);
    updateChrome();
  }
  // ניווט בין טאבים ותת-מסכים: App.nav.go("food", "weight")
  App.nav = { go: (tab, sub, opts) => switchTab(tab, sub, opts), active: () => active };
  App.openSettings = () => switchTab("me", "settings");

  function buildTabbar() {
    const nav = document.getElementById("tabbar");
    nav.innerHTML = TABS.map((t) =>
      `<button id="tab-${t.id}" class="tab"><span class="tab-icon">${App.icon(t.icon, 24)}</span><span class="tab-label">${t.label}</span></button>`
    ).join("");
    TABS.forEach((t) =>
      document.getElementById("tab-" + t.id).addEventListener("click", () => {
        // לחיצה על הטאב הפעיל כשנמצאים בתת-מסך — חזרה למסך הראשי של הטאב
        if (t.id === active && t.mod().home) { t.mod().home(); updateChrome(); window.scrollTo(0, 0); return; }
        switchTab(t.id);
      })
    );
  }

  // --- swipe navigation בין טאבים (ימין/שמאל) ---
  // בודק אם הנגיעה התחילה בתוך אלמנט עם גלילה אופקית אמיתית (למשל .date-strip)
  // כדי לא "לגנוב" ממנו את המגע.
  function isInsideHorizontalScroller(el) {
    let node = el;
    while (node && node !== document.body) {
      if (node.scrollWidth > node.clientWidth + 1) {
        const cs = getComputedStyle(node);
        if (cs.overflowX === "auto" || cs.overflowX === "scroll") return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function initSwipeNav() {
    const content = document.querySelector("main.content");
    const THRESHOLD = 60;
    let sx = 0, sy = 0, tracking = false;

    content.addEventListener("touchstart", (e) => {
      tracking = e.touches.length === 1 && !isInsideHorizontalScroller(e.target);
      if (tracking) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
    }, { passive: true });

    content.addEventListener("touchend", (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const idx = TABS.findIndex((x) => x.id === active);
      const nextIdx = dx < 0 ? idx + 1 : idx - 1; // RTL: שמאלה=הבא, ימינה=קודם
      if (idx < 0 || nextIdx < 0 || nextIdx >= TABS.length) return;
      const curTab = TABS[idx];
      if (curTab && curTab.mod().isHome && !curTab.mod().isHome()) return; // לא במסך הבית — לא מחליפים טאב
      switchTab(TABS[nextIdx].id);
    }, { passive: true });
  }

  // --- auth helpers ---
  // אם הקלט נראה כמספר טלפון — הופך אותו ל-email סינתטי לשימוש ב-Supabase
  function toEmail(raw) {
    const trimmed = raw.trim();
    const digitsOnly = trimmed.replace(/[\s\-()]/g, "");
    if (/^(\+972|972|0)\d{8,10}$/.test(digitsOnly)) {
      const normalized = digitsOnly.replace(/^(\+972|972)/, "0");
      return normalized + "@halbonintz.app";
    }
    return trimmed;
  }

  function startApp() {
    document.getElementById("auth-overlay").hidden = true;
    const start = (location.hash || "").replace("#", "") || localStorage.getItem("mb.lastTab") || "home";
    switchTab(start);
  }

  function renderAuthForm() {
    const el = document.getElementById("auth-body");

    if (!App.sync || !App.sync.configured()) {
      el.innerHTML = `
        <p class="auth-hint">הגדרה חד-פעמית — הזן פרטי Supabase שלך:</p>
        <label class="field">Project URL<input id="au-url" type="url" placeholder="https://xxxx.supabase.co" /></label>
        <label class="field">anon public key<input id="au-key" type="text" placeholder="eyJhbGci…" /></label>
        <button id="au-setup" class="btn-primary full">המשך</button>
        <p class="auth-msg" id="au-msg"></p>`;
      el.querySelector("#au-setup").addEventListener("click", () => {
        const url = el.querySelector("#au-url").value.trim();
        const key = el.querySelector("#au-key").value.trim();
        if (!url || !key) { el.querySelector("#au-msg").textContent = "נא למלא את שני השדות"; return; }
        App.sync.saveConfig(url, key);
        renderAuthForm();
      });
      return;
    }

    const I = App.icon;
    let method = localStorage.getItem("mb.authMethod") || "email";
    el.innerHTML = `
      <form class="auth-form" id="au-form" novalidate>
        <div class="seg" role="tablist" aria-label="שיטת כניסה">
          <button type="button" role="tab" data-m="email">אימייל</button>
          <button type="button" role="tab" data-m="phone">טלפון</button>
        </div>
        <label class="fl"><span class="lbl" id="au-idlbl"></span>
          <span class="search-field"><span id="au-idico"></span><input id="au-ident" autocomplete="username" style="direction:ltr;text-align:right"></span></label>
        <label class="fl"><span class="lbl">סיסמה</span>
          <span class="search-field">${I("lock")}<input id="au-pass" type="password" autocomplete="current-password" placeholder="לפחות 6 תווים">
            <button type="button" class="ibtn ghost sm" id="au-eye" aria-label="הצג סיסמה" aria-pressed="false">${I("eye", 20)}</button></span></label>
        <button id="au-login" type="submit" class="btn btn-p full">התחברות</button>
        <p class="auth-msg" id="au-msg" role="alert"></p>
        <div class="auth-foot"><span class="lbl" style="font-size:15px">אין לך חשבון?</span><button type="button" id="au-signup" class="btn btn-t">הרשמה</button></div>
      </form>`;
    const setMethod = (m) => {
      method = m; localStorage.setItem("mb.authMethod", m);
      el.querySelectorAll("[data-m]").forEach((b) => { const on = b.dataset.m === m; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
      const inp = el.querySelector("#au-ident");
      inp.type = m === "email" ? "email" : "tel";
      inp.inputMode = m === "email" ? "email" : "tel";
      inp.placeholder = m === "email" ? "name@example.com" : "050-000-0000";
      el.querySelector("#au-idlbl").textContent = m === "email" ? "אימייל" : "מספר טלפון";
      el.querySelector("#au-idico").innerHTML = I(m === "email" ? "mail" : "phone");
    };
    el.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => setMethod(b.dataset.m)));
    setMethod(method);
    el.querySelector("#au-eye").addEventListener("click", (e) => {
      const p = el.querySelector("#au-pass"), show = p.type === "password";
      p.type = show ? "text" : "password";
      e.currentTarget.setAttribute("aria-pressed", show);
      e.currentTarget.setAttribute("aria-label", show ? "הסתר סיסמה" : "הצג סיסמה");
    });
    el.querySelector("#au-form").addEventListener("submit", (e) => { e.preventDefault(); el.querySelector("#au-login").click(); });

    const msg = (t) => { const m = el.querySelector("#au-msg"); if (m) m.textContent = t; };
    const ident = () => toEmail(el.querySelector("#au-ident").value);
    const pass  = () => el.querySelector("#au-pass").value;

    el.querySelector("#au-login").addEventListener("click", async (e) => {
      if (e) e.preventDefault();
      if (!el.querySelector("#au-ident").value.trim() || !pass()) { msg("נא למלא אימייל/טלפון וסיסמה"); return; }
      msg("מתחבר…");
      try {
        await App.sync.signIn(ident(), pass());
        startApp();
      } catch (e) { msg("שגיאה: " + (e.message || String(e))); }
    });

    el.querySelector("#au-signup").addEventListener("click", async () => {
      if (!el.querySelector("#au-ident").value.trim() || !pass()) { msg("נא למלא אימייל/טלפון וסיסמה"); return; }
      msg("נרשם…");
      try {
        await App.sync.signUp(ident(), pass());
        if (App.sync.email()) startApp();
        else msg("נשלח אימייל אישור. לאחר האישור התחבר כרגיל.");
      } catch (e) { msg("שגיאה: " + (e.message || String(e))); }
    });
  }

  async function init() {
    applyTheme();
    buildTabbar();
    initSwipeNav();
    const mark = document.getElementById("auth-mark");
    if (mark) mark.innerHTML = App.icon("bolt", 40);
    const gear = document.getElementById("settingsBtn");
    gear.innerHTML = App.icon("bell", 22);
    gear.addEventListener("click", () => switchTab("me", "settings"));
    // מודולים משנים תת-מסך בלחיצה פנימית — מעדכנים סרגל/כותרת אחרי כל לחיצה
    document.addEventListener("click", () => App.updateChrome());
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }

    // Auth gate
    document.getElementById("auth-body").innerHTML = `<p class="auth-hint">טוען…</p>`;
    let authed = false;
    if (App.sync && App.sync.configured()) {
      try { await App.sync.init(); } catch {}
      authed = !!App.sync.email();
    }
    if (authed) startApp();
    else renderAuthForm();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
