"use strict";
/*
 * App.rooms — polygon room/zone mapping.
 *
 * With the "Add Room" tool active, the user clicks sequential points to trace a
 * polygon. Clicking back near the first point snap-closes it and opens an inline
 * name field (+ zone-type chips). Finalized rooms live in App.state.rooms (world
 * coordinates) and are rendered by the renderer with a translucent, zone-colored
 * fill and a centroid-anchored label. Area is derived from the polygon via the
 * shoelace formula and the scale calibration.
 *
 * This module owns: the in-progress draft, the pending (closed, awaiting name)
 * polygon, pure geometry helpers (area / centroid / point-in-polygon), and the
 * naming popup. Drawing is rendered by renderer.js; pointer events arrive from
 * input.js.
 */
window.App = window.App || {};

App.rooms = (function () {
  // screen-pixel radius for snapping the closing click onto the start vertex
  const CLOSE_RADIUS = 14;

  // zone types -> color (fills are drawn at 20% opacity, strokes at full)
  const ZONES = [
    { id: "living", label: "מגורים", color: "#0ea5e9" }, // sky
    { id: "bedroom", label: "שינה", color: "#a78bfa" }, // violet
    { id: "shelter", label: 'ממ"ד', color: "#f43f5e" }, // rose
    { id: "kitchen", label: "מטבח", color: "#f59e0b" }, // amber
    { id: "bath", label: "שירותים", color: "#14b8a6" }, // teal
    { id: "general", label: "כללי", color: "#10b981" }, // emerald
  ];

  // in-progress polyline (world points) + live cursor preview (world point)
  let draft = null; // { points: [{x,y}...], preview: {x,y}|null }
  // closed polygon awaiting a name { points, zoneId }
  let pending = null;

  const p = {}; // popup elements (lazy)

  // ---- pure geometry ------------------------------------------------------
  /** Signed-doubled area via shoelace; abs gives polygon area in world units². */
  function polygonArea(points) {
    let s = 0;
    for (let i = 0, n = points.length; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }

  /** Area-weighted polygon centroid; falls back to vertex average if degenerate. */
  function centroid(points) {
    let s = 0, cx = 0, cy = 0;
    for (let i = 0, n = points.length; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const cross = a.x * b.y - b.x * a.y;
      s += cross;
      cx += (a.x + b.x) * cross;
      cy += (a.y + b.y) * cross;
    }
    if (Math.abs(s) < 1e-6) {
      // degenerate (collinear / zero area) — average the vertices
      const avg = points.reduce((m, q) => ({ x: m.x + q.x, y: m.y + q.y }), { x: 0, y: 0 });
      return { x: avg.x / points.length, y: avg.y / points.length };
    }
    s *= 3;
    return { x: cx / s, y: cy / s };
  }

  /** Ray-casting point-in-polygon test (world coordinates). */
  function pointInPolygon(pt, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      const intersect =
        a.y > pt.y !== b.y > pt.y &&
        pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /** Real-world area in m² for a room, or null if not calibrated. */
  function areaM2(room) {
    const ppm = App.state.getPixelsPerMeter();
    if (!ppm) return null;
    return polygonArea(room.points) / (ppm * ppm);
  }

  // ---- cooling-load (BTU) estimation -------------------------------------
  // Residential baseline for Israel's climate: ~650 BTU/h per m² (≈180 W/m²).
  const BTU_PER_M2 = 650;
  // Israeli "כוח סוס" (כ"ס) AC rating ≈ 2,000 kcal/h ≈ 7,931 BTU/h.
  const BTU_PER_HP = 7931;
  // Above this load a single hi-wall is undersized → recommend a mini-central.
  const MINI_CENTRAL_BTU = 24000;

  /** Recommended cooling for an area (m²): { btu, hp, unitType } or null. */
  function coolingFor(area) {
    if (area == null || !isFinite(area) || area <= 0) return null;
    const btu = Math.round((area * BTU_PER_M2) / 50) * 50; // nearest 50 BTU
    const hp = btu / BTU_PER_HP;
    const unitType = btu >= MINI_CENTRAL_BTU ? "mini_central" : "hiwall";
    return { btu, hp, unitType };
  }

  /** Human-readable recommendation, e.g. '7,800 BTU / 1.0 כ"ס', or null. */
  function coolingText(area) {
    const c = coolingFor(area);
    if (!c) return null;
    return c.btu.toLocaleString("he-IL") + ' BTU / ' + c.hp.toFixed(1) + ' כ"ס';
  }

  function recommendedUnitType(area) {
    const c = coolingFor(area);
    return c ? c.unitType : "hiwall";
  }

  /** Arm (highlight) the recommended indoor unit in the asset tray. */
  function applyRecommendedUnit(area) {
    const type = recommendedUnitType(area);
    App.routing.armAsset(type);
    const def = App.routing.getAssetDef(type);
    App.ui && App.ui.toast && App.ui.toast(
      "יחידה מומלצת: " + (def ? def.label : type) + " — הקש על השרטוט למיקום"
    );
  }

  /** Topmost room (last drawn) whose polygon contains the world point. */
  function roomAt(world) {
    const rooms = App.state.getRooms();
    for (let i = rooms.length - 1; i >= 0; i--) {
      if (pointInPolygon(world, rooms[i].points)) return rooms[i];
    }
    return null;
  }

  // ---- drawing interaction (called by input.js) --------------------------
  function start() {
    draft = { points: [], preview: null };
    pending = null;
    App.renderer.markDirty();
  }

  function isActive() {
    return !!draft;
  }

  function updatePreview(world) {
    if (!draft) return;
    draft.preview = world;
    App.renderer.markDirty();
  }

  /** Is the cursor near the start vertex (so a click would close the polygon)? */
  function previewNearStart() {
    if (!draft || draft.points.length < 3 || !draft.preview) return false;
    const a = App.viewport.worldToScreen(draft.points[0].x, draft.points[0].y);
    const b = App.viewport.worldToScreen(draft.preview.x, draft.preview.y);
    return Math.hypot(a.x - b.x, b.y - a.y) < CLOSE_RADIUS;
  }

  /** Add a vertex (or close the polygon if the click lands near the start). */
  function addPoint(world) {
    if (!draft) return;
    const pts = draft.points;
    if (pts.length >= 3) {
      const startScreen = App.viewport.worldToScreen(pts[0].x, pts[0].y);
      const clickScreen = App.viewport.worldToScreen(world.x, world.y);
      if (Math.hypot(startScreen.x - clickScreen.x, startScreen.y - clickScreen.y) < CLOSE_RADIUS) {
        close();
        return;
      }
    }
    // ignore a duplicate click on the immediately previous vertex
    const last = pts[pts.length - 1];
    if (last) {
      const ls = App.viewport.worldToScreen(last.x, last.y);
      const cs = App.viewport.worldToScreen(world.x, world.y);
      if (Math.hypot(ls.x - cs.x, ls.y - cs.y) < 3) return;
    }
    pts.push({ x: world.x, y: world.y });
    App.renderer.markDirty();
  }

  function close() {
    if (!draft || draft.points.length < 3) return;
    pending = { points: draft.points.slice(), zoneId: ZONES[0].id };
    draft = null;
    App.renderer.markDirty();
    openPopup();
  }

  /** Cancel the in-progress draft (Escape / tool switch). */
  function cancelDraft() {
    if (!draft) return;
    draft = null;
    App.renderer.markDirty();
  }

  // exposed for the renderer
  function getDraft() {
    if (!draft) return null;
    return { points: draft.points, preview: draft.preview, nearStart: previewNearStart() };
  }
  function getPending() {
    if (!pending) return null;
    const zone = ZONES.find((z) => z.id === pending.zoneId) || ZONES[0];
    return { points: pending.points, color: zone.color };
  }
  function getZones() {
    return ZONES;
  }

  // ---- naming popup -------------------------------------------------------
  function cachePopup() {
    if (p.root) return;
    p.root = document.getElementById("room-popup");
    p.input = document.getElementById("room-name-input");
    p.chips = document.getElementById("room-zone-chips");
    p.confirm = document.getElementById("room-confirm");
    p.cancel = document.getElementById("room-cancel");
    p.reco = document.getElementById("room-reco");
    p.recoText = document.getElementById("room-reco-text");
    p.applyUnit = document.getElementById("room-apply-unit");

    p.applyUnit.addEventListener("click", () => {
      const area = pending ? areaM2({ points: pending.points }) : null;
      confirmPopup(); // save the room first (current/default name), then arm the unit
      applyRecommendedUnit(area);
    });

    // build zone chips once
    ZONES.forEach((z) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "zone-chip";
      chip.dataset.zone = z.id;
      chip.style.setProperty("--zone", z.color);
      chip.innerHTML = `<span class="zone-dot"></span>${z.label}`;
      chip.addEventListener("click", () => selectZone(z.id));
      p.chips.appendChild(chip);
    });

    p.confirm.addEventListener("click", confirmPopup);
    p.cancel.addEventListener("click", cancelPopup);
    p.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirmPopup(); }
      else if (e.key === "Escape") { e.preventDefault(); cancelPopup(); }
    });
  }

  function selectZone(zoneId) {
    if (!pending) return;
    pending.zoneId = zoneId;
    [...p.chips.children].forEach((c) =>
      c.classList.toggle("is-active", c.dataset.zone === zoneId)
    );
    App.renderer.markDirty();
  }

  function positionPopup() {
    const c = centroid(pending.points);
    const s = App.viewport.worldToScreen(c.x, c.y);
    const stage = document.getElementById("stage");
    const rect = stage.getBoundingClientRect();
    // clamp within the stage so the popup never spills offscreen
    const pw = 248, ph = 150;
    const x = Math.max(8, Math.min(rect.width - pw - 8, s.x - pw / 2));
    const y = Math.max(8, Math.min(rect.height - ph - 8, s.y - ph / 2));
    p.root.style.left = x + "px";
    p.root.style.top = y + "px";
  }

  function openPopup() {
    cachePopup();
    p.input.value = "";
    selectZone(pending.zoneId);
    updateReco();
    positionPopup();
    p.root.classList.add("is-open");
    requestAnimationFrame(() => p.input.focus());
  }

  /** Refresh the cooling-load recommendation shown inside the popup. */
  function updateReco() {
    const area = areaM2({ points: pending.points });
    const text = coolingText(area);
    if (area != null && text) {
      p.recoText.innerHTML =
        'שטח: <b>' + area.toFixed(1) + ' מ"ר</b> · תפוקה מומלצת: <b>' + text + "</b>";
      p.applyUnit.classList.remove("hidden");
    } else {
      p.recoText.textContent = 'כייל קנה מידה לחישוב התפוקה המומלצת';
      p.applyUnit.classList.add("hidden");
    }
  }

  function confirmPopup() {
    if (!pending) return;
    const zone = ZONES.find((z) => z.id === pending.zoneId) || ZONES[0];
    const name =
      (p.input.value || "").trim() ||
      "חדר " + (App.state.getRooms().length + 1); // graceful default
    const room = App.state.addRoom({
      name,
      zoneId: zone.id,
      color: zone.color,
      points: pending.points,
    });
    pending = null;
    p.root.classList.remove("is-open");
    App.state.setSelectedRoom(room.id);
    // stay in the room tool — begin a fresh draft so the next room can be drawn
    if (App.state.getTool() === "room") start();
    else App.renderer.markDirty();
  }

  function cancelPopup() {
    pending = null;
    if (p.root) p.root.classList.remove("is-open");
    // keep mapping: restart a draft if still in the room tool
    if (App.state.getTool() === "room") start();
    else App.renderer.markDirty();
  }

  return {
    start,
    isActive,
    addPoint,
    updatePreview,
    cancelDraft,
    getDraft,
    getPending,
    getZones,
    // geometry
    polygonArea,
    centroid,
    pointInPolygon,
    areaM2,
    roomAt,
    // cooling-load estimation
    coolingFor,
    coolingText,
    recommendedUnitType,
    applyRecommendedUnit,
  };
})();
