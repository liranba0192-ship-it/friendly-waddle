"use strict";
/*
 * App.projects — client-side project management + autosave (localStorage).
 *
 * Serializes the entire project — blueprint page images (as data URLs), scale
 * calibration, rooms, placed assets and routes, plus the active page and camera
 * — into localStorage. Projects are listed in a sidebar dropdown; selecting one
 * clears the canvas and fully reconstructs the saved state. A 60-second
 * background autosave (run during idle time so it never janks the canvas) keeps
 * the active project current, and the last project is reopened on launch.
 */
window.App = window.App || {};

App.projects = (function () {
  const INDEX_KEY = "hvac:projects"; // [{id,name,updatedAt}]
  const CURRENT_KEY = "hvac:projects:current";
  const PREFIX = "hvac:project:";
  const AUTOSAVE_MS = 60000;
  const JPEG_QUALITY = 0.82; // blueprints survive light JPEG; keeps storage small

  let currentId = null;
  let dirty = false; // something changed since last save
  const el = {};

  // ---- helpers ------------------------------------------------------------
  function uid() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function readIndex() {
    try {
      return JSON.parse(localStorage.getItem(INDEX_KEY)) || [];
    } catch (_) {
      return [];
    }
  }
  function writeIndex(list) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  }

  function idle(fn) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 2000 });
    else setTimeout(fn, 0);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /** Render a page's bitmap to a data URL at its native resolution. */
  function pageToDataUrl(page) {
    const bw = page.bitmap.width || page.width;
    const bh = page.bitmap.height || page.height;
    const c = document.createElement("canvas");
    c.width = bw;
    c.height = bh;
    c.getContext("2d").drawImage(page.bitmap, 0, 0, bw, bh);
    return c.toDataURL("image/jpeg", JPEG_QUALITY);
  }

  // ---- serialize / deserialize -------------------------------------------
  function snapshot() {
    const pages = App.state.getPages().map((p) => ({
      dataUrl: pageToDataUrl(p),
      width: p.width,
      height: p.height,
      label: p.label,
    }));
    return {
      version: 1,
      fileName: App.state.getFileName(),
      activePage: App.state.getActiveIndex(),
      pixelsPerMeter: App.state.getPixelsPerMeter(),
      transform: App.viewport.getTransform(),
      rooms: App.state.getRooms(),
      assets: App.state.getAssets(),
      routes: App.state.getRoutes(),
      pages,
    };
  }

  async function rebuild(data) {
    const pages = await Promise.all(
      (data.pages || []).map(async (pg) => ({
        bitmap: await loadImage(pg.dataUrl),
        width: pg.width,
        height: pg.height,
        label: pg.label,
      }))
    );
    App.state.hydrate({
      pages,
      fileName: data.fileName,
      activePage: data.activePage,
      pixelsPerMeter: data.pixelsPerMeter,
      rooms: data.rooms,
      assets: data.assets,
      routes: data.routes,
    });
    // restore the saved camera, or fit if none
    requestAnimationFrame(() => {
      if (data.transform) App.viewport.setTransform(data.transform);
      else App.viewport.fitToScreen();
    });
  }

  // ---- persistence --------------------------------------------------------
  /** Write the snapshot for `id` to storage; returns true on success. */
  function writeProject(id, name) {
    const snap = snapshot();
    try {
      localStorage.setItem(PREFIX + id, JSON.stringify(snap));
    } catch (err) {
      App.ui && App.ui.toast && App.ui.toast("אחסון מלא — מחק פרויקט ישן ונסה שוב");
      return false;
    }
    const list = readIndex();
    const entry = list.find((e) => e.id === id);
    const now = Date.now();
    if (entry) {
      entry.updatedAt = now;
      if (name) entry.name = name;
    } else {
      list.push({ id, name: name || "פרויקט", updatedAt: now });
    }
    writeIndex(list);
    localStorage.setItem(CURRENT_KEY, id);
    return true;
  }

  /** Explicit "Save Project" — names a new project or updates the current one. */
  function saveProject() {
    if (!App.state.getActivePage()) {
      App.ui && App.ui.toast && App.ui.toast("טען שרטוט לפני שמירה");
      return;
    }
    let name;
    if (!currentId) {
      const def = (App.state.getFileName() || "פרויקט").replace(/\.[^.]+$/, "");
      name = (window.prompt("שם הפרויקט:", def) || "").trim();
      if (!name) return; // cancelled
      currentId = uid();
    }
    if (writeProject(currentId, name)) {
      dirty = false;
      refreshList();
      setStatus("נשמר " + timeLabel(Date.now()));
      App.ui && App.ui.toast && App.ui.toast("הפרויקט נשמר ✓");
    }
  }

  function newProject() {
    if (dirty && currentId == null && App.state.getActivePage()) {
      // unsaved fresh work — keep it safe with an autosave draft first
      autosave();
    }
    currentId = null;
    dirty = false;
    localStorage.removeItem(CURRENT_KEY);
    App.state.hydrate({ pages: [] }); // clears canvas + all layers
    App.state.setTool("pan");
    if (el.select) el.select.value = "";
    setStatus("פרויקט חדש");
  }

  async function openProject(id) {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) {
      App.ui && App.ui.toast && App.ui.toast("הפרויקט לא נמצא");
      return;
    }
    try {
      await rebuild(JSON.parse(raw));
      currentId = id;
      dirty = false;
      localStorage.setItem(CURRENT_KEY, id);
      if (el.select) el.select.value = id;
      const entry = readIndex().find((e) => e.id === id);
      setStatus("נטען: " + (entry ? entry.name : ""));
    } catch (err) {
      console.error("open project failed", err);
      App.ui && App.ui.toast && App.ui.toast("טעינת הפרויקט נכשלה");
    }
  }

  function deleteProject(id) {
    localStorage.removeItem(PREFIX + id);
    writeIndex(readIndex().filter((e) => e.id !== id));
    if (currentId === id) {
      currentId = null;
      localStorage.removeItem(CURRENT_KEY);
    }
    refreshList();
  }

  // ---- autosave -----------------------------------------------------------
  function autosave() {
    if (!App.state.getActivePage()) return; // nothing to save
    idle(() => {
      // lazily create a draft project so unsaved work is never lost
      if (!currentId) {
        currentId = uid();
        const name = (App.state.getFileName() || "טיוטה").replace(/\.[^.]+$/, "");
        writeProject(currentId, name);
        refreshList();
      } else {
        writeProject(currentId);
      }
      dirty = false;
      setStatus("נשמר אוטומטית " + timeLabel(Date.now()));
    });
  }

  function markDirty() {
    dirty = true;
  }

  // ---- UI -----------------------------------------------------------------
  function timeLabel(ts) {
    return new Date(ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  }

  function setStatus(text) {
    if (el.status) el.status.textContent = text;
  }

  function refreshList() {
    if (!el.select) return;
    const list = readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
    el.select.innerHTML =
      '<option value="">פרויקטים שמורים…</option>' +
      list
        .map(
          (e) =>
            `<option value="${e.id}">${escapeHtml(e.name)} · ${timeLabel(e.updatedAt)}</option>`
        )
        .join("");
    if (currentId) el.select.value = currentId;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function init() {
    el.save = document.getElementById("project-save");
    el.new = document.getElementById("project-new");
    el.select = document.getElementById("project-select");
    el.del = document.getElementById("project-delete");
    el.status = document.getElementById("project-status");

    el.save.addEventListener("click", saveProject);
    el.new.addEventListener("click", newProject);
    el.del.addEventListener("click", () => {
      const id = el.select.value;
      if (id && window.confirm("למחוק את הפרויקט הנבחר?")) deleteProject(id);
    });
    el.select.addEventListener("change", () => {
      if (el.select.value) openProject(el.select.value);
    });

    // mark dirty on any project change (drives autosave necessity + status)
    ["scale:changed", "rooms:changed", "assets:changed", "routes:changed", "document:changed"].forEach(
      (ev) => App.state.on(ev, markDirty)
    );

    refreshList();

    // reopen the last project so autosave is safe across reloads
    const last = localStorage.getItem(CURRENT_KEY);
    if (last && localStorage.getItem(PREFIX + last)) openProject(last);

    // background autosave (idle-scheduled → no canvas jank) + safety saves
    setInterval(() => {
      if (dirty) autosave();
    }, AUTOSAVE_MS);
    window.addEventListener("beforeunload", () => {
      if (dirty && App.state.getActivePage()) {
        if (!currentId) currentId = uid();
        writeProject(currentId, App.state.getFileName() || "טיוטה");
      }
    });
  }

  return { init, saveProject, newProject, openProject, deleteProject, snapshot };
})();
