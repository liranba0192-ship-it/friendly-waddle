"use strict";
window.App = window.App || {};

/* סנכרון ענן + התחברות אימייל (Supabase). הנתונים נשמרים מקומית, ומסונכרנים
   לחשבון המשתמש כך שאפשר לפתוח מכל מכשיר. ה-URL וה-anon key מוזנים ע"י המשתמש. */
App.sync = (function () {
  const S = App.store;
  let client = null, libLoading = null, pushTimer = null;

  // פרטי Supabase מוטמעים — כך כל מכשיר רק מתחבר (אין צורך להזין URL/key).
  // ה-anon/publishable key בטוח להטמעה: ההגנה היא ב-RLS (כל משתמש רואה רק את שלו).
  const DEFAULT_URL = "https://alyimtdaqkwtxzrfxwml.supabase.co";
  const DEFAULT_KEY = "sb_publishable_ViaGticdK8xF8S6tbvMWnQ_zVbnC5nc";

  function cfg() { return { url: S.get("sync.url", DEFAULT_URL), key: S.get("sync.key", DEFAULT_KEY) }; }
  function configured() { const c = cfg(); return !!(c.url && c.key); }
  function email() { return S.get("sync.email", null); }
  function getState() { return { configured: configured(), email: email() }; }

  function loadLib() {
    if (window.supabase) return Promise.resolve();
    if (libLoading) return libLoading;
    libLoading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "vendor/supabase.js"; s.onload = res; s.onerror = () => rej(new Error("lib"));
      document.head.appendChild(s);
    });
    return libLoading;
  }

  async function getClient() {
    if (client) return client;
    const c = cfg(); if (!c.url || !c.key) return null;
    await loadLib();
    client = window.supabase.createClient(c.url, c.key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "mb.sb.auth" },
    });
    return client;
  }

  function saveConfig(url, key) {
    S.set("sync.url", (url || "").trim().replace(/\/+$/, ""));
    S.set("sync.key", (key || "").trim());
    client = null;
  }

  // ---- אוסף/מחיל את כל נתוני האפליקציה ----
  function collect() {
    const blob = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("mb.") && !k.startsWith("mb.sync.") && k !== "mb.sb.auth") blob[k] = localStorage.getItem(k);
    }
    return blob;
  }
  function apply(blob) {
    for (const [k, v] of Object.entries(blob || {})) localStorage.setItem(k, v);
  }

  async function currentUser(cl) {
    const { data } = await cl.auth.getUser();
    return data && data.user;
  }

  async function pushAll() {
    const cl = await getClient(); if (!cl) return;
    const u = await currentUser(cl); if (!u) return;
    await cl.from("user_data").upsert({ user_id: u.id, data: collect(), updated_at: new Date().toISOString() });
  }
  async function pullAll() {
    const cl = await getClient(); if (!cl) return false;
    const u = await currentUser(cl); if (!u) return false;
    const { data, error } = await cl.from("user_data").select("data").eq("user_id", u.id).maybeSingle();
    if (error || !data || !data.data) return false;
    apply(data.data);
    return true;
  }

  function schedulePush() {
    if (!email()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushAll().catch(() => {}), 1500);
  }

  // עוטף את store.set כדי לדחוף שינויים אוטומטית
  (function hookStore() {
    const orig = S.set;
    S.set = function (k, v) { orig(k, v); if (!String(k).startsWith("sync.")) schedulePush(); };
  })();

  async function signUp(em, pw) {
    const cl = await getClient(); if (!cl) throw new Error("הזן קודם כתובת ומפתח Supabase");
    const { data, error } = await cl.auth.signUp({ email: em, password: pw });
    if (error) throw error;
    if (data.user && data.session) { S.set("sync.email", em); await afterLogin(true); }
    return data;
  }
  async function signIn(em, pw) {
    const cl = await getClient(); if (!cl) throw new Error("הזן קודם כתובת ומפתח Supabase");
    const { error } = await cl.auth.signInWithPassword({ email: em, password: pw });
    if (error) throw error;
    S.set("sync.email", em);
    await afterLogin(false);
  }
  async function signOut() {
    const cl = await getClient(); if (cl) await cl.auth.signOut();
    S.set("sync.email", null);
  }

  // אחרי התחברות: משוך מהענן; אם אין נתונים — דחוף את המקומיים. ואז רענן.
  async function afterLogin(isNew) {
    let pulled = false;
    try { pulled = await pullAll(); } catch {}
    if (!pulled) { try { await pushAll(); } catch {} }
    sessionStorage.setItem("mb.pulled", "1");
    if (pulled) location.reload();
  }

  async function syncNow() {
    await pushAll(); // מעלה את המקומי
    const ok = await pullAll(); // ומושך את העדכני (לפי הרשומה האחרונה)
    return ok;
  }

  // בטעינת האפליקציה: אם מחובר — משוך פעם אחת לסשן ורענן
  async function init() {
    if (!configured()) return;
    try {
      const cl = await getClient(); if (!cl) return;
      const { data } = await cl.auth.getSession();
      if (!data || !data.session) { if (email()) S.set("sync.email", null); return; }
      if (sessionStorage.getItem("mb.pulled")) return;
      sessionStorage.setItem("mb.pulled", "1");
      const ok = await pullAll();
      if (ok) location.reload();
    } catch {}
  }

  return { getState, configured, email, saveConfig, signUp, signIn, signOut, syncNow, init };
})();
