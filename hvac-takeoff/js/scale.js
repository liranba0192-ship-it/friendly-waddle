"use strict";
/*
 * App.scale — the scale-calibration engine.
 *
 * Flow: with the "Set Scale" tool active, the user click-drags a reference line
 * across a known dimension on the blueprint. On release we open a modal asking
 * how many meters that line represents, then store
 *     pixelsPerMeter = worldLengthOfLine / meters
 * in App.state. "pixels" here means blueprint world-units (the page's own,
 * zoom-independent coordinate space), so all later measurements are stable
 * regardless of zoom/pan.
 *
 * This module owns: the in-progress/committed reference line (in WORLD coords,
 * read by the renderer), the calibration modal, and the "nice" ruler math used
 * by the on-screen scale bar.
 */
window.App = window.App || {};

App.scale = (function () {
  // Minimum on-screen length (CSS px) for a line to count — guards against
  // accidental clicks / zero-length drags.
  const MIN_SCREEN_LENGTH = 8;

  // reference line state (world coordinates)
  let start = null; // {x,y}
  let end = null; // {x,y}
  let drawing = false; // actively dragging
  let committed = false; // a finished line is being shown (modal open or calibrated)

  // modal elements (looked up lazily on first use)
  const m = {};

  // --- geometry helpers ----------------------------------------------------
  function worldLength() {
    if (!start || !end) return 0;
    return Math.hypot(end.x - start.x, end.y - start.y);
  }

  function screenLength() {
    if (!start || !end) return 0;
    const a = App.viewport.worldToScreen(start.x, start.y);
    const b = App.viewport.worldToScreen(end.x, end.y);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  // --- drawing interaction (called by input.js) ---------------------------
  function begin(world) {
    start = { x: world.x, y: world.y };
    end = { x: world.x, y: world.y };
    drawing = true;
    committed = false;
    App.renderer.markDirty();
  }

  function update(world) {
    if (!drawing) return;
    end = { x: world.x, y: world.y };
    App.renderer.markDirty();
  }

  function finish() {
    if (!drawing) return;
    drawing = false;
    // edge case: zero / near-zero length line — discard gracefully
    if (screenLength() < MIN_SCREEN_LENGTH) {
      reset();
      App.ui && App.ui.toast && App.ui.toast("סמן קו ארוך יותר על מידה ידועה");
      return;
    }
    committed = true;
    App.renderer.markDirty();
    openModal();
  }

  function cancelDrawing() {
    // used when a second pointer starts (pinch) mid-draw
    if (!drawing) return;
    drawing = false;
    reset();
  }

  function reset() {
    start = null;
    end = null;
    drawing = false;
    committed = false;
    App.renderer.markDirty();
  }

  /** Exposed for the renderer: the line to draw, or null. */
  function getLine() {
    if (!start || !end) return null;
    return { start, end, drawing, committed };
  }

  // --- calibration modal ---------------------------------------------------
  function cacheModal() {
    if (m.root) return;
    m.root = document.getElementById("scale-modal");
    m.input = document.getElementById("scale-input");
    m.error = document.getElementById("scale-error");
    m.confirm = document.getElementById("scale-confirm");
    m.cancel = document.getElementById("scale-cancel");
    m.length = document.getElementById("scale-length");

    m.confirm.addEventListener("click", confirmModal);
    m.cancel.addEventListener("click", closeModal);
    m.input.addEventListener("input", () => clearError());
    m.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmModal();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
    });
    // click on backdrop (not the dialog) cancels
    m.root.addEventListener("pointerdown", (e) => {
      if (e.target === m.root) closeModal();
    });
  }

  function openModal() {
    cacheModal();
    clearError();
    m.input.value = "";
    // contextual readout of the drawn length in world units
    m.length.textContent = "אורך הקו: " + Math.round(worldLength()) + " יח׳";
    m.root.classList.add("is-open");
    // focus after the open transition starts
    requestAnimationFrame(() => m.input.focus());
  }

  function closeModal() {
    if (!m.root) return;
    m.root.classList.remove("is-open");
    // discard the uncalibrated reference line if the user backed out
    if (!App.state.isCalibrated()) reset();
    else {
      committed = false; // keep calibration, drop the transient line
      App.renderer.markDirty();
    }
  }

  function clearError() {
    if (!m.error) return;
    m.error.textContent = "";
    m.error.classList.remove("is-visible");
    m.input.classList.remove("is-invalid");
  }

  function showError(msg) {
    m.error.textContent = msg;
    m.error.classList.add("is-visible");
    m.input.classList.add("is-invalid");
  }

  function confirmModal() {
    // accept both "3.5" and "3,5"; ignore stray whitespace
    const raw = (m.input.value || "").trim().replace(",", ".");
    const meters = Number(raw);
    if (raw === "" || !isFinite(meters) || meters <= 0) {
      showError("נא להזין מספר מטרים גדול מאפס");
      m.input.focus();
      return;
    }
    const len = worldLength();
    if (len <= 0) {
      // defensive — finish() already guards this
      closeModal();
      return;
    }
    App.state.setPixelsPerMeter(len / meters);
    m.root.classList.remove("is-open");
    committed = false; // drop the transient red line; ruler now reflects scale
    App.renderer.markDirty();
    App.ui && App.ui.toast && App.ui.toast("קנה המידה הוגדר ✓");
    // return to the pan tool for convenience
    App.state.setTool("pan");
  }

  // --- ruler math (used by the on-screen scale bar) ------------------------
  // Picks a "nice" round number of meters whose on-screen width is close to a
  // target, so the bar grows/shrinks sensibly as the user zooms.
  function computeRuler(viewScale) {
    const ppm = App.state.getPixelsPerMeter();
    if (!ppm || !viewScale) return null;
    const pxPerMeter = ppm * viewScale; // CSS px on screen for 1 meter
    if (!isFinite(pxPerMeter) || pxPerMeter <= 0) return null;

    const TARGET_PX = 130; // desired bar width
    const rawMeters = TARGET_PX / pxPerMeter;
    const pow = Math.pow(10, Math.floor(Math.log10(rawMeters)));
    let meters = pow;
    for (const mult of [1, 2, 5, 10]) {
      if (mult * pow <= rawMeters) meters = mult * pow;
    }
    const widthPx = meters * pxPerMeter;
    return { meters, widthPx, label: formatMeters(meters) };
  }

  function formatMeters(meters) {
    // trim trailing zeros (e.g. 0.5, 1, 2.5, 50)
    const txt = parseFloat(meters.toFixed(2)).toString();
    return txt + " מ׳";
  }

  return {
    begin,
    update,
    finish,
    cancelDrawing,
    reset,
    getLine,
    computeRuler,
    isDrawing: () => drawing,
  };
})();
