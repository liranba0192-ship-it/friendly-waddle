"use strict";
/*
 * App.viewport — the camera that maps blueprint "world" coordinates to the
 * canvas "screen" coordinates, and back.
 *
 * The transform is a uniform scale + translation:
 *     screen = world * scale + translate
 *     world  = (screen - translate) / scale
 *
 * `screen` here means CSS pixels relative to the canvas top-left corner
 * (NOT device pixels and NOT clientX/clientY). The renderer multiplies by
 * devicePixelRatio separately, and the input layer subtracts the canvas
 * bounding-rect origin before calling us — so this module is purely the
 * world<->canvas-CSS-pixel math and is independent of where the canvas sits
 * on the page or what the pixel density is.
 */
window.App = window.App || {};

App.viewport = (function () {
  const MIN_SCALE = 0.02;
  const MAX_SCALE = 40;

  // camera state
  let scale = 1;
  let tx = 0;
  let ty = 0;

  // canvas size in CSS pixels (kept in sync by the renderer)
  let viewW = 0;
  let viewH = 0;

  // Multiple modules react to camera changes (renderer marks dirty, UI updates
  // the zoom readout), so we keep a list rather than a single callback.
  const changeListeners = new Set();

  function onChange() {
    changeListeners.forEach((fn) => fn());
  }

  function addChangeListener(fn) {
    if (typeof fn === "function") changeListeners.add(fn);
    return () => changeListeners.delete(fn);
  }

  function setViewSize(w, h) {
    viewW = w;
    viewH = h;
  }

  function getViewSize() {
    return { width: viewW, height: viewH };
  }

  function clampScale(s) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  // --- coordinate mapping --------------------------------------------------
  /** canvas CSS-pixel point -> world point */
  function screenToWorld(sx, sy) {
    return { x: (sx - tx) / scale, y: (sy - ty) / scale };
  }

  /** world point -> canvas CSS-pixel point */
  function worldToScreen(wx, wy) {
    return { x: wx * scale + tx, y: wy * scale + ty };
  }

  // --- camera operations ---------------------------------------------------
  /** pan by a delta given in canvas CSS pixels */
  function panBy(dxScreen, dyScreen) {
    tx += dxScreen;
    ty += dyScreen;
    onChange();
  }

  /**
   * Zoom by `factor` while keeping the world point currently under
   * (sx, sy) — canvas CSS pixels — locked under that same screen point.
   */
  function zoomAt(sx, sy, factor) {
    const newScale = clampScale(scale * factor);
    if (newScale === scale) return;
    // world point under the cursor before zooming
    const wx = (sx - tx) / scale;
    const wy = (sy - ty) / scale;
    scale = newScale;
    // re-solve translate so that worldToScreen(wx,wy) === (sx,sy)
    tx = sx - wx * scale;
    ty = sy - wy * scale;
    onChange();
  }

  /** Set absolute zoom centered on the middle of the viewport. */
  function zoomToCenter(factor) {
    zoomAt(viewW / 2, viewH / 2, factor);
  }

  function getScale() {
    return scale;
  }

  function getTransform() {
    return { scale, tx, ty };
  }

  /** Restore a previously captured camera (used around the PDF snapshot). */
  function setTransform(t) {
    scale = clampScale(t.scale);
    tx = t.tx;
    ty = t.ty;
    onChange();
  }

  /**
   * Fit a world-space rectangle (e.g. the active page bounds) into the
   * viewport with a margin, and center it.
   */
  function fitToRect(rectW, rectH, margin = 48) {
    if (!viewW || !viewH || !rectW || !rectH) return;
    const sx = (viewW - margin * 2) / rectW;
    const sy = (viewH - margin * 2) / rectH;
    scale = clampScale(Math.min(sx, sy));
    tx = (viewW - rectW * scale) / 2;
    ty = (viewH - rectH * scale) / 2;
    onChange();
  }

  /** Fit the currently active page (if any) into view. */
  function fitToScreen() {
    const page = App.state.getActivePage();
    if (page) fitToRect(page.width, page.height);
  }

  return {
    addChangeListener,
    setViewSize,
    getViewSize,
    screenToWorld,
    worldToScreen,
    panBy,
    zoomAt,
    zoomToCenter,
    fitToRect,
    fitToScreen,
    getScale,
    getTransform,
    setTransform,
    MIN_SCALE,
    MAX_SCALE,
  };
})();
