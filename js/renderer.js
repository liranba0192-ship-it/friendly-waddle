"use strict";
/*
 * App.renderer — DPR-aware HTML5 Canvas 2D render loop.
 *
 * A single requestAnimationFrame loop runs continuously but only repaints when
 * a `dirty` flag is set (by viewport/state changes or resize). Idle frames cost
 * almost nothing; during interaction every change paints on the next frame, so
 * we get smooth 60fps without redrawing needlessly.
 *
 * Crispness: the backing store is sized to cssPixels * devicePixelRatio, and we
 * reset the base transform to (dpr,0,0,dpr,0,0) each frame, then layer the
 * camera transform on top via the viewport.
 */
window.App = window.App || {};

App.renderer = (function () {
  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let dirty = true;
  let running = false;

  // grid appearance (world background under the blueprint)
  const GRID_SIZE = 100; // world units between major grid lines

  function markDirty() {
    dirty = true;
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const needW = Math.round(cssW * dpr);
    const needH = Math.round(cssH * dpr);
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }
    App.viewport.setViewSize(cssW, cssH);
    markDirty();
  }

  function clear(cssW, cssH) {
    // dark slate workspace backdrop
    ctx.fillStyle = "#0b0f17";
    ctx.fillRect(0, 0, cssW, cssH);
  }

  /** Draw a subtle grid that scrolls/scales with the camera. */
  function drawGrid(cssW, cssH) {
    const { scale } = App.viewport.getTransform();
    const step = GRID_SIZE * scale;
    if (step < 8) return; // too dense to be useful — skip
    // world coords of the top-left corner of the viewport
    const tl = App.viewport.screenToWorld(0, 0);
    const startX = Math.floor(tl.x / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(tl.y / GRID_SIZE) * GRID_SIZE;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(148,163,184,0.08)"; // slate-400 @ low alpha
    ctx.beginPath();
    for (let wx = startX; ; wx += GRID_SIZE) {
      const s = App.viewport.worldToScreen(wx, 0).x;
      if (s > cssW) break;
      ctx.moveTo(Math.round(s) + 0.5, 0);
      ctx.lineTo(Math.round(s) + 0.5, cssH);
    }
    for (let wy = startY; ; wy += GRID_SIZE) {
      const s = App.viewport.worldToScreen(0, wy).y;
      if (s > cssH) break;
      ctx.moveTo(0, Math.round(s) + 0.5);
      ctx.lineTo(cssW, Math.round(s) + 0.5);
    }
    ctx.stroke();
  }

  /** Draw the active blueprint page in world space. */
  function drawPage() {
    const page = App.state.getActivePage();
    if (!page) return;
    const { scale, tx, ty } = App.viewport.getTransform();

    ctx.save();
    // map world -> css pixels (note: ctx already has the dpr base transform)
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    // page shadow + white sheet behind the rendered bitmap
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 24 / scale;
    ctx.shadowOffsetY = 8 / scale;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.restore();

    // crisp scaling for the blueprint raster
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(page.bitmap, 0, 0, page.width, page.height);

    // thin page border
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = "rgba(15,23,42,0.35)";
    ctx.strokeRect(0, 0, page.width, page.height);
    ctx.restore();
  }

  function frame() {
    if (!running) return;
    if (dirty) {
      dirty = false;
      const { width: cssW, height: cssH } = App.viewport.getViewSize();
      // base transform: device pixels, then everything is authored in CSS px
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      clear(cssW, cssH);
      drawGrid(cssW, cssH);
      drawPage();
    }
    requestAnimationFrame(frame);
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d", { alpha: false });
    App.viewport.addChangeListener(markDirty);
    App.state.on("page:changed", markDirty);
    App.state.on("document:changed", markDirty);

    // keep the backing store sized to the element
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(canvas);
    }
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    resize();
    running = true;
    requestAnimationFrame(frame);
  }

  return { init, markDirty, resize };
})();
