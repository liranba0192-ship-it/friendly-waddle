"use strict";
window.App = window.App || {};

(function () {
  const TABS = [
    { id: "briefing", label: "בוקר", icon: "🌅", mod: () => App.briefing },
    { id: "workout", label: "אימון", icon: "💪", mod: () => App.workout },
    { id: "food", label: "אוכל", icon: "🥗", mod: () => App.food },
    { id: "weight", label: "שקילה", icon: "⚖️", mod: () => App.weight },
    { id: "more", label: "עוד", icon: "⚙️", mod: () => App.more },
  ];
  const mounted = {};
  let active = null;

  // --- theme ---
  App.setTheme = function (theme) {
    localStorage.setItem("mb.theme", theme);
    applyTheme();
  };
  function applyTheme() {
    const t = localStorage.getItem("mb.theme") || "light";
    document.documentElement.setAttribute("data-theme", t);
  }

  function titleFor(id) {
    const t = TABS.find((x) => x.id === id);
    return `${t.icon} ${t.id === "briefing" ? "הרחבת ידע בוקר" : t.label}`;
  }

  async function switchTab(id) {
    active = id;
    document.getElementById("appTitle").textContent = titleFor(id);
    for (const t of TABS) {
      const view = document.getElementById("view-" + t.id);
      const btn = document.getElementById("tab-" + t.id);
      const isActive = t.id === id;
      view.hidden = !isActive;
      btn.classList.toggle("active", isActive);
    }
    const tab = TABS.find((t) => t.id === id);
    const mod = tab.mod();
    const view = document.getElementById("view-" + id);
    if (!mounted[id]) { await mod.mount(view); mounted[id] = true; }
    else if (mod.show) await mod.show();
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

  function init() {
    applyTheme();
    buildTabbar();
    const start = (location.hash || "").replace("#", "");
    switchTab(TABS.some((t) => t.id === start) ? start : "briefing");
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
