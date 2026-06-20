"use strict";
window.App = window.App || {};

(function () {
  const TABS = [
    { id: "briefing", label: "בוקר", icon: "🌅", title: "חלבונינץ", mod: () => App.briefing },
    { id: "workout", label: "אימון", icon: "💪", title: "אימון", mod: () => App.workout },
    { id: "food", label: "תזונה", icon: "🥗", title: "תזונה", mod: () => App.food },
    { id: "weight", label: "שקילה", icon: "⚖️", title: "שקילה", mod: () => App.weight },
  ];
  const mounted = {};
  let active = null, settingsMounted = false;

  // --- theme ---
  App.setTheme = function (theme) {
    localStorage.setItem("mb.theme", theme);
    applyTheme();
  };
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", localStorage.getItem("mb.theme") || "light");
  }

  function titleFor(id) {
    const t = TABS.find((x) => x.id === id);
    return `${t.icon} ${t.title}`;
  }

  async function switchTab(id) {
    active = id;
    document.getElementById("appTitle").textContent = titleFor(id);
    for (const t of TABS) {
      document.getElementById("view-" + t.id).hidden = t.id !== id;
      document.getElementById("tab-" + t.id).classList.toggle("active", t.id === id);
    }
    const tab = TABS.find((t) => t.id === id);
    const view = document.getElementById("view-" + id);
    if (!mounted[id]) { await tab.mod().mount(view); mounted[id] = true; }
    else if (tab.mod().show) await tab.mod().show();
    view.classList.remove("enter");
    void view.offsetWidth;
    view.classList.add("enter");
    window.scrollTo(0, 0);
    location.hash = id;
  }

  function buildTabbar() {
    const nav = document.getElementById("tabbar");
    nav.innerHTML = TABS.map((t) =>
      `<button id="tab-${t.id}" class="tab"><span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span></button>`
    ).join("");
    TABS.forEach((t) =>
      document.getElementById("tab-" + t.id).addEventListener("click", () => switchTab(t.id))
    );
  }

  // --- settings overlay ---
  function openSettings() {
    const ov = document.getElementById("settings-overlay");
    ov.hidden = false;
    const body = document.getElementById("settings-body");
    if (!settingsMounted) { App.more.mount(body); settingsMounted = true; }
    else if (App.more.show) App.more.show();
  }
  function closeSettings() { document.getElementById("settings-overlay").hidden = true; }
  App.openSettings = openSettings;

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
    const start = (location.hash || "").replace("#", "");
    switchTab(TABS.some((t) => t.id === start) ? start : "briefing");
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

    el.innerHTML = `
      <label class="field">אימייל או מספר טלפון
        <input id="au-ident" type="text" inputmode="email" autocomplete="username"
          placeholder="someone@example.com / 050-0000000" />
      </label>
      <label class="field">סיסמה
        <input id="au-pass" type="password" autocomplete="current-password" placeholder="סיסמה" />
      </label>
      <button id="au-login" class="btn-primary full">התחבר</button>
      <button id="au-signup" class="btn-secondary full">הרשמה</button>
      <p class="auth-msg" id="au-msg"></p>`;

    const msg = (t) => { const m = el.querySelector("#au-msg"); if (m) m.textContent = t; };
    const ident = () => toEmail(el.querySelector("#au-ident").value);
    const pass  = () => el.querySelector("#au-pass").value;

    el.querySelector("#au-login").addEventListener("click", async () => {
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
    document.getElementById("settingsBtn").addEventListener("click", openSettings);
    document.getElementById("settings-close").addEventListener("click", closeSettings);
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
