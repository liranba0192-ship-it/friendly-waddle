"use strict";
/*
 * App.input — pointer/wheel/touch handling, tool-aware.
 *
 * Pointer Events unify mouse, pen and touch. Behaviour depends on the active
 * tool (App.state.getTool()):
 *   - "pan"   : drag pans; a click (no drag) selects/deselects a room; moving
 *               with no button hovers-highlights rooms.
 *   - "scale" : drag draws the calibration reference line (no panning).
 *   - "room"  : moving updates the rubber-band preview; a click adds a polygon
 *               vertex (or snap-closes near the start).
 * Two pointers always pinch-zoom; the wheel/trackpad always zooms to cursor.
 *
 * Coordinates are converted to canvas CSS pixels (clientX - rect.left) before
 * being handed to the viewport, so mapping stays correct at any zoom/pan.
 */
window.App = window.App || {};

App.input = (function () {
  const CLICK_SLOP = 6; // px of movement below which a press counts as a click

  let canvas = null;
  const pointers = new Map(); // pointerId -> { x, y } in canvas CSS px
  let lastPinchDist = 0;
  // primary press tracking for click-vs-drag discrimination
  let press = null; // { id, x, y, moved }

  function tool() {
    return App.state.getTool();
  }

  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function worldOf(local) {
    return App.viewport.screenToWorld(local.x, local.y);
  }

  function pinchMid() {
    const pts = [...pointers.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }
  function pinchDist() {
    const pts = [...pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  // ---- press (button down) ----
  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    const local = toLocal(e);
    pointers.set(e.pointerId, local);

    if (pointers.size === 2) {
      // a second finger starts a pinch; cancel any single-pointer gesture
      if (App.scale.isDrawing()) App.scale.cancelDrawing();
      if (press) press.moved = true; // don't treat as a click on release
      lastPinchDist = pinchDist();
      canvas.classList.remove("is-grabbing");
      return;
    }

    press = { id: e.pointerId, x: local.x, y: local.y, moved: false };

    if (tool() === "scale") {
      App.scale.begin(worldOf(local));
    } else if (tool() === "pan") {
      canvas.classList.add("is-grabbing");
    }
    // "room": vertices are added on release (click), preview follows the move
  }

  // ---- move ----
  function onPointerMove(e) {
    const cur = toLocal(e);

    // hovering (no button captured for this pointer)
    if (!pointers.has(e.pointerId)) {
      handleHover(cur);
      return;
    }

    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, cur);

    // track movement for click-vs-drag
    if (press && press.id === e.pointerId) {
      if (Math.hypot(cur.x - press.x, cur.y - press.y) > CLICK_SLOP) press.moved = true;
    }

    if (pointers.size === 2) {
      const dist = pinchDist();
      if (lastPinchDist > 0) App.viewport.zoomAt(pinchMid().x, pinchMid().y, dist / lastPinchDist);
      lastPinchDist = dist;
      return;
    }

    // single-pointer drag
    if (App.scale.isDrawing()) {
      App.scale.update(worldOf(cur));
      return;
    }
    if (tool() === "room" && App.rooms.isActive()) {
      App.rooms.updatePreview(worldOf(cur)); // preview follows touch/drag too
      return;
    }
    if (tool() === "pan") {
      App.state.setHoveredRoom(null); // not hovering while dragging the canvas
      App.viewport.panBy(cur.x - prev.x, cur.y - prev.y);
    }
  }

  /** Mouse hover with no button: update room highlight or room-tool preview. */
  function handleHover(local) {
    const world = worldOf(local);
    if (tool() === "room" && App.rooms.isActive()) {
      App.rooms.updatePreview(world);
      return;
    }
    if (tool() === "pan") {
      const r = App.rooms.roomAt(world);
      App.state.setHoveredRoom(r ? r.id : null);
    }
  }

  // ---- release ----
  function endPointer(e) {
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    const wasDrawing = App.scale.isDrawing();
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
    if (pointers.size === 0) canvas.classList.remove("is-grabbing");

    const isPrimary = press && press.id === e.pointerId;
    const wasClick = isPrimary && !press.moved;
    if (isPrimary) press = null;

    // finish the calibration line once the (last) pointer lifts
    if (wasDrawing && pointers.size === 0) {
      App.scale.finish();
      return;
    }

    if (!wasClick || pointers.size !== 0) return;

    // a clean click (no drag): tool-specific action
    const local = toLocal(e);
    const world = worldOf(local);
    if (tool() === "room") {
      App.rooms.addPoint(world);
    } else if (tool() === "pan") {
      const r = App.rooms.roomAt(world);
      App.state.setSelectedRoom(r ? r.id : null);
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const { x, y } = toLocal(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    const factor = Math.exp(-e.deltaY * unit * 0.0015);
    App.viewport.zoomAt(x, y, factor);
  }

  // ---- keyboard: Escape cancels an in-progress room/scale gesture ----
  function onKeyDown(e) {
    if (e.key === "Escape") {
      if (App.rooms.isActive()) App.rooms.cancelDraft();
    }
  }

  function init(canvasEl) {
    canvas = canvasEl;
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
  }

  return { init };
})();
