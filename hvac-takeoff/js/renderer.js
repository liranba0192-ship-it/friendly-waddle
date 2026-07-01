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

  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function polyPath(points) {
    ctx.beginPath();
    points.forEach((wp, i) => {
      const s = App.viewport.worldToScreen(wp.x, wp.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
  }

  /** Centered name + area label for a finalized room. */
  function drawRoomLabel(room) {
    const c = App.rooms.centroid(room.points);
    const s = App.viewport.worldToScreen(c.x, c.y);
    const area = App.rooms.areaM2(room);
    const areaText = area != null ? area.toFixed(1) + " מ²" : "כייל קנה מידה";

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Heebo, sans-serif";
    ctx.lineJoin = "round";
    // outlined text for legibility over any fill
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(8,11,17,0.85)";
    ctx.strokeText(room.name, s.x, s.y - 8);
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(room.name, s.x, s.y - 8);

    ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Heebo, sans-serif";
    ctx.lineWidth = 3;
    ctx.strokeText(areaText, s.x, s.y + 9);
    ctx.fillStyle = area != null ? "#cbd5e1" : "#fca5a5";
    ctx.fillText(areaText, s.x, s.y + 9);
  }

  /** Draw all finalized rooms, the pending (closed, unnamed) polygon, and the
   *  in-progress draft polyline. Rendered in screen space. */
  function drawRooms() {
    if (!App.rooms) return;
    const rooms = App.state.getRooms();
    const hovered = App.state.getHoveredRoom();
    const selected = App.state.getSelectedRoom();

    ctx.save();
    rooms.forEach((room) => {
      if (room.points.length < 3) return;
      const active = room.id === hovered || room.id === selected;
      polyPath(room.points);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(room.color, active ? 0.35 : 0.2);
      ctx.fill();
      ctx.strokeStyle = room.color;
      ctx.lineWidth = room.id === selected ? 3 : 1.75;
      ctx.stroke();
      drawRoomLabel(room);
    });

    // pending closed polygon (awaiting a name)
    const pending = App.rooms.getPending();
    if (pending && pending.points.length >= 3) {
      polyPath(pending.points);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(pending.color, 0.28);
      ctx.fill();
      ctx.strokeStyle = pending.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // in-progress draft polyline + rubber band
    const draft = App.rooms.getDraft();
    if (draft && draft.points.length) {
      const pts = draft.points.map((wp) => App.viewport.worldToScreen(wp.x, wp.y));
      ctx.beginPath();
      pts.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)));
      if (draft.preview) {
        const pv = App.viewport.worldToScreen(draft.preview.x, draft.preview.y);
        ctx.setLineDash([6, 4]);
        ctx.lineTo(pv.x, pv.y);
      }
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);

      // vertices; highlight the start when a click would close the polygon
      pts.forEach((s, i) => {
        const isStart = i === 0;
        const r = isStart && draft.nearStart ? 7 : 4;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isStart && draft.nearStart ? "#22d3ee" : "#fff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#0ea5e9";
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  // ---- HVAC assets & routes (STEP 4) -------------------------------------
  function pill(text, sx, sy, fg, bg) {
    ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Heebo, sans-serif";
    const padX = 6;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = bg;
    roundRect(sx - tw / 2 - padX, sy - 9, tw + padX * 2, 18, 5);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, sx, sy);
  }

  /** Draw a single asset symbol centered at screen (sx,sy) within a size box. */
  function drawAssetSymbol(type, sx, sy, size, color, highlight) {
    const h = size / 2;
    ctx.save();
    ctx.translate(sx, sy);

    // badge backdrop
    ctx.beginPath();
    roundRect(-h, -h, size, size, 7);
    ctx.fillStyle = highlight ? "rgba(15,23,42,0.98)" : "rgba(15,23,42,0.92)";
    ctx.fill();
    ctx.lineWidth = highlight ? 2.5 : 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const u = size * 0.3; // symbol half-extent

    if (type === "condenser") {
      // outdoor unit: box + fan circle
      ctx.strokeRect(-u, -u * 0.75, u * 2, u * 1.5);
      ctx.beginPath();
      ctx.arc(0, 0, u * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * u * 0.6, Math.sin(a) * u * 0.6);
      }
      ctx.stroke();
    } else if (type === "hiwall") {
      // indoor hi-wall: rounded bar + louver line
      roundRect(-u, -u * 0.5, u * 2, u, u * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-u * 0.7, u * 0.25);
      ctx.lineTo(u * 0.7, u * 0.25);
      ctx.stroke();
    } else if (type === "mini_central") {
      // ducted mini-central: box + two duct arrows
      ctx.strokeRect(-u, -u * 0.6, u * 2, u * 1.2);
      ctx.beginPath();
      ctx.moveTo(-u * 0.4, u * 0.6);
      ctx.lineTo(-u * 0.4, u * 1.05);
      ctx.moveTo(u * 0.4, u * 0.6);
      ctx.lineTo(u * 0.4, u * 1.05);
      ctx.stroke();
    } else if (type === "vrf_box") {
      // VRF branch box: square + branch stubs
      ctx.strokeRect(-u * 0.8, -u * 0.8, u * 1.6, u * 1.6);
      ctx.beginPath();
      ctx.moveTo(0, u * 0.8);
      ctx.lineTo(0, u * 1.1);
      ctx.moveTo(-u * 0.4, u * 1.1);
      ctx.lineTo(u * 0.4, u * 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAssets() {
    if (!App.routing) return;
    const assets = App.state.getAssets();
    const size = App.routing.assetSize();
    const startId = App.routing.getStartAssetId();
    assets.forEach((a) => {
      const def = App.routing.getAssetDef(a.type) || { color: "#94a3b8" };
      const s = App.viewport.worldToScreen(a.x, a.y);
      const isStart = a.id === startId;
      if (isStart) {
        // selection ring for the route's first endpoint
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawAssetSymbol(a.type, s.x, s.y, size, def.color, isStart);
    });
  }

  function drawRoutes() {
    if (!App.routing) return;
    const routes = App.state.getRoutes();
    routes.forEach((r) => {
      if (r.points.length < 2) return;
      const def = App.routing.getLineDef(r.lineType);
      const pts = r.points.map((p) => App.viewport.worldToScreen(p.x, p.y));

      // subtle dark casing for contrast over busy blueprints
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(8,11,17,0.5)";
      ctx.lineWidth = def.width + 3;
      ctx.beginPath();
      pts.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)));
      ctx.stroke();

      // the typed line
      ctx.strokeStyle = def.color;
      ctx.lineWidth = def.width;
      ctx.setLineDash(def.dash || []);
      ctx.beginPath();
      pts.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)));
      ctx.stroke();
      ctx.setLineDash([]);

      // diameter indicator along the longest segment (subtle, rotated)
      if (r.size) drawSizeTag(pts, r.size, def.color);

      // real-time length badge
      const m = App.viewport.worldToScreen(
        App.routing.midpoint(r.points).x,
        App.routing.midpoint(r.points).y
      );
      const meters = App.routing.lengthMeters(r);
      const label = meters != null ? meters.toFixed(2) + " מ׳" : "כייל קנה מידה";
      pill(label, m.x, m.y - 14, "#e5e7eb", "rgba(17,24,39,0.92)");
    });
  }

  /** Pipe-size label drawn along the longest screen segment of a route. */
  function drawSizeTag(pts, size, color) {
    let li = 1, lmax = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (d > lmax) { lmax = d; li = i; }
    }
    if (lmax < 34) return; // too short to label legibly
    const a = pts[li - 1], b = pts[li];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI; // keep upright

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ang);
    ctx.font = "700 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Heebo, sans-serif";
    const tw = ctx.measureText(size).width;
    ctx.fillStyle = "rgba(8,11,17,0.78)";
    roundRect(-tw / 2 - 4, -11 - 9, tw + 8, 15, 4); // offset above the line
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(size, 0, -11 - 1);
    ctx.restore();
  }

  function drawRouteHandles() {
    if (!App.routing) return;
    const routes = App.state.getRoutes();
    routes.forEach((r) => {
      const def = App.routing.getLineDef(r.lineType);
      r.points.forEach((p) => {
        const s = App.viewport.worldToScreen(p.x, p.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = def.color;
        ctx.stroke();
      });
    });
  }

  /** Perpendicular ruler-style tick mark at a polyline endpoint (screen space). */
  function drawTick(sx, sy, angle) {
    const len = 7;
    const nx = -Math.sin(angle), ny = Math.cos(angle); // perpendicular unit vector
    ctx.beginPath();
    ctx.moveTo(sx - nx * len, sy - ny * len);
    ctx.lineTo(sx + nx * len, sy + ny * len);
    ctx.stroke();
  }

  const MEASURE_COLOR = "#facc15"; // amber-400 — distinct from rooms/routes/scale

  /** Draw one measurement polyline (screen space) with end ticks + length badge. */
  function drawMeasureLine(points, { dashed = false } = {}) {
    if (points.length < 2) return;
    const pts = points.map((p) => App.viewport.worldToScreen(p.x, p.y));

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dashed ? [6, 4] : []);
    ctx.strokeStyle = MEASURE_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)));
    ctx.stroke();
    ctx.setLineDash([]);

    // perpendicular tick marks at the two open ends (classic ruler look)
    const startAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const n = pts.length;
    const endAngle = Math.atan2(pts[n - 1].y - pts[n - 2].y, pts[n - 1].x - pts[n - 2].x);
    drawTick(pts[0].x, pts[0].y, startAngle);
    drawTick(pts[n - 1].x, pts[n - 1].y, endAngle);

    // small dots at interior vertices
    for (let i = 1; i < n - 1; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI * 2);
      ctx.fillStyle = MEASURE_COLOR;
      ctx.fill();
    }
  }

  function drawMeasurements() {
    if (!App.measure) return;
    const measurements = App.state.getMeasurements();
    measurements.forEach((m) => {
      drawMeasureLine(m.points);
      const mid = App.viewport.worldToScreen(
        App.measure.midpoint(m.points).x,
        App.measure.midpoint(m.points).y
      );
      const meters = App.measure.lengthMeters(m);
      const label = meters != null ? meters.toFixed(2) + " מ׳" : "כייל קנה מידה";
      pill(label, mid.x, mid.y - 14, "#422006", "rgba(250,204,21,0.92)");
    });

    // in-progress draft with a live rubber-band segment + running length
    const draft = App.measure.getDraft();
    if (draft && draft.points.length) {
      const preview = draft.preview ? draft.points.concat([draft.preview]) : draft.points;
      drawMeasureLine(preview, { dashed: !!draft.preview });

      // vertex dots for every placed point (including the first)
      draft.points.forEach((p) => {
        const s = App.viewport.worldToScreen(p.x, p.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = MEASURE_COLOR;
        ctx.stroke();
      });

      // live running length near the cursor
      if (preview.length >= 2) {
        const lastScreen = App.viewport.worldToScreen(
          preview[preview.length - 1].x,
          preview[preview.length - 1].y
        );
        const ppm = App.state.getPixelsPerMeter();
        const worldLen = App.measure.lengthWorld(preview);
        const label = ppm ? (worldLen / ppm).toFixed(2) + " מ׳" : Math.round(worldLen) + " יח׳";
        pill(label, lastScreen.x, lastScreen.y - 16, "#422006", "rgba(250,204,21,0.92)");
      }
    }
  }

  /**
   * Draw the scale-calibration reference line in SCREEN space (so its width and
   * handles stay constant and crisp at any zoom). World endpoints are projected
   * through the viewport each frame, so the line stays anchored to the blueprint
   * while panning/zooming.
   */
  function drawScaleLine() {
    if (!App.scale) return;
    const line = App.scale.getLine();
    if (!line) return;
    const a = App.viewport.worldToScreen(line.start.x, line.start.y);
    const b = App.viewport.worldToScreen(line.end.x, line.end.y);

    ctx.save();
    ctx.lineCap = "round";
    // soft glow under the line for visibility over busy blueprints
    ctx.strokeStyle = "rgba(239,68,68,0.35)"; // red-500 @ low alpha
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // crisp red vector line
    ctx.strokeStyle = "#ef4444"; // red-500
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // endpoint handles
    [a, b].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ef4444";
      ctx.stroke();
    });

    // live length label at the midpoint
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const worldLen = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
    const ppm = App.state.getPixelsPerMeter();
    const label = ppm
      ? (worldLen / ppm).toFixed(2) + " מ׳"
      : Math.round(worldLen) + " יח׳";
    ctx.font =
      "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Heebo, sans-serif";
    const padX = 6;
    const tw = ctx.measureText(label).width;
    const bx = mid.x - tw / 2 - padX;
    const by = mid.y - 24;
    ctx.fillStyle = "rgba(17,24,39,0.92)";
    roundRect(bx, by, tw + padX * 2, 18, 5);
    ctx.fill();
    ctx.fillStyle = "#fecaca"; // red-200
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(label, mid.x, by + 9);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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
      drawRooms();
      drawRoutes();
      drawAssets();
      drawRouteHandles();
      drawMeasurements();
      drawScaleLine();
    }
    requestAnimationFrame(frame);
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d", { alpha: false });
    App.viewport.addChangeListener(markDirty);
    App.state.on("page:changed", markDirty);
    App.state.on("document:changed", markDirty);
    App.state.on("rooms:changed", markDirty);
    App.state.on("roomhover:changed", markDirty);
    App.state.on("roomselect:changed", markDirty);
    App.state.on("scale:changed", markDirty); // area / length labels switch to m
    App.state.on("assets:changed", markDirty);
    App.state.on("routes:changed", markDirty);
    App.state.on("measurements:changed", markDirty);

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
