"use strict";
/*
 * App.routing — HVAC asset placement + smart orthogonal (90°) pipe/duct routing.
 *
 * Workflow:
 *  - Asset tray arms a type (condenser / hi-wall / mini-central / VRF box); a
 *    tap on the canvas places it at world coordinates.
 *  - "Draw Route" arms a line type (liquid / suction / drainage / flex duct).
 *    Tapping asset A then asset B generates a clean right-angled (Manhattan)
 *    path between their anchors.
 *  - Every path corner gets a draggable circular handle so the technician can
 *    nudge the route around walls; the geometry/length update live.
 *
 * Geometry helpers (manhattanPath, length, hit-tests) are pure-ish and reused
 * by the renderer (drawing) and input.js (interaction). Lengths convert to
 * meters via the global scale ratio (App.state.getPixelsPerMeter()).
 */
window.App = window.App || {};

App.routing = (function () {
  const ASSET_HIT = 24; // screen-px radius to grab/place onto an asset
  const HANDLE_HIT = 13; // screen-px radius to grab a route handle
  const ASSET_SIZE = 34; // on-screen px size assets are drawn at

  // Asset catalogue — professional HVAC blueprint components.
  const ASSETS = {
    condenser: { label: "מעבה", color: "#38bdf8" }, // outdoor condensing unit
    hiwall: { label: "מאייד עילי", color: "#2dd4bf" }, // indoor hi-wall evaporator
    mini_central: { label: "מיני מרכזי", color: "#818cf8" }, // ducted mini-central
    vrf_box: { label: "מפצל VRF", color: "#fbbf24" }, // VRF branch box
  };

  // Refrigerant/condensate/duct line conventions — distinct color + stroke.
  const LINE_TYPES = {
    liquid: { label: "צינור נוזל", color: "#f59e0b", width: 2, dash: [] },
    suction: { label: "צינור גז", color: "#3b82f6", width: 3.5, dash: [] },
    drain: { label: "ניקוז", color: "#22c55e", width: 2, dash: [7, 5] },
    flex: { label: "תעלה גמישה", color: "#cbd5e1", width: 6, dash: [2, 7] },
  };

  // Standard copper-pipe diameters per refrigerant line (liquid vs. suction/gas).
  const DIAMETERS = {
    liquid: ['1/4"', '3/8"'],
    suction: ['1/2"', '5/8"', '3/4"'],
  };
  // currently-selected diameter per sized line type
  const sizeByType = { liquid: '3/8"', suction: '5/8"' };

  let pendingAssetType = null; // armed for placement
  let lineType = "liquid"; // armed route line type
  let startAssetId = null; // first asset chosen for a route
  let drag = null; // { routeId, index } — handle being dragged

  // ---- catalogue accessors ----
  function getAssetDefs() {
    return ASSETS;
  }
  function getAssetDef(type) {
    return ASSETS[type] || null;
  }
  function getLineTypes() {
    return LINE_TYPES;
  }
  function getLineDef(id) {
    return LINE_TYPES[id] || LINE_TYPES.liquid;
  }
  function assetSize() {
    return ASSET_SIZE;
  }

  // ---- arming / tool sync ----
  function armAsset(type) {
    if (!ASSETS[type]) return;
    pendingAssetType = type;
    startAssetId = null;
    App.state.setTool("asset");
    App.renderer.markDirty();
  }
  function getPendingAssetType() {
    return pendingAssetType;
  }
  function setLineType(id) {
    if (!LINE_TYPES[id]) return;
    lineType = id;
    startAssetId = null;
    App.state.setTool("route");
    App.renderer.markDirty();
  }
  function getLineType() {
    return lineType;
  }
  function getStartAssetId() {
    return startAssetId;
  }

  // ---- pipe diameters -----------------------------------------------------
  function getDiameters(type) {
    return DIAMETERS[type] || null;
  }
  /** Selected diameter for the active line type, or null for unsized types. */
  function getLineSize() {
    return DIAMETERS[lineType] ? sizeByType[lineType] : null;
  }
  function setLineSize(size) {
    if (DIAMETERS[lineType] && DIAMETERS[lineType].includes(size)) {
      sizeByType[lineType] = size;
      App.renderer.markDirty();
    }
  }

  /** BOM/registry label, distinguishing copper pipes by gas/liquid + diameter. */
  function routeLabel(route) {
    const def = getLineDef(route.lineType);
    if (route.lineType === "liquid") return 'צינור נחושת ' + route.size + ' (נוזל)';
    if (route.lineType === "suction") return 'צינור נחושת ' + route.size + ' (גז)';
    return def.label; // drain / flex — unsized
  }
  /** Stable aggregation key grouping by line type AND diameter. */
  function routeKey(route) {
    return "route:" + route.lineType + (route.size ? ":" + route.size : "");
  }

  /** Keep transient selections consistent when the active tool changes. */
  function syncTool(tool) {
    if (tool !== "asset") pendingAssetType = null;
    if (tool !== "route") startAssetId = null;
    if (tool !== "route") drag = null;
    App.renderer.markDirty();
  }

  function cancel() {
    pendingAssetType = null;
    startAssetId = null;
    drag = null;
    App.renderer.markDirty();
  }

  // ---- hit testing (screen space) ----
  function assetAt(world) {
    const assets = App.state.getAssets();
    const c = App.viewport.worldToScreen(world.x, world.y);
    let best = null,
      bestD = ASSET_HIT;
    assets.forEach((a) => {
      const s = App.viewport.worldToScreen(a.x, a.y);
      const d = Math.hypot(s.x - c.x, s.y - c.y);
      if (d <= bestD) {
        bestD = d;
        best = a;
      }
    });
    return best;
  }

  function handleAt(world) {
    const routes = App.state.getRoutes();
    const c = App.viewport.worldToScreen(world.x, world.y);
    let best = null,
      bestD = HANDLE_HIT;
    routes.forEach((r) => {
      r.points.forEach((p, index) => {
        const s = App.viewport.worldToScreen(p.x, p.y);
        const d = Math.hypot(s.x - c.x, s.y - c.y);
        if (d <= bestD) {
          bestD = d;
          best = { routeId: r.id, index };
        }
      });
    });
    return best;
  }

  // ---- placement ----
  function placeAsset(world) {
    if (!pendingAssetType) return null;
    return App.state.addAsset({ type: pendingAssetType, x: world.x, y: world.y });
  }

  // ---- route building ----
  /** A canvas tap while routing: pick start asset, then connect to a second. */
  function connectTap(world) {
    const a = assetAt(world);
    if (!a) {
      App.ui && App.ui.toast && App.ui.toast("בחר רכיב מותקן (מעבה / מאייד...)");
      return;
    }
    if (!startAssetId) {
      startAssetId = a.id;
      App.renderer.markDirty();
      App.ui && App.ui.toast && App.ui.toast("כעת בחר את הרכיב השני לחיבור");
      return;
    }
    if (a.id === startAssetId) return; // need two distinct assets
    const from = App.state.getAsset(startAssetId);
    const to = a;
    if (from && to) {
      const points = manhattanPath(from, to);
      App.state.addRoute({
        lineType,
        size: getLineSize(), // null for drain/flex
        points,
        fromAssetId: from.id,
        toAssetId: to.id,
      });
    }
    startAssetId = null;
  }

  // ---- handle dragging ----
  function beginDrag(world) {
    const h = handleAt(world);
    if (h) drag = h;
    return !!drag;
  }
  function isDragging() {
    return !!drag;
  }
  function dragTo(world) {
    if (!drag) return;
    const route = App.state.getRoutes().find((r) => r.id === drag.routeId);
    if (!route) return;
    route.points[drag.index] = { x: world.x, y: world.y };
    App.renderer.markDirty();
  }
  function endDrag() {
    if (!drag) return;
    drag = null;
    App.state.touchRoutes(); // refresh the registry length readout
  }

  // ---- geometry ----
  /** Right-angled L-path between two anchors; straight if already aligned. */
  function manhattanPath(a, b) {
    const EPS = 1e-3;
    if (Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS) {
      return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    }
    // horizontal-first elbow
    return [
      { x: a.x, y: a.y },
      { x: b.x, y: a.y },
      { x: b.x, y: b.y },
    ];
  }

  function lengthWorld(points) {
    let s = 0;
    for (let i = 1; i < points.length; i++) {
      s += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return s;
  }

  /** Route length in meters, or null if not calibrated. */
  function lengthMeters(route) {
    const ppm = App.state.getPixelsPerMeter();
    if (!ppm) return null;
    return lengthWorld(route.points) / ppm;
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

  return {
    getAssetDefs,
    getAssetDef,
    getLineTypes,
    getLineDef,
    assetSize,
    armAsset,
    getPendingAssetType,
    setLineType,
    getLineType,
    getStartAssetId,
    getDiameters,
    getLineSize,
    setLineSize,
    routeLabel,
    routeKey,
    syncTool,
    cancel,
    assetAt,
    handleAt,
    placeAsset,
    connectTap,
    beginDrag,
    isDragging,
    dragTo,
    endDrag,
    manhattanPath,
    lengthWorld,
    lengthMeters,
    midpoint,
  };
})();
