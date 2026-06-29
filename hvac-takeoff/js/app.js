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

  function start() {
    applyStoredTheme();

    const canvas = document.getElementById("board");
    App.renderer.init(canvas);
    App.input.init(canvas);
    App.ui.init();

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
