"use strict";
/*
 * App.state — central store + minimal pub/sub.
 *
 * Holds the loaded document (blueprint pages), the active page index, and small
 * UI flags. Modules subscribe with App.state.on(event, fn) and the store calls
 * App.state.emit(event, payload) when something changes, so the UI and renderer
 * stay in sync with the data without a framework.
 */
window.App = window.App || {};

App.state = (function () {
  // --- internal data -------------------------------------------------------
  const data = {
    /** @type {{ bitmap: (ImageBitmap|HTMLCanvasElement), width:number, height:number, label:string }[]} */
    pages: [],
    activePage: -1,
    /** name of the source file currently loaded */
    fileName: "",
    /** current tool id, e.g. "pan" (more tools arrive in later steps) */
    tool: "pan",
    /** true while a file is being parsed/rendered */
    loading: false,
    /**
     * Calibration ratio: blueprint world-units (the page's own pixel/point
     * space, independent of zoom) per real-world meter. null until the user
     * calibrates with the "Set Scale" tool. Stored per document.
     */
    pixelsPerMeter: null,
  };

  // --- pub/sub -------------------------------------------------------------
  const listeners = new Map(); // event -> Set<fn>

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn); // unsubscribe
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (set) set.forEach((fn) => fn(payload));
  }

  // --- accessors -----------------------------------------------------------
  function getPages() {
    return data.pages;
  }

  function getActivePage() {
    return data.activePage >= 0 ? data.pages[data.activePage] : null;
  }

  function getActiveIndex() {
    return data.activePage;
  }

  /**
   * Replace the document with a freshly loaded set of pages.
   * Releases any ImageBitmaps from a previous document to free GPU/RAM.
   */
  function setDocument(pages, fileName) {
    data.pages.forEach((p) => {
      if (p.bitmap && typeof p.bitmap.close === "function") p.bitmap.close();
    });
    data.pages = pages;
    data.fileName = fileName || "";
    data.activePage = pages.length ? 0 : -1;
    // a new blueprint invalidates any previous calibration
    data.pixelsPerMeter = null;
    emit("scale:changed", { pixelsPerMeter: null });
    emit("document:changed", { pages, fileName: data.fileName });
    emit("page:changed", { index: data.activePage, page: getActivePage() });
  }

  function setActivePage(index) {
    if (index < 0 || index >= data.pages.length || index === data.activePage) return;
    data.activePage = index;
    emit("page:changed", { index, page: getActivePage() });
  }

  function setTool(tool) {
    if (tool === data.tool) return;
    data.tool = tool;
    emit("tool:changed", { tool });
  }

  function getTool() {
    return data.tool;
  }

  function setLoading(loading) {
    data.loading = loading;
    emit("loading:changed", { loading });
  }

  function getFileName() {
    return data.fileName;
  }

  /** Store the calibration ratio (world-units per meter). Pass null to clear. */
  function setPixelsPerMeter(value) {
    data.pixelsPerMeter = value && isFinite(value) && value > 0 ? value : null;
    emit("scale:changed", { pixelsPerMeter: data.pixelsPerMeter });
  }

  function getPixelsPerMeter() {
    return data.pixelsPerMeter;
  }

  function isCalibrated() {
    return data.pixelsPerMeter != null;
  }

  return {
    on,
    emit,
    getPages,
    getActivePage,
    getActiveIndex,
    setDocument,
    setActivePage,
    setTool,
    getTool,
    setLoading,
    getFileName,
    setPixelsPerMeter,
    getPixelsPerMeter,
    isCalibrated,
  };
})();
