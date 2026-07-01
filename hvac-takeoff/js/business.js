"use strict";
/*
 * App.business — white-label contractor profile (persisted in localStorage).
 *
 * Stores company name, phone, email and an uploaded logo (downscaled to a small
 * data URL). These details persist across sessions and brand the PDF quotation
 * header (see estimate.js). Fields autosave on edit.
 */
window.App = window.App || {};

App.business = (function () {
  const KEY = "hvac:business";
  const LOGO_MAX = 360; // px — cap logo size so it stays small in storage
  const el = {};
  let data = { name: "", phone: "", email: "", logo: "" };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved) data = Object.assign(data, saved);
    } catch (_) {}
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (_) {
      App.ui && App.ui.toast && App.ui.toast("שמירת פרטי העסק נכשלה (אחסון מלא)");
    }
  }

  function get() {
    return Object.assign({}, data);
  }

  // ---- logo handling ------------------------------------------------------
  function downscale(img) {
    let { width: w, height: h } = img;
    if (w > LOGO_MAX || h > LOGO_MAX) {
      const k = LOGO_MAX / Math.max(w, h);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/png");
  }

  function onLogo(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        data.logo = downscale(img);
        save();
        renderLogo();
        App.ui && App.ui.toast && App.ui.toast("הלוגו נשמר ✓");
      };
      img.onerror = () => App.ui && App.ui.toast && App.ui.toast("קובץ לוגו לא תקין");
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function renderLogo() {
    if (data.logo) {
      el.logoPreview.src = data.logo;
      el.logoPreview.classList.remove("hidden");
      el.logoClear.classList.remove("hidden");
    } else {
      el.logoPreview.classList.add("hidden");
      el.logoClear.classList.add("hidden");
    }
  }

  // ---- init ---------------------------------------------------------------
  function bindField(input, field) {
    input.value = data[field] || "";
    input.addEventListener("input", () => {
      data[field] = input.value.trim();
      save();
    });
  }

  function init() {
    load();
    el.name = document.getElementById("biz-name");
    el.phone = document.getElementById("biz-phone");
    el.email = document.getElementById("biz-email");
    el.logoInput = document.getElementById("biz-logo");
    el.logoPreview = document.getElementById("biz-logo-preview");
    el.logoClear = document.getElementById("biz-logo-clear");

    bindField(el.name, "name");
    bindField(el.phone, "phone");
    bindField(el.email, "email");
    el.logoInput.addEventListener("change", onLogo);
    el.logoClear.addEventListener("click", () => {
      data.logo = "";
      save();
      renderLogo();
    });
    renderLogo();
  }

  return { init, get };
})();
