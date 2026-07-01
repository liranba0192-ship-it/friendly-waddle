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
        const t = btn.dataset.tool;
        // scale / room calibration & mapping need a blueprint loaded
        if ((t === "scale" || t === "room") && !App.state.getActivePage()) {
          toast("טען שרטוט קודם");
          return;
        }
        App.state.setTool(t);
      });
    });
    App.state.on("tool:changed", ({ tool }) => {
      el.toolButtons.forEach((btn) =>
        btn.classList.toggle("is-active", btn.dataset.tool === tool)
      );
      // crosshair + no panning for the drawing/placement tools
      el.canvas.classList.toggle("tool-scale", tool === "scale");
      el.canvas.classList.toggle("tool-room", tool === "room");
      el.canvas.classList.toggle("tool-asset", tool === "asset");
      el.canvas.classList.toggle("tool-route", tool === "route");
      // begin a fresh polygon draft when entering the room tool; drop it on exit
      if (tool === "room") App.rooms.start();
      else App.rooms.cancelDraft();
      // keep asset/route transient selections consistent
      App.routing.syncTool(tool);
      reflectSystemTool(tool);
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

  // --- HVAC assets & routing (STEP 4) --------------------------------------
  function setupSystem() {
    el.assetButtons.forEach((btn) =>
      btn.addEventListener("click", () => {
        if (!App.state.getActivePage()) return toast("טען שרטוט קודם");
        App.routing.armAsset(btn.dataset.asset);
      })
    );
    el.lineChips.forEach((chip) =>
      chip.addEventListener("click", () => {
        if (!App.state.getActivePage()) return toast("טען שרטוט קודם");
        App.routing.setLineType(chip.dataset.line);
        updateLineSizeUI();
      })
    );
    el.lineSize.addEventListener("change", () => App.routing.setLineSize(el.lineSize.value));
    App.state.on("assets:changed", renderSystem);
    App.state.on("routes:changed", renderSystem);
    App.state.on("scale:changed", renderSystem); // lengths switch to meters
    renderSystem();
  }

  /** Highlight the armed asset / line-type chip based on the active tool. */
  function reflectSystemTool(tool) {
    const pending = App.routing.getPendingAssetType();
    el.assetButtons.forEach((b) =>
      b.classList.toggle("is-active", tool === "asset" && b.dataset.asset === pending)
    );
    const line = App.routing.getLineType();
    el.lineChips.forEach((c) =>
      c.classList.toggle("is-active", tool === "route" && c.dataset.line === line)
    );
    updateLineSizeUI();
  }

  /** Show the diameter dropdown only for sized line types while routing. */
  function updateLineSizeUI() {
    const type = App.routing.getLineType();
    const dias = App.routing.getDiameters(type);
    if (App.state.getTool() === "route" && dias) {
      // the inch-mark (") must be entity-escaped or it terminates the attribute
      el.lineSize.innerHTML = dias
        .map((d) => `<option value="${d.replace(/"/g, "&quot;")}">${d}</option>`)
        .join("");
      el.lineSize.value = App.routing.getLineSize();
      el.lineSizeWrap.classList.remove("hidden");
    } else {
      el.lineSizeWrap.classList.add("hidden");
    }
  }

  function renderSystem() {
    const assets = App.state.getAssets();
    const routes = App.state.getRoutes();
    const defs = App.routing.getAssetDefs();
    el.systemEmpty.classList.toggle("hidden", assets.length + routes.length > 0);

    el.assetList.innerHTML = "";
    assets.forEach((a) => {
      const def = defs[a.type] || { label: a.type, color: "#94a3b8" };
      const row = document.createElement("div");
      row.className = "room-row";
      row.innerHTML =
        `<span class="room-dot" style="background:${def.color}"></span>` +
        `<span class="room-meta"><span class="room-name">${escapeHtml(def.label)}</span></span>`;
      const del = mkDelete(() => App.state.removeAsset(a.id));
      row.appendChild(del);
      el.assetList.appendChild(row);
    });

    el.routeList.innerHTML = "";
    routes.forEach((r) => {
      const def = App.routing.getLineDef(r.lineType);
      const meters = App.routing.lengthMeters(r);
      const lenText = meters != null ? meters.toFixed(2) + " מ׳" : "— מ׳";
      const row = document.createElement("div");
      row.className = "room-row";
      row.innerHTML =
        `<span class="room-dot" style="background:${def.color}"></span>` +
        `<span class="room-meta"><span class="room-name">${escapeHtml(App.routing.routeLabel(r))}</span>` +
        `<span class="room-area">${lenText}</span></span>`;
      row.appendChild(mkDelete(() => App.state.removeRoute(r.id)));
      el.routeList.appendChild(row);
    });
  }

  function mkDelete(onClick) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "room-del";
    del.title = "מחק";
    del.textContent = "🗑";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return del;
  }

  // --- zone registry (rooms list) -----------------------------------------
  function setupRooms() {
    App.state.on("rooms:changed", renderRooms);
    App.state.on("roomhover:changed", reflectRoomActive);
    App.state.on("roomselect:changed", reflectRoomActive);
    App.state.on("scale:changed", renderRooms); // areas switch to m²
    renderRooms();
  }

  function renderRooms() {
    const rooms = App.state.getRooms();
    el.roomList.innerHTML = "";
    el.roomEmpty.classList.toggle("hidden", rooms.length > 0);

    rooms.forEach((room) => {
      const area = App.rooms.areaM2(room);
      const areaText = area != null ? area.toFixed(1) + ' מ"ר' : '— מ"ר';
      const cooling = App.rooms.coolingText(area);

      const row = document.createElement("div");
      row.className = "room-row";
      row.dataset.id = room.id;

      const dot = document.createElement("span");
      dot.className = "room-dot";
      dot.style.background = room.color;

      const meta = document.createElement("span");
      meta.className = "zone-meta";
      meta.innerHTML =
        `<span class="room-name">${escapeHtml(room.name)}</span>` +
        `<span class="room-detail">שטח: ${areaText}` +
        (cooling ? ` · תפוקה מומלצת: <b>${cooling}</b>` : "") +
        `</span>`;
      // quick-apply the recommended indoor unit (only when calibrated)
      if (area != null) {
        const apply = document.createElement("button");
        apply.type = "button";
        apply.className = "room-apply";
        apply.textContent = "⚡ החל יחידה";
        apply.title = "סמן את היחידה הפנימית המומלצת מהמגש";
        apply.addEventListener("click", (e) => {
          e.stopPropagation();
          App.rooms.applyRecommendedUnit(area);
        });
        meta.appendChild(apply);
      }

      const del = document.createElement("button");
      del.type = "button";
      del.className = "room-del";
      del.title = "מחק חדר";
      del.textContent = "🗑";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        App.state.removeRoom(room.id);
      });

      row.append(dot, meta, del);
      row.addEventListener("mouseenter", () => App.state.setHoveredRoom(room.id));
      row.addEventListener("mouseleave", () => App.state.setHoveredRoom(null));
      row.addEventListener("click", () => App.state.setSelectedRoom(room.id));
      el.roomList.appendChild(row);
    });
    reflectRoomActive();
  }

  function reflectRoomActive() {
    const hovered = App.state.getHoveredRoom();
    const selected = App.state.getSelectedRoom();
    [...el.roomList.children].forEach((row) => {
      row.classList.toggle("is-hover", row.dataset.id === hovered);
      row.classList.toggle("is-selected", row.dataset.id === selected);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
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
    el.roomList = $("room-list");
    el.roomEmpty = $("room-empty");
    el.assetButtons = [...document.querySelectorAll("[data-asset]")];
    el.lineChips = [...document.querySelectorAll("[data-line]")];
    el.assetList = $("asset-list");
    el.routeList = $("route-list");
    el.systemEmpty = $("system-empty");
    el.lineSize = $("line-size-select");
    el.lineSizeWrap = $("line-size-wrap");

    el.openBtn.addEventListener("click", openFileDialog);
    el.openBtnEmpty.addEventListener("click", openFileDialog);
    el.fileInput.addEventListener("change", onFilePicked);
    $("open-estimate").addEventListener("click", () => App.estimate.open());

    setupDragDrop();
    setupTools();
    setupZoom();
    setupReadout();
    setupTheme();
    setupScale();
    setupRooms();
    setupSystem();

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
