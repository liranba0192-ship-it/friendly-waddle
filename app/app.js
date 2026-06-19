"use strict";
window.App = window.App || {};

(function () {
  const TABS = [
    { id: "briefing", label: "בוקר", icon: "🌅", title: "הרחבת ידע בוקר", mod: () => App.briefing },
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

  // --- settings overlay (gear top-right; no tab) ---
  function openSettings() {
    const ov = document.getElementById("settings-overlay");
    ov.hidden = false;
    const body = document.getElementById("settings-body");
    if (!settingsMounted) { App.more.mount(body); settingsMounted = true; }
    else if (App.more.show) App.more.show();
  }
  function closeSettings() { document.getElementById("settings-overlay").hidden = true; }

  function init() {
    applyTheme();
    buildTabbar();
    document.getElementById("settingsBtn").addEventListener("click", openSettings);
    document.getElementById("settings-close").addEventListener("click", closeSettings);
    const start = (location.hash || "").replace("#", "");
    switchTab(TABS.some((t) => t.id === start) ? start : "briefing");
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
