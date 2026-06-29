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
    /**
     * Mapped rooms (zones). Each: { id, name, zoneId, color, points:[{x,y}...] }
     * with points in blueprint world coordinates. Stored per document.
     */
    rooms: [],
    hoveredRoomId: null,
    selectedRoomId: null,
    /** Placed physical assets: { id, type, x, y } (world coords, anchor center). */
    assets: [],
    /** Orthogonal pipe/duct routes: { id, lineType, points:[{x,y}...],
     *  fromAssetId, toAssetId } with points in world coordinates. */
    routes: [],
  };

  let roomSeq = 0;
  let assetSeq = 0;
  let routeSeq = 0;

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
    // a new blueprint invalidates any previous calibration + room map
    data.pixelsPerMeter = null;
    data.rooms = [];
    data.hoveredRoomId = null;
    data.selectedRoomId = null;
    data.assets = [];
    data.routes = [];
    emit("scale:changed", { pixelsPerMeter: null });
    emit("rooms:changed", { rooms: data.rooms });
    emit("assets:changed", { assets: data.assets });
    emit("routes:changed", { routes: data.routes });
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

  // --- rooms ---------------------------------------------------------------
  function getRooms() {
    return data.rooms;
  }

  function addRoom(room) {
    const full = Object.assign({ id: "room-" + ++roomSeq }, room);
    data.rooms.push(full);
    emit("rooms:changed", { rooms: data.rooms });
    return full;
  }

  function removeRoom(id) {
    const i = data.rooms.findIndex((r) => r.id === id);
    if (i < 0) return;
    data.rooms.splice(i, 1);
    if (data.hoveredRoomId === id) data.hoveredRoomId = null;
    if (data.selectedRoomId === id) data.selectedRoomId = null;
    emit("rooms:changed", { rooms: data.rooms });
  }

  function getRoom(id) {
    return data.rooms.find((r) => r.id === id) || null;
  }

  function setHoveredRoom(id) {
    if (data.hoveredRoomId === id) return;
    data.hoveredRoomId = id;
    emit("roomhover:changed", { id });
  }

  function getHoveredRoom() {
    return data.hoveredRoomId;
  }

  function setSelectedRoom(id) {
    if (data.selectedRoomId === id) return;
    data.selectedRoomId = id;
    emit("roomselect:changed", { id });
  }

  function getSelectedRoom() {
    return data.selectedRoomId;
  }

  // --- assets --------------------------------------------------------------
  function getAssets() {
    return data.assets;
  }
  function getAsset(id) {
    return data.assets.find((a) => a.id === id) || null;
  }
  function addAsset(asset) {
    const full = Object.assign({ id: "asset-" + ++assetSeq }, asset);
    data.assets.push(full);
    emit("assets:changed", { assets: data.assets });
    return full;
  }
  function removeAsset(id) {
    const i = data.assets.findIndex((a) => a.id === id);
    if (i < 0) return;
    data.assets.splice(i, 1);
    emit("assets:changed", { assets: data.assets });
  }

  // --- routes --------------------------------------------------------------
  function getRoutes() {
    return data.routes;
  }
  function addRoute(route) {
    const full = Object.assign({ id: "route-" + ++routeSeq }, route);
    data.routes.push(full);
    emit("routes:changed", { routes: data.routes });
    return full;
  }
  function removeRoute(id) {
    const i = data.routes.findIndex((r) => r.id === id);
    if (i < 0) return;
    data.routes.splice(i, 1);
    emit("routes:changed", { routes: data.routes });
  }
  /** Notify listeners a route's geometry changed (e.g. a handle was dragged). */
  function touchRoutes() {
    emit("routes:changed", { routes: data.routes });
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
    getRooms,
    addRoom,
    removeRoom,
    getRoom,
    setHoveredRoom,
    getHoveredRoom,
    setSelectedRoom,
    getSelectedRoom,
    getAssets,
    getAsset,
    addAsset,
    removeAsset,
    getRoutes,
    addRoute,
    removeRoute,
    touchRoutes,
  };
})();
