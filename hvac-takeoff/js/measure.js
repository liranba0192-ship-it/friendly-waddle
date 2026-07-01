"use strict";
/*
 * App.measure — general-purpose on-canvas ruler (the "Measure" tool).
 *
 * With the tool active, the user clicks sequential points to trace an open
 * polyline along a wall/duct run. Each new segment snaps to the nearest
 * orthogonal (horizontal/vertical) direction relative to the previous point,
 * mirroring real-world duct/pipe runs. Finishing (double-click, Enter, or
 * switching tools) commits the measurement with its total real-world length.
 *
 * Unlike App.routing's asset-to-asset pipe routes, measurements are a free
 * reference tool for the technician (e.g. "how long is this wall?") and are
 * NOT priced items in the materials takeoff.
 */
window.App = window.App || {};

App.measure = (function () {
  let draft = null; // { points: [{x,y}...], preview: {x,y}|null }

  // ---- geometry -------------------------------------------------------------
  function lengthWorld(points) {
    let s = 0;
    for (let i = 1; i < points.length; i++) {
      s += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return s;
  }

  /** Total length in meters, or null if the drawing isn't calibrated. */
  function lengthMeters(measurement) {
    const ppm = App.state.getPixelsPerMeter();
    if (!ppm) return null;
    return lengthWorld(measurement.points) / ppm;
  }

  /** Snap `to` orthogonally relative to `from`: pure horizontal or vertical. */
  function snapOrtho(from, to) {
    if (!from) return { x: to.x, y: to.y };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.abs(dx) >= Math.abs(dy) ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  }

  /** World point at half the total path length — where the length badge sits. */
  function midpoint(points) {
    const total = lengthWorld(points);
    if (total === 0) return points[0];
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      const segLen = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (acc + segLen >= total / 2) {
        const t = (total / 2 - acc) / segLen;
        return {
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
        };
      }
      acc += segLen;
    }
    return points[points.length - 1];
  }

  // ---- drawing interaction (called by input.js) ------------------------------
  function start() {
    draft = { points: [], preview: null };
    App.renderer.markDirty();
  }

  function isActive() {
    return !!draft;
  }

  function updatePreview(world) {
    if (!draft) return;
    const last = draft.points[draft.points.length - 1];
    draft.preview = snapOrtho(last, world);
    App.renderer.markDirty();
  }

  /** Add a vertex (orthogonally snapped relative to the previous one). */
  function addPoint(world) {
    if (!draft) return;
    const last = draft.points[draft.points.length - 1];
    const snapped = snapOrtho(last, world);
    // ignore a duplicate click on the same spot as the last vertex
    if (last && Math.hypot(snapped.x - last.x, snapped.y - last.y) < 1e-6) return;
    draft.points.push(snapped);
    draft.preview = null;
    App.renderer.markDirty();
  }

  /** Finish the measurement (needs at least 2 points to form a segment). */
  function finish() {
    if (!draft) return;
    if (draft.points.length < 2) {
      cancelDraft();
      return;
    }
    const points = draft.points.slice();
    draft = null;
    App.state.addMeasurement({
      label: "מדידה " + (App.state.getMeasurements().length + 1),
      points,
    });
    App.renderer.markDirty();
    // stay in the tool to keep taking measurements
    if (App.state.getTool() === "measure") start();
  }

  /** Discard the in-progress draft (Escape / tool switch) without saving. */
  function cancelDraft() {
    if (!draft) return;
    draft = null;
    App.renderer.markDirty();
  }

  /** Exposed for the renderer: the in-progress draft, or null. */
  function getDraft() {
    if (!draft) return null;
    return { points: draft.points, preview: draft.preview };
  }

  return {
    start,
    isActive,
    addPoint,
    updatePreview,
    finish,
    cancelDraft,
    getDraft,
    lengthWorld,
    lengthMeters,
    midpoint,
  };
})();
