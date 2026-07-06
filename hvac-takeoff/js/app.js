"use strict";
/*
 * Bootstrap — wires the modules together once the DOM is ready.
 * Load order (set in index.html): state -> viewport -> renderer -> ingest
 * -> input -> ui -> app.
 */
window.App = window.App || {};

(function () {
  function applyStoredTheme() {
    try {
      const saved = localStorage.getItem("hvac:theme");
      if (saved === "light") document.documentElement.classList.remove("dark");
      else document.documentElement.classList.add("dark"); // default dark
    } catch (_) {
      document.documentElement.classList.add("dark");
    }
  }

  // One failing module must not take the whole app down (e.g. a stale cache
  // served a partially-updated file) — log and keep bootstrapping the rest.
  function safeInit(name, fn) {
    try {
      fn();
    } catch (err) {
      console.error("init failed:", name, err);
    }
  }

  function start() {
    applyStoredTheme();

    const canvas = document.getElementById("board");
    safeInit("renderer", () => App.renderer.init(canvas));
    safeInit("input", () => App.input.init(canvas));
    safeInit("ui", () => App.ui.init());
    safeInit("business", () => App.business.init());
    safeInit("projects", () => App.projects.init());

    // signal a healthy boot to the recovery watchdog in index.html
    window.__hvacBooted = true;

    // register the service worker (PWA shell), non-blocking
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
