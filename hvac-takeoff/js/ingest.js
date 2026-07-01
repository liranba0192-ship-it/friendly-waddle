"use strict";
/*
 * App.ingest — load blueprints from PDF or image files.
 *
 * PDFs are parsed with pdf.js (loaded globally as `pdfjsLib` from the CDN). Each
 * page is rasterized to an offscreen canvas at a DPI chosen for crispness but
 * capped so we never exceed the browser's max canvas dimension. Images (JPG/PNG)
 * are decoded via createImageBitmap. Either way we end up with a uniform list of
 * { bitmap, width, height, label } pushed into App.state.
 */
window.App = window.App || {};

App.ingest = (function () {
  // Target raster resolution for PDF pages. 2x the CSS size of the page at
  // 96dpi gives sharp results when zoomed in, without exploding memory.
  const PDF_RENDER_SCALE = 2.0;
  // Conservative cap; most browsers allow ~16384 but large canvases waste RAM.
  const MAX_DIMENSION = 4096;

  function configureWorker() {
    if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
  }

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error || new Error("file read failed"));
      fr.readAsArrayBuffer(file);
    });
  }

  /** Clamp a render scale so neither dimension exceeds MAX_DIMENSION. */
  function clampRenderScale(baseW, baseH, desiredScale) {
    const w = baseW * desiredScale;
    const h = baseH * desiredScale;
    const over = Math.max(w / MAX_DIMENSION, h / MAX_DIMENSION, 1);
    return desiredScale / over;
  }

  async function loadPdf(file) {
    configureWorker();
    if (!window.pdfjsLib) throw new Error("pdf.js failed to load");
    const buf = await readAsArrayBuffer(file);
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = clampRenderScale(base.width, base.height, PDF_RENDER_SCALE);
      const viewport = page.getViewport({ scale });

      const off = document.createElement("canvas");
      off.width = Math.ceil(viewport.width);
      off.height = Math.ceil(viewport.height);
      const offCtx = off.getContext("2d");
      // white background so transparent PDFs aren't drawn on black
      offCtx.fillStyle = "#ffffff";
      offCtx.fillRect(0, 0, off.width, off.height);
      await page.render({ canvasContext: offCtx, viewport }).promise;

      pages.push({
        bitmap: off,
        // world size = the page's natural (scale 1) size, so measurements later
        // map to the PDF's own coordinate space regardless of render DPI.
        width: base.width,
        height: base.height,
        label: `עמוד ${n}`,
      });
      page.cleanup();
    }
    return pages;
  }

  async function loadImage(file) {
    const bitmap = await createImageBitmap(file);
    return [
      {
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        label: file.name || "תמונה",
      },
    ];
  }

  /** Entry point: detect type, parse, and push into state. */
  async function loadFile(file) {
    if (!file) return;
    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    const isImage =
      /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name || "");

    if (!isPdf && !isImage) {
      App.ui && App.ui.toast && App.ui.toast("פורמט לא נתמך — בחר PDF או תמונה");
      return;
    }

    App.state.setLoading(true);
    try {
      const pages = isPdf ? await loadPdf(file) : await loadImage(file);
      App.state.setDocument(pages, file.name || "");
      // center the first page once layout is settled
      requestAnimationFrame(() => App.viewport.fitToScreen());
    } catch (err) {
      console.error("ingest failed:", err);
      App.ui && App.ui.toast && App.ui.toast("טעינת הקובץ נכשלה");
    } finally {
      App.state.setLoading(false);
    }
  }

  return { loadFile };
})();
