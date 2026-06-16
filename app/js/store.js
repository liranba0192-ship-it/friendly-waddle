"use strict";
/* אחסון מקומי (localStorage) + עזרי תאריך + גיבוי/שחזור. */
window.App = window.App || {};

App.store = (function () {
  const PREFIX = "mb."; // morning-briefing

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function set(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }
  function keys() {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  }
  function exportAll() {
    const data = {};
    for (const k of keys()) data[k.slice(PREFIX.length)] = get(k.slice(PREFIX.length));
    return { app: "morning-briefing", version: 1, exportedAt: new Date().toISOString(), data };
  }
  function importAll(obj) {
    if (!obj || !obj.data) throw new Error("קובץ גיבוי לא תקין");
    for (const [k, v] of Object.entries(obj.data)) set(k, v);
  }
  return { get, set, keys, exportAll, importAll };
})();

App.util = (function () {
  const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const p2 = (x) => String(x).padStart(2, "0");

  function todayISO() {
    const n = new Date();
    return `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}`;
  }
  function dayName(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return HE_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }
  function prettyDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return `${d}.${m}.${y}`;
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function round(n, d = 1) {
    const f = 10 ** d;
    return Math.round(n * f) / f;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function download(filename, content, type = "text/plain") {
    const blob = new Blob([content], { type: type + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { todayISO, dayName, prettyDate, uid, round, esc, download, HE_DAYS };
})();
