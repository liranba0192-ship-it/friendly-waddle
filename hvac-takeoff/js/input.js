"use strict";
/*
 * App.input — pointer/wheel/touch handling for pan & zoom.
 *
 * Uses Pointer Events so mouse, pen and touch share one code path:
 *   - one active pointer dragging  -> pan
 *   - two active pointers          -> pinch zoom about the gesture midpoint
 *   - wheel / trackpad             -> zoom toward the cursor (ctrl/⌘ = pinch on
 *                                     trackpads; plain wheel also zooms here,
 *                                     which is the expected feel for a canvas)
 *
 * All coordinates are converted to canvas CSS pixels (clientX - rect.left)
 * before being handed to the viewport, so mapping stays correct no matter where
 * the canvas sits or what the zoom/pan currently is.
 */
window.App = window.App || {};

App.input = (function () {
  let canvas = null;
  const pointers = new Map(); // pointerId -> { x, y } in canvas CSS px
  let lastPinchDist = 0;

  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pinchMid() {
    const pts = [...pointers.values()];
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  function pinchDist() {
    const pts = [...pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function scaleMode() {
    return App.state.getTool() === "scale";
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, toLocal(e));

    if (scaleMode() && pointers.size === 1) {
      // start drawing a calibration reference line (no panning in scale mode)
      const local = pointers.get(e.pointerId);
      App.scale.begin(App.viewport.screenToWorld(local.x, local.y));
      return;
    }
    if (pointers.size === 2) {
      // a pinch overrides any in-progress scale line
      if (App.scale.isDrawing()) App.scale.cancelDrawing();
      lastPinchDist = pinchDist();
    } else {
      canvas.classList.add("is-grabbing");
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = toLocal(e);
    pointers.set(e.pointerId, cur);

    if (App.scale.isDrawing() && pointers.size === 1) {
      App.scale.update(App.viewport.screenToWorld(cur.x, cur.y));
      return;
    }

    if (pointers.size === 1) {
      // panning is disabled while the Set Scale tool is active
      if (scaleMode()) return;
      // pan by the movement of the single pointer
      App.viewport.panBy(cur.x - prev.x, cur.y - prev.y);
    } else if (pointers.size === 2) {
      // pinch zoom about the midpoint
      const dist = pinchDist();
      if (lastPinchDist > 0) {
        const mid = pinchMid();
        App.viewport.zoomAt(mid.x, mid.y, dist / lastPinchDist);
      }
      lastPinchDist = dist;
    }
  }

  function endPointer(e) {
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    const wasDrawing = App.scale.isDrawing();
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
    if (pointers.size === 0) canvas.classList.remove("is-grabbing");

    // finish the calibration line once the (last) pointer lifts
    if (wasDrawing && pointers.size === 0) App.scale.finish();
  }

  function onWheel(e) {
    e.preventDefault();
    const { x, y } = toLocal(e);
    // normalize deltaMode (lines vs pixels) and keep zoom feel consistent
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    const delta = e.deltaY * unit;
    // exponential mapping → smooth, symmetric zoom in/out
    const factor = Math.exp(-delta * 0.0015);
    App.viewport.zoomAt(x, y, factor);
  }

  function init(canvasEl) {
    canvas = canvasEl;
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", endPointer);
    // passive:false so preventDefault stops the page from scrolling/zooming
    canvas.addEventListener("wheel", onWheel, { passive: false });
  }

  return { init };
})();
