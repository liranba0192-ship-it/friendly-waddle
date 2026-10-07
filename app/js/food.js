"use strict";
window.App = window.App || {};

// טאב תזונה — יומן (ארוחות מקובצות, מים, חיפוש/סריקה) + מקטע משקל (App.weight מותקן כאן).
App.food = (function () {
  const U = App.util, S = App.store, N = App.nutrition, I = App.icon;
  const MEALS = ["בוקר", "צהריים", "ערב", "נשנושים"];
  let root, db = [], loaded = false, view = "main", selectedFood = null, selDate = null, editPrefill = null;
  let editEntryId = null;    // רשומת יומן בעריכה — פותחת את דף המאכל המלא
  let lastQuery = "";        // מילת החיפוש האחרונה — כדי לחזור אליה מדף מאכל
  let mode = "log";          // log (יומן) | weight (משקל)
  let pendingMeal = null;    // ארוחה שנבחרה ב"הוסף" — נבחרת מראש בדף המאכל

  function entries() { return S.get("food.entries", []); }   // [{id,date,name,grams,label,meal?,kcal,protein,carbs,fat}]
  function custom() { return S.get("food.custom", []); }     // מאכלים משלי (ל-100 ג', יחידה אופציונלית)
  function saveEntries(v) { S.set("food.entries", v); }
  function saveCustom(v) { S.set("food.custom", v); }
  function water() { return S.get("food.water", {}); }
  function waterFor(d) { return water()[d] || 0; }
  function setWater(d, ml) { const w = water(); w[d] = Math.max(0, Math.round(ml)); S.set("food.water", w); }
  function waterGoal() { return S.get("food.waterGoal", 2500); }
  function curDate() { return selDate || U.todayISO(); }

  // ארוחה לפי שעה (ברירת מחדל), ולרשומות ישנות — לפי שעת היצירה שמקודדת ב-id
  function mealByHour(h) { return h >= 5 && h < 11 ? "בוקר" : h >= 11 && h < 16 ? "צהריים" : h >= 16 && h < 22 ? "ערב" : "נשנושים"; }
  function mealOf(e) {
    if (e.meal && MEALS.includes(e.meal)) return e.meal;
    const ts = parseInt(String(e.id || "").slice(0, 8), 36);
    if (ts > 1.5e12 && ts < 4e12) return mealByHour(new Date(ts).getHours());
    return "נשנושים";
  }

  async function ensureDB() {
    if (loaded) return;
    try {
      const res = await fetch(`data/foods.json?ts=${Date.now()}`, { cache: "force-cache" });
      db = (await res.json()).foods || [];
    } catch { db = []; }
    loaded = true;
  }
  function allFoods() {
    const c = custom();
    const names = new Set(c.map((f) => f.name));
    return [...c.map((f) => ({ ...f, custom: true })), ...db.filter((f) => !names.has(f.name))];
  }

  async function mount(el) { root = el; await ensureDB(); render(); }
  async function show() { await ensureDB(); render(); }

  function header() {
    return `<header class="home-head" style="padding-bottom:12px"><div><h1 class="t1">תזונה</h1></div>
      <button class="ibtn" data-bell aria-label="תזכורות והגדרות">${I("bell")}</button></header>
      <div class="seg" role="tablist" aria-label="תצוגה" style="margin-bottom:12px">
        <button role="tab" data-mode="log" class="${mode === "log" ? "on" : ""}" aria-selected="${mode === "log"}">יומן</button>
        <button role="tab" data-mode="weight" class="${mode === "weight" ? "on" : ""}" aria-selected="${mode === "weight"}">משקל</button>
      </div>`;
  }
  function wireHeader() {
    root.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => { mode = b.dataset.mode; view = "main"; render(); window.scrollTo(0, 0); }));
    const bell = root.querySelector("[data-bell]");
    if (bell) bell.addEventListener("click", () => App.nav.go("me", "settings"));
  }
  function renderWeight() {
    root.innerHTML = header() + `<div id="fd-weight"></div>`;
    wireHeader();
    App.weight.mount(root.querySelector("#fd-weight"));
  }
  function open(sub) { mode = sub === "weight" ? "weight" : "log"; view = "main"; render(); }

  function render() {
    if (mode === "weight") return renderWeight();
    if (view === "custom") return renderCustom();
    if (view === "detail") return renderDetail(selectedFood);
    renderMain();
  }

  // ---------- רצועת ימים: 7 אחרונים + היום + 7 קדימה ----------
  function dateStrip() {
    const today = U.todayISO(), cur = curDate(), p2 = (x) => String(x).padStart(2, "0");
    const days = [];
    for (let i = 7; i >= -7; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`);
    }
    return `<div class="date-scroll" id="date-strip" role="group" aria-label="בחירת יום">${days.map((iso) => {
      const sel = iso === cur, isToday = iso === today, fut = iso > today;
      return `<button class="wday${sel ? " sel" : ""}${fut ? " fut" : ""}" data-day="${iso}" ${sel ? 'aria-current="date"' : ""} aria-label="${isToday ? "היום" : "יום " + U.dayName(iso)} ${U.prettyDate(iso)}">
        <span>${isToday ? "היום" : U.dayName(iso).charAt(0) + "׳"}</span><b>${+iso.slice(8)}</b></button>`;
    }).join("")}</div>`;
  }

  function ring(consumed, target, size) {
    const r = size / 2 - 10, C = 2 * Math.PI * r;
    const len = target ? Math.min(1, consumed / target) * C : 0;
    return `<div class="ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="12"/>
        <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${len.toFixed(1)} ${(C - len + 0.01).toFixed(1)}"/>
      </svg>
      <div class="ring-mid"><span class="num" style="font-size:34px">${Math.round(consumed).toLocaleString("he-IL")}</span>
        <span class="lbl" style="font-size:12px">קק״ל · יעד ${Number(target).toLocaleString("he-IL")}</span></div>
    </div>`;
  }
  function macroCol(name, val, target, cls) {
    const pct = target ? Math.min(100, Math.round((val / target) * 100)) : 0;
    return `<div style="display:flex;flex-direction:column;gap:6px"><span class="lbl">${name}</span>
      <span class="num" style="font-size:18px">${Math.round(val)}<span class="lbl"> /${target}</span></span>
      <div class="bar"><i class="${cls}" style="width:${pct}%"></i></div></div>`;
  }

  // ---------- יומן ----------
  function renderMain() {
    const d = curDate();
    const list = entries().filter((e) => e.date === d);
    const tot = list.reduce((a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const tg = N.targets();
    const left = Math.round(tg.kcal - tot.kcal);
    const wMl = waterFor(d), wGoal = waterGoal();
    const groups = MEALS.map((m) => ({ name: m, items: list.filter((e) => mealOf(e) === m) }));

    const mealCards = groups.map((g) => {
      if (!g.items.length) return `
        <section class="meal-empty" aria-label="${g.name}">
          <div style="display:flex;flex-direction:column"><span class="t3" style="font-size:15px">${g.name}</span><span class="lbl">עוד לא נרשם</span></div>
          <button class="btn btn-s" data-addmeal="${g.name}" style="min-height:44px;font-size:14px">${I("plus", 18)}הוסף</button>
        </section>`;
      const kcal = g.items.reduce((a, e) => a + e.kcal, 0);
      return `<section class="card meal-card" aria-label="${g.name}">
        <div class="meal-head"><span class="t3" style="font-size:15px">${g.name}</span><span class="lbl">${Math.round(kcal)} קק״ל</span></div>
        ${g.items.map((e) => `<div class="meal-row">
          <button class="meal-main" data-edite="${e.id}"><span style="font-weight:500">${U.esc(e.name)}</span>
            <span class="lbl">${U.esc(e.label || e.grams + " ג׳")} · ${Math.round(e.kcal)} קק״ל · ${U.round(e.protein)} ח׳</span></button>
          <button class="ibtn ghost sm" data-edite="${e.id}" aria-label="עריכת ${U.esc(e.name)}">${I("edit", 20)}</button>
          <button class="ibtn ghost sm" data-del="${e.id}" aria-label="מחיקת ${U.esc(e.name)}">${I("trash", 20)}</button>
        </div>`).join("")}
      </section>`;
    }).join("");

    root.innerHTML = `
      ${header()}
      <div class="stack">
        ${dateStrip()}
        <section class="hero" style="padding:20px;display:flex;flex-direction:column;gap:18px" aria-label="סיכום היום">
          <div style="display:flex;align-items:center;gap:20px">
            ${ring(tot.kcal, tg.kcal, 148)}
            <div style="flex-grow:1;display:flex;flex-direction:column;gap:14px">
              <div style="display:flex;flex-direction:column;gap:2px"><span class="lbl">${left >= 0 ? "נותרו" : "מעל היעד"}</span>
                <span class="num" style="font-size:30px;color:var(--accent-text)">${Math.abs(left).toLocaleString("he-IL")}</span></div>
              <div style="display:flex;flex-direction:column;gap:2px"><span class="lbl">ארוחות שנרשמו</span><span class="num" style="font-size:20px">${list.length}</span></div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">
            ${macroCol("חלבון", tot.protein, tg.protein, "")}
            ${macroCol("פחמימות", tot.carbs, tg.carbs, "carb")}
            ${macroCol("שומן", tot.fat, tg.fat, "fat")}
          </div>
        </section>

        <section class="card water-row" aria-label="מים">
          ${I("drop", 28, "water-ico")}
          <div style="flex-grow:1;display:flex;flex-direction:column;gap:8px">
            <span class="numline"><span class="num" style="font-size:22px">${(wMl / 1000).toFixed(2)}</span><span class="lbl">/ ${(wGoal / 1000).toLocaleString("he-IL")} ליטר</span></span>
            <div class="bar"><i class="water" style="width:${Math.min(100, Math.round((wMl / wGoal) * 100))}%"></i></div>
          </div>
          <button class="ibtn" id="w-minus" aria-label="הפחת 250 מ״ל" style="width:56px;font:600 13px var(--font-display)">−250</button>
          <button class="ibtn water-plus" id="w-plus" aria-label="הוסף 250 מ״ל" style="width:56px;font:600 13px var(--font-display)">+250</button>
        </section>

        <div style="display:flex;gap:8px;padding-top:4px">
          <label class="search-field">${I("search")}<input id="fd-search" type="search" placeholder="חיפוש מאכל${pendingMeal ? " ל" + pendingMeal : ""}" aria-label="חיפוש מאכל" autocomplete="off"></label>
          <button class="ibtn hot" id="fd-scan" aria-label="סריקת ברקוד" style="width:52px;height:52px;border-radius:14px">${I("barcode")}</button>
        </div>
        <div id="fd-results" class="results-list"></div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px 0">
          <h2 class="sec-title" style="margin:0">הארוחות שלי</h2>
          <button class="btn btn-t" id="fd-custom" style="font-size:14px">${I("plus", 18)}מאכל משלי</button>
        </div>
        ${mealCards}
        <p class="lbl" style="text-align:center;margin:4px 0 0">יעדים ומחשבון קלוריות — במקטע <b>משקל</b> למעלה</p>
      </div>`;

    wireHeader();
    root.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { selDate = b.dataset.day; render(); }));
    const strip = root.querySelector("#date-strip");
    const selCell = strip && strip.querySelector(".wday.sel");
    if (selCell) selCell.scrollIntoView({ inline: "center", block: "nearest" });
    root.querySelector("#w-plus").addEventListener("click", () => { setWater(d, wMl + 250); render(); });
    root.querySelector("#w-minus").addEventListener("click", () => { setWater(d, wMl - 250); render(); });
    const search = root.querySelector("#fd-search");
    const results = root.querySelector("#fd-results");
    search.value = lastQuery;
    search.addEventListener("input", () => { lastQuery = search.value; renderResults(search.value, results); });
    renderResults(lastQuery, results);
    if (pendingMeal) search.focus();
    root.querySelector("#fd-scan").addEventListener("click", () => {
      App.scanner.open((food) => {
        const c = custom();
        if (!c.some((x) => x.name === food.name)) { c.unshift(food); saveCustom(c); }
        editEntryId = null; selectedFood = food; view = "detail"; render();
      });
    });
    root.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        const e = entries().find((x) => x.id === b.dataset.del);
        if (e && !confirm(`למחוק את "${e.name}" מהיומן?`)) return;
        saveEntries(entries().filter((x) => x.id !== b.dataset.del)); render();
      }));
    root.querySelectorAll("[data-edite]").forEach((b) =>
      b.addEventListener("click", () => {
        const e = entries().find((x) => x.id === b.dataset.edite);
        if (!e) return;
        editEntryId = e.id; selectedFood = foodFromEntry(e); view = "detail"; render(); window.scrollTo(0, 0);
      }));
    root.querySelectorAll("[data-addmeal]").forEach((b) =>
      b.addEventListener("click", () => { pendingMeal = b.dataset.addmeal; render(); window.scrollTo(0, 0); }));
    root.querySelector("#fd-custom").addEventListener("click", () => { view = "custom"; render(); window.scrollTo(0, 0); });
  }

  function foodFromEntry(e) {
    const match = allFoods().find((f) => f.name === e.name);
    if (match) return match;
    const factor = e.grams > 0 ? 100 / e.grams : 0;
    return { name: e.name, cat: "", kcal: e.kcal * factor, protein: e.protein * factor, carbs: e.carbs * factor, fat: e.fat * factor };
  }

  function renderResults(q, container) {
    q = q.trim();
    if (!q) { container.innerHTML = ""; return; }
    const list = allFoods().filter((f) => f.name.includes(q)).slice(0, 30);
    if (!list.length) {
      container.innerHTML = `<p class="status">לא נמצא. אפשר להוסיף <button class="btn btn-t" id="fd-nf" style="display:inline-flex;padding:0 4px">מאכל משלך</button>.</p>`;
      container.querySelector("#fd-nf").addEventListener("click", () => { view = "custom"; editPrefill = { name: q }; render(); });
      return;
    }
    container.innerHTML = `<section class="card" style="padding:4px 0">${list.map((f, i) => `
      <button class="food-row" data-i="${i}"><span class="grow"><span style="font-weight:500">${U.esc(f.name)}${f.custom ? `<span class="lbl"> · שלי</span>` : ""}</span>
        <span class="lbl">${Math.round(f.kcal)} קק״ל · ${U.round(f.protein)} ח׳ ל-100 ג׳${f.unit ? ` · ${U.esc(f.unit)}` : ""}</span></span>
        <span class="chev">${I("chev")}</span></button>`).join("")}</section>`;
    container.querySelectorAll(".food-row").forEach((b) =>
      b.addEventListener("click", () => { editEntryId = null; selectedFood = list[+b.dataset.i]; view = "detail"; render(); window.scrollTo(0, 0); }));
  }

  // ---------- דף מאכל ----------
  function donut(p, c, f, size) {
    const r = size / 2 - 12, C = 2 * Math.PI * r;
    const pk = p * 4, ck = c * 4, fk = f * 9, tot = pk + ck + fk || 1;
    let off = 0;
    const seg = (v, cls) => { const len = (v / tot) * C; const s = `<circle class="${cls}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`; off += len; return s; };
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" style="transform:rotate(-90deg)">
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="16"/>
      ${seg(pk, "d-p")}${seg(ck, "d-c")}${seg(fk, "d-f")}</svg>`;
  }

  function renderDetail(food) {
    if (!food) { view = "main"; return render(); }
    const editingEntry = editEntryId ? entries().find((x) => x.id === editEntryId) : null;
    const hasUnit = food.unit && food.unitGrams > 0;
    let grams = editingEntry ? editingEntry.grams : hasUnit ? food.unitGrams : 100;
    let meal = editingEntry ? mealOf(editingEntry) : pendingMeal || (curDate() === U.todayISO() ? mealByHour(new Date().getHours()) : "צהריים");
    let unitCount = hasUnit && grams % food.unitGrams === 0 ? grams / food.unitGrams : 0;

    const presets = hasUnit
      ? [[0.5, `½ ${food.unit}`], [1, `${food.unit} · ${food.unitGrams} ג׳`], [2, `2 · ${food.unitGrams * 2} ג׳`], [3, `3 · ${food.unitGrams * 3} ג׳`]].map(([u, l]) => ({ g: Math.round(u * food.unitGrams), u, l }))
      : [50, 100, 150, 200, 250, 300].map((g) => ({ g, u: 0, l: `${g} ג׳` }));

    root.innerHTML = `
      <div class="subhead">
        <button class="ibtn ghost" id="fd-back" aria-label="חזרה ליומן">${I("back")}</button>
        <span style="flex:1"></span>
        <button class="ibtn" id="fd-edit" aria-label="עריכת הערכים של המאכל">${I("edit")}</button>
      </div>
      <div class="stack" style="padding-bottom:96px">
        <div style="display:flex;flex-direction:column;gap:6px;padding:0 4px">
          <h1 class="t1">${U.esc(food.name)}</h1>
          <span class="lbl">ערכים ל-100 ג׳ · ${Math.round(food.kcal)} קק״ל${food.cat ? " · " + U.esc(food.cat) : ""}${editingEntry ? " · עריכת רשומה קיימת" : ""}</span>
        </div>
        <section class="hero" style="padding:20px;display:flex;align-items:center;gap:20px" aria-label="פירוק מאקרו">
          <div class="ring" style="width:140px;height:140px">${donut(food.protein, food.carbs, food.fat, 140)}
            <div class="ring-mid"><span class="num" id="fd-kcal" style="font-size:30px">0</span><span class="lbl" id="fd-g" style="font-size:12px"></span></div></div>
          <div style="flex-grow:1;display:flex;flex-direction:column;gap:12px">
            <div class="legend2"><i class="d-p-bg"></i><span>חלבון</span><span class="num" id="fd-p"></span></div>
            <div class="legend2"><i class="d-c-bg"></i><span>פחמימות</span><span class="num" id="fd-c"></span></div>
            <div class="legend2"><i class="d-f-bg"></i><span>שומן</span><span class="num" id="fd-f"></span></div>
          </div>
        </section>
        <h2 class="sec-title">כמות</h2>
        <div class="chips" role="group" aria-label="כמות מהירה">${presets.map((p, i) => `<button class="chip" data-pi="${i}">${U.esc(p.l)}</button>`).join("")}</div>
        <div class="step" role="group" aria-label="כמות בגרמים">
          <button type="button" data-gd="10" aria-label="הוסף 10 גרם">${I("plus")}</button>
          <span style="display:flex;align-items:baseline;gap:4px;justify-content:center;flex:1"><input class="num" id="fd-grams" type="number" inputmode="decimal" min="0" step="1" aria-label="כמות בגרמים" style="max-width:110px"><span class="lbl">גרם</span></span>
          <button type="button" data-gd="-10" aria-label="הפחת 10 גרם">${I("minus")}</button>
        </div>
        <h2 class="sec-title">לאיזו ארוחה</h2>
        <div class="seg" role="group" aria-label="ארוחה">${MEALS.map((m) => `<button data-meal="${m}">${m}</button>`).join("")}</div>
      </div>
      <div class="dock"><button class="btn btn-p" id="fd-confirm" style="flex-grow:1"></button></div>`;

    const gIn = root.querySelector("#fd-grams");
    function upd() {
      const f = grams / 100;
      root.querySelector("#fd-kcal").textContent = Math.round(food.kcal * f);
      root.querySelector("#fd-g").textContent = `קק״ל · ${Math.round(grams)} ג׳`;
      root.querySelector("#fd-p").textContent = `${U.round(food.protein * f)} ג׳`;
      root.querySelector("#fd-c").textContent = `${U.round(food.carbs * f)} ג׳`;
      root.querySelector("#fd-f").textContent = `${U.round(food.fat * f)} ג׳`;
      if (document.activeElement !== gIn) gIn.value = Math.round(grams * 10) / 10;
      root.querySelectorAll("[data-pi]").forEach((b) => { const on = presets[+b.dataset.pi].g === Math.round(grams); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
      root.querySelectorAll("[data-meal]").forEach((b) => { const on = b.dataset.meal === meal; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
      root.querySelector("#fd-confirm").textContent = `${editingEntry ? "עדכן ב" : "הוסף ל"}${meal} · ${Math.round(food.kcal * f)} קק״ל`;
    }
    upd();
    root.querySelectorAll("[data-pi]").forEach((b) => b.addEventListener("click", () => { const p = presets[+b.dataset.pi]; grams = p.g; unitCount = p.u; upd(); }));
    root.querySelectorAll("[data-gd]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); grams = Math.max(0, grams + parseFloat(b.dataset.gd)); unitCount = 0; upd(); }));
    gIn.addEventListener("input", () => { grams = Math.max(0, parseFloat(gIn.value) || 0); unitCount = 0; upd(); });
    root.querySelectorAll("[data-meal]").forEach((b) => b.addEventListener("click", () => { meal = b.dataset.meal; upd(); }));

    root.querySelector("#fd-back").addEventListener("click", () => { editEntryId = null; view = "main"; render(); });
    root.querySelector("#fd-edit").addEventListener("click", () => {
      editPrefill = { name: food.name, kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat, unit: food.unit, unitGrams: food.unitGrams };
      view = "custom"; render(); window.scrollTo(0, 0);
    });
    root.querySelector("#fd-confirm").addEventListener("click", () => {
      if (!(grams > 0)) { alert("הזן כמות."); return; }
      const f = grams / 100;
      const label = unitCount ? `${unitCount === 0.5 ? "½" : unitCount} ${food.unit} (${Math.round(grams)} ג׳)` : `${Math.round(grams)} ג׳`;
      const vals = { name: food.name, grams: Math.round(grams), label, meal, kcal: food.kcal * f, protein: food.protein * f, carbs: food.carbs * f, fat: food.fat * f };
      const list = entries();
      if (editingEntry) {
        const i = list.findIndex((x) => x.id === editingEntry.id);
        if (i >= 0) list[i] = { ...list[i], ...vals };
      } else list.push({ id: U.uid(), date: curDate(), ...vals });
      saveEntries(list);
      editEntryId = null; pendingMeal = null; lastQuery = ""; view = "main"; render(); window.scrollTo(0, 0);
    });
  }

  // ---------- מאכל משלי (הוספה + עריכה) ----------
  function renderCustom() {
    const p = editPrefill || {};
    const editing = !!(editPrefill && editPrefill.kcal != null);
    const val = (v) => (v === undefined || v === null ? "" : v);
    root.innerHTML = `
      <div class="subhead"><button class="ibtn ghost" id="fd-back" aria-label="חזרה ליומן">${I("back")}</button>
        <h1 class="t3" style="flex:1">${editing ? "עריכת מאכל" : "מאכל משלי"}</h1></div>
      <div class="stack">
        <section class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px">
          <span class="lbl">ערכים ל-100 גרם</span>
          <label class="fl"><span class="lbl">שם</span><input id="cf-name" type="text" value="${U.esc(val(p.name))}"></label>
          <div class="two-col" style="gap:10px">
            <label class="fl"><span class="lbl">קלוריות</span><input id="cf-kcal" type="number" inputmode="decimal" value="${val(p.kcal)}"></label>
            <label class="fl"><span class="lbl">חלבון (ג׳)</span><input id="cf-protein" type="number" inputmode="decimal" value="${val(p.protein)}"></label>
            <label class="fl"><span class="lbl">פחמימות (ג׳)</span><input id="cf-carbs" type="number" inputmode="decimal" value="${val(p.carbs)}"></label>
            <label class="fl"><span class="lbl">שומן (ג׳)</span><input id="cf-fat" type="number" inputmode="decimal" value="${val(p.fat)}"></label>
          </div>
          <span class="lbl">לא חובה — אם המאכל נמדד ביחידות (למשל "פרוסה"):</span>
          <div class="two-col" style="gap:10px">
            <label class="fl"><span class="lbl">שם יחידה</span><input id="cf-unit" type="text" placeholder="פרוסה / כוס" value="${U.esc(val(p.unit))}"></label>
            <label class="fl"><span class="lbl">משקל יחידה (ג׳)</span><input id="cf-unitg" type="number" inputmode="decimal" value="${val(p.unitGrams)}"></label>
          </div>
          <button id="cf-save" class="btn btn-p">${editing ? "שמור שינויים" : "הוסף למאגר"}</button>
          ${editing ? `<button id="cf-cancel" class="btn btn-s">ביטול</button>` : ""}
        </section>
        <h2 class="sec-title">המאכלים שלי</h2>
        <section class="card" style="padding:4px 0">
          ${custom().length ? custom().map((c, i) => `<div class="meal-row">
            <span class="meal-main" style="cursor:default"><span style="font-weight:500">${U.esc(c.name)}</span><span class="lbl">${Math.round(c.kcal)} קק״ל ל-100 ג׳</span></span>
            <button class="ibtn ghost sm" data-editc="${i}" aria-label="עריכת ${U.esc(c.name)}">${I("edit", 20)}</button>
            <button class="ibtn ghost sm" data-delc="${i}" aria-label="מחיקת ${U.esc(c.name)}">${I("trash", 20)}</button>
          </div>`).join("") : `<p class="status">עדיין אין מאכלים משלך.</p>`}
        </section>
      </div>`;
    root.querySelector("#fd-back").addEventListener("click", () => { editPrefill = null; view = "main"; render(); });
    const cancel = root.querySelector("#cf-cancel");
    if (cancel) cancel.addEventListener("click", () => { editPrefill = null; render(); });
    root.querySelector("#cf-save").addEventListener("click", () => {
      const name = root.querySelector("#cf-name").value.trim();
      if (!name) { alert("הזן שם מאכל."); return; }
      const num = (id) => parseFloat(root.querySelector(id).value) || 0;
      const unit = root.querySelector("#cf-unit").value.trim();
      const unitGrams = num("#cf-unitg");
      const item = { name, cat: "מותאם", kcal: num("#cf-kcal"), protein: num("#cf-protein"), carbs: num("#cf-carbs"), fat: num("#cf-fat") };
      if (unit && unitGrams > 0) { item.unit = unit; item.unitGrams = unitGrams; }
      const list = custom();
      const idx = list.findIndex((f) => f.name === name);
      if (idx >= 0) list[idx] = item; else list.unshift(item);
      saveCustom(list);
      editPrefill = null;
      alert(idx >= 0 ? "נשמר" : "נוסף — עכשיו אפשר לחפש אותו.");
      render();
    });
    root.querySelectorAll("[data-editc]").forEach((b) =>
      b.addEventListener("click", () => { editPrefill = { ...custom()[+b.dataset.editc] }; render(); window.scrollTo(0, 0); }));
    root.querySelectorAll("[data-delc]").forEach((b) =>
      b.addEventListener("click", () => {
        const l = custom(); if (!confirm(`למחוק את "${l[+b.dataset.delc].name}"?`)) return;
        l.splice(+b.dataset.delc, 1); saveCustom(l); render();
      }));
  }

  // חיפוש מהיר לפי ברקוד — קודם במאגר המקומי (גם מותאמים וגם סרוקים שנשמרו)
  function findByBarcode(code) {
    if (!code) return null;
    const c = String(code).trim();
    return allFoods().find((f) => f.barcode && String(f.barcode).trim() === c) || null;
  }
  function openFood(food) { mode = "log"; editEntryId = null; selectedFood = food; view = "detail"; if (root) render(); }

  return {
    mount, show, open, findByBarcode, openFood,
    hideTabbar: () => mode === "log" && view === "detail",
    home: () => { view = "main"; pendingMeal = null; if (root) render(); },
    isHome: () => view === "main",
  };
})();
