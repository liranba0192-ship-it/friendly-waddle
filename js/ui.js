"use strict";
/*
 * App.ui — wires the DOM sidebar to the app: file open, tool buttons, zoom
 * controls, page thumbnails, live coordinate readout, theme toggle, toasts.
 * User-facing text is Hebrew; identifiers stay English.
 */
window.App = window.App || {};

App.ui = (function () {
  const el = {}; // cached element references

  function $(id) {
    return document.getElementById(id);
  }

  // --- toast ---------------------------------------------------------------
  let toastTimer = 0;
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("is-visible"), 2600);
  }

  // --- file open -----------------------------------------------------------
  function openFileDialog() {
    el.fileInput.value = ""; // allow re-selecting the same file
    el.fileInput.click();
  }

  function onFilePicked(e) {
    const file = e.target.files && e.target.files[0];
    if (file) App.ingest.loadFile(file);
  }

  function setupDragDrop() {
    const stage = el.stage;
    ["dragenter", "dragover"].forEach((t) =>
      stage.addEventListener(t, (e) => {
        e.preventDefault();
        stage.classList.add("is-dropping");
      })
    );
    ["dragleave", "drop"].forEach((t) =>
      stage.addEventListener(t, (e) => {
        e.preventDefault();
        if (t === "dragleave" && e.target !== stage) return;
        stage.classList.remove("is-dropping");
      })
    );
    stage.addEventListener("drop", (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) App.ingest.loadFile(file);
    });
  }

  // --- tools ---------------------------------------------------------------
  function setupTools() {
    el.toolButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        // calibrating without a blueprint loaded is meaningless — guide the user
        if (btn.dataset.tool === "scale" && !App.state.getActivePage()) {
          toast("טען שרטוט לפני הגדרת קנה מידה");
          return;
        }
        App.state.setTool(btn.dataset.tool);
      });
    });
    App.state.on("tool:changed", ({ tool }) => {
      el.toolButtons.forEach((btn) =>
        btn.classList.toggle("is-active", btn.dataset.tool === tool)
      );
      // crosshair cursor + no panning while the Set Scale tool is active
      el.canvas.classList.toggle("tool-scale", tool === "scale");
    });
  }

  // --- zoom controls -------------------------------------------------------
  function setupZoom() {
    el.zoomIn.addEventListener("click", () => App.viewport.zoomToCenter(1.25));
    el.zoomOut.addEventListener("click", () => App.viewport.zoomToCenter(0.8));
    el.zoomFit.addEventListener("click", () => App.viewport.fitToScreen());
    // reflect the live zoom level + ruler whenever the camera changes
    App.viewport.addChangeListener(() => {
      el.zoomLevel.textContent = Math.round(App.viewport.getScale() * 100) + "%";
      updateRuler();
    });
  }

  // --- calibration status + dynamic ruler ----------------------------------
  function setupScale() {
    el.scaleReset.addEventListener("click", () => {
      App.state.setPixelsPerMeter(null);
      App.scale.reset();
      toast("קנה המידה אופס");
    });
    App.state.on("scale:changed", () => {
      updateScaleStatus();
      updateRuler();
    });
    updateScaleStatus();
    updateRuler();
  }

  function updateScaleStatus() {
    const ppm = App.state.getPixelsPerMeter();
    if (ppm) {
      el.scaleValue.textContent = Math.round(ppm) + " יח׳/מ׳";
      el.scaleValue.classList.add("text-brand-400");
      el.scaleValue.classList.remove("text-zinc-300");
      el.scaleReset.classList.remove("hidden");
    } else {
      el.scaleValue.textContent = "לא מכויל";
      el.scaleValue.classList.add("text-zinc-300");
      el.scaleValue.classList.remove("text-brand-400");
      el.scaleReset.classList.add("hidden");
    }
  }

  function updateRuler() {
    const info = App.scale.computeRuler(App.viewport.getScale());
    if (!info) {
      el.ruler.classList.add("hidden");
      el.ruler.classList.remove("flex");
      return;
    }
    el.ruler.classList.remove("hidden");
    el.ruler.classList.add("flex");
    el.rulerLabel.textContent = info.label;
    el.rulerBar.style.width = info.widthPx + "px";
  }

  // --- pages ---------------------------------------------------------------
  function renderPages() {
    const pages = App.state.getPages();
    el.pageList.innerHTML = "";
    el.emptyHint.classList.toggle("hidden", pages.length > 0);
    el.docName.textContent = App.state.getFileName() || "אין קובץ טעון";

    pages.forEach((page, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className =
        "page-thumb group relative w-full rounded-lg overflow-hidden border border-zinc-700/70 " +
        "bg-zinc-800/60 transition hover:border-sky-500/70 active:scale-[0.98]";
      item.dataset.index = String(i);

      // thumbnail image from the page bitmap
      const thumb = document.createElement("canvas");
      const tw = 180;
      const th = Math.max(1, Math.round((page.height / page.width) * tw));
      thumb.width = tw;
      thumb.height = th;
      thumb.getContext("2d").drawImage(page.bitmap, 0, 0, tw, th);
      thumb.className = "w-full block";

      const label = document.createElement("span");
      label.className =
        "absolute bottom-0 start-0 px-2 py-0.5 text-xs bg-zinc-900/80 text-zinc-200";
      label.textContent = page.label;

      item.appendChild(thumb);
      item.appendChild(label);
      item.addEventListener("click", () => App.state.setActivePage(i));
      el.pageList.appendChild(item);
    });
    highlightActivePage(App.state.getActiveIndex());
  }

  function highlightActivePage(index) {
    [...el.pageList.children].forEach((child, i) =>
      child.classList.toggle("is-active", i === index)
    );
    const total = App.state.getPages().length;
    el.pageIndicator.textContent = total ? `${index + 1} / ${total}` : "—";
  }

  // --- live coordinate readout --------------------------------------------
  function setupReadout() {
    el.stage.addEventListener("pointermove", (e) => {
      const rect = el.canvas.getBoundingClientRect();
      const w = App.viewport.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      el.coords.textContent = `X ${w.x.toFixed(0)}  Y ${w.y.toFixed(0)}`;
    });
  }

  // --- theme ---------------------------------------------------------------
  function setupTheme() {
    el.themeToggle.addEventListener("click", () => {
      const root = document.documentElement;
      root.classList.toggle("dark");
      try {
        localStorage.setItem(
          "hvac:theme",
          root.classList.contains("dark") ? "dark" : "light"
        );
      } catch (_) {}
      App.renderer.markDirty();
    });
  }

  // --- init ----------------------------------------------------------------
  function init() {
    el.stage = $("stage");
    el.canvas = $("board");
    el.fileInput = $("file-input");
    el.openBtn = $("open-file");
    el.openBtnEmpty = $("open-file-empty");
    el.toolButtons = [...document.querySelectorAll("[data-tool]")];
    el.zoomIn = $("zoom-in");
    el.zoomOut = $("zoom-out");
    el.zoomFit = $("zoom-fit");
    el.zoomLevel = $("zoom-level");
    el.pageList = $("page-list");
    el.pageIndicator = $("page-indicator");
    el.docName = $("doc-name");
    el.emptyHint = $("empty-hint");
    el.coords = $("coords");
    el.toast = $("toast");
    el.themeToggle = $("theme-toggle");
    el.ruler = $("ruler");
    el.rulerBar = $("ruler-bar");
    el.rulerLabel = $("ruler-label");
    el.scaleValue = $("scale-value");
    el.scaleReset = $("scale-reset");

    el.openBtn.addEventListener("click", openFileDialog);
    el.openBtnEmpty.addEventListener("click", openFileDialog);
    el.fileInput.addEventListener("change", onFilePicked);

    setupDragDrop();
    setupTools();
    setupZoom();
    setupReadout();
    setupTheme();
    setupScale();

    App.state.on("document:changed", renderPages);
    App.state.on("page:changed", ({ index }) => highlightActivePage(index));
    App.state.on("loading:changed", ({ loading }) =>
      el.stage.classList.toggle("is-loading", loading)
    );

    // initial reflect
    el.zoomLevel.textContent = Math.round(App.viewport.getScale() * 100) + "%";
  }

  return { init, toast };
})();
