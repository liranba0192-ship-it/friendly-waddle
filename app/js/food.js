"use strict";
window.App = window.App || {};

App.food = (function () {
  const U = App.util, S = App.store, N = App.nutrition;
  let root, db = [], loaded = false, view = "main", selectedFood = null, selDate = null, editPrefill = null;

  function entries() { return S.get("food.entries", []); }   // [{id,date,name,grams,kcal,protein,carbs,fat}]
  function custom() { return S.get("food.custom", []); }     // user foods (per 100g, optional unit)
  function saveEntries(v) { S.set("food.entries", v); }
  function saveCustom(v) { S.set("food.custom", v); }
  // מים (מ"ל) לפי תאריך + יעד
  function water() { return S.get("food.water", {}); }
  function waterFor(d) { return water()[d] || 0; }
  function setWater(d, ml) { const w = water(); w[d] = Math.max(0, Math.round(ml)); S.set("food.water", w); }
  function waterGoal() { return S.get("food.waterGoal", 2500); }
  function curDate() { return selDate || U.todayISO(); }

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

  function render() {
    if (view === "custom") return renderCustom();
    if (view === "detail") return renderDetail(selectedFood);
    renderMain();
  }

  // ---------- מחרוזת ימים אחרונים ----------
  function dateStrip() {
    const today = U.todayISO();
    const cur = curDate();
    const days = [];
    const base = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(base.getDate() - i);
      const p2 = (x) => String(x).padStart(2, "0");
      const iso = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
      days.push(iso);
    }
    const cells = days.map((iso) => {
      const [, , dd] = iso.split("-");
      const isSel = iso === cur, isToday = iso === today;
      return `<button class="day-cell${isSel ? " sel" : ""}" data-day="${iso}">
        <span class="day-name">${isToday ? "היום" : "יום " + U.dayName(iso)}</span>
        <span class="day-num">${+dd}</span>
      </button>`;
    }).join("");
    return `<div class="date-strip">${cells}</div>`;
  }

  // טבעת קלוריות (נצרך מול יעד)
  function calRing(consumed, target) {
    const r = 52, C = 2 * Math.PI * r, cx = 70, cy = 70, sw = 14;
    const frac = target ? Math.min(1, consumed / target) : 0;
    const len = frac * C;
    return `<svg viewBox="0 0 140 140" class="cal-ring" width="150" height="150">
      <g transform="rotate(-90 ${cx} ${cy})">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#calg)" stroke-width="${sw}"
          stroke-linecap="round" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}"/>
      </g>
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="ring-num">${Math.round(consumed)}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="ring-sub">מתוך ${target}</text>
      <defs><linearGradient id="calg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/>
      </linearGradient></defs>
    </svg>`;
  }

  function macroBar(name, val, target, col) {
    const pct = target ? Math.min(100, Math.round((val / target) * 100)) : 0;
    return `<div class="mb-row">
      <div class="mb-head"><span style="color:${col};font-weight:700">${name}</span>
        <span>${U.round(val)} / ${target || 0} ג'</span></div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div>
    </div>`;
  }

  // ---------- main screen (דשבורד) ----------
  function renderMain() {
    const d = curDate();
    const list = entries().filter((e) => e.date === d);
    const tot = list.reduce((a, e) => ({
      kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat,
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const tg = N.targets();
    const wMl = waterFor(d), wGoal = waterGoal();

    const rows = list.map((e) => `
      <div class="log-row">
        <span class="log-date">${U.esc(e.name)} · ${U.esc(e.label || (e.grams + " ג'"))}</span>
        <span class="log-sets">${Math.round(e.kcal)} קק"ל · ${U.round(e.protein)} ח'</span>
        <button class="del-x" data-del="${e.id}" aria-label="מחק">✕</button>
      </div>`).join("") || `<p class="status">אין ארוחות ליום זה.</p>`;

    root.innerHTML = `
      ${dateStrip()}

      <div class="dash-grid">
        <div class="card-block dash-cal">
          <h3>קלוריות שנצרכו</h3>
          ${calRing(tot.kcal, tg.kcal)}
        </div>
        <div class="card-block dash-macros">
          <h3>ערכים תזונתיים</h3>
          ${macroBar("חלבון", tot.protein, tg.protein, "var(--accent)")}
          ${macroBar("פחמימות", tot.carbs, tg.carbs, "var(--amber)")}
          ${macroBar("שומן", tot.fat, tg.fat, "#a78bfa")}
        </div>
      </div>

      <div class="card-block water-card">
        <h3>💧 מים</h3>
        <div class="water-main">
          <div><span class="water-num">${wMl}</span><span class="water-sub"> / ${wGoal} מ"ל</span></div>
          <div class="water-btns">
            <button id="w-minus" class="water-btn minus">−250</button>
            <button id="w-plus" class="water-btn plus">+250</button>
          </div>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${Math.min(100, Math.round(wMl / wGoal * 100))}%"></div></div>
      </div>

      <div class="card-block">
        <h3>הוספת מאכל</h3>
        <div class="add-row inline" style="margin-bottom:10px">
          <input id="fd-search" class="search-input" type="search" placeholder="חפש מאכל…" autocomplete="off" style="margin:0" />
          <button id="fd-scan" class="btn-secondary" style="white-space:nowrap">📷 סרוק</button>
        </div>
        <div id="fd-results" class="results-list"></div>
        <div id="fd-add" hidden></div>
      </div>

      <div class="card-block">
        <h3>הארוחות שלי</h3>
        ${rows}
      </div>

      <button id="fd-custom" class="btn-secondary full">➕ הוסף מאכל משלך למאגר</button>
      <p class="section-hint" style="text-align:center;margin-top:10px">💡 יעדים ומחשבון קלוריות — בטאב <b>שקילה ⚖️</b></p>
    `;

    // date strip
    root.querySelectorAll("[data-day]").forEach((b) =>
      b.addEventListener("click", () => { selDate = b.dataset.day; render(); })
    );
    // water
    root.querySelector("#w-plus").addEventListener("click", () => { setWater(d, wMl + 250); render(); });
    root.querySelector("#w-minus").addEventListener("click", () => { setWater(d, wMl - 250); render(); });
    // search + scan
    const search = root.querySelector("#fd-search");
    const results = root.querySelector("#fd-results");
    search.addEventListener("input", () => renderResults(search.value, results));
    renderResults("", results);
    root.querySelector("#fd-scan").addEventListener("click", () => {
      App.scanner.open((food) => {
        const c = custom();
        if (!c.some((x) => x.name === food.name)) { c.unshift(food); saveCustom(c); }
        selectedFood = food; view = "detail"; render();
      });
    });
    // delete + custom
    root.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => { saveEntries(entries().filter((e) => e.id !== b.dataset.del)); render(); })
    );
    root.querySelector("#fd-custom").addEventListener("click", () => { view = "custom"; render(); });
  }

  function stat(label, val, target, unit) {
    const pct = target ? Math.min(100, Math.round((val / target) * 100)) : 0;
    return `
      <div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${val}<small> / ${target} ${unit}</small></div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }

  function renderResults(q, container) {
    q = q.trim();
    let list = allFoods();
    if (q) list = list.filter((f) => f.name.includes(q));
    list = list.slice(0, 30);
    if (!list.length) { container.innerHTML = `<p class="status">לא נמצא. אפשר להוסיף מאכל משלך למטה.</p>`; return; }
    container.innerHTML = list.map((f, i) => `
      <button class="food-item" data-i="${i}">
        <span>${U.esc(f.name)}${f.custom ? " ✏️" : ""}</span>
        <small>${f.kcal} קק"ל · ${f.protein} ח' / 100ג'</small>
      </button>`).join("");
    container.querySelectorAll(".food-item").forEach((b) =>
      b.addEventListener("click", () => { selectedFood = list[+b.dataset.i]; view = "detail"; render(); })
    );
  }

  // ---------- food detail page (macro breakdown) ----------
  function donut(segs, centerKcal) {
    const r = 46, C = 2 * Math.PI * r, cx = 60, cy = 60, sw = 16;
    const total = segs.reduce((a, s) => a + s.v, 0) || 1;
    let off = 0;
    const arcs = segs.map((s) => {
      const len = (s.v / total) * C;
      const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.c}" stroke-width="${sw}" stroke-linecap="butt" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" />`;
      off += len; return el;
    }).join("");
    return `<svg viewBox="0 0 120 120" class="donut" width="128" height="128" aria-hidden="true">
      <g transform="rotate(-90 ${cx} ${cy})">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>
        ${arcs}
      </g>
      <text x="${cx}" y="${cy - 1}" text-anchor="middle" class="donut-kcal">${centerKcal}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-unit">קק"ל / 100ג'</text>
    </svg>`;
  }

  function renderDetail(food) {
    if (!food) { view = "main"; return render(); }
    const hasUnit = food.unit && food.unitGrams > 0;
    const pk = food.protein * 4, ck = food.carbs * 4, fk = food.fat * 9, tot = pk + ck + fk || 1;
    const COL = { p: "var(--accent)", c: "var(--amber)", f: "#a78bfa" };
    const legend = (name, grams, col, frac) =>
      `<div class="legend-row"><span class="legend-dot" style="background:${col}"></span>
        <span class="legend-name">${name}</span>
        <b>${U.round(grams)} ג'</b><small>${Math.round(frac * 100)}%</small></div>`;

    root.innerHTML = `
      <button id="fd-back" class="btn-secondary">‹ חזרה</button>

      <div class="card-block food-detail">
        <h2 class="view-h2">${U.esc(food.name)}${food.custom ? " ✏️" : ""}</h2>
        <div class="detail-cat">${U.esc(food.cat || "")}</div>
        <div class="macro-ring-wrap">
          ${donut([{ v: pk, c: COL.p }, { v: ck, c: COL.c }, { v: fk, c: COL.f }], food.kcal)}
          <div class="macro-legend">
            ${legend("חלבון", food.protein, COL.p, pk / tot)}
            ${legend("פחמימות", food.carbs, COL.c, ck / tot)}
            ${legend("שומן", food.fat, COL.f, fk / tot)}
          </div>
        </div>
      </div>

      <div class="card-block">
        <h3>כמה אכלת?</h3>
        <div class="add-row inline">
          <input id="fd-qty" type="number" inputmode="decimal" value="${hasUnit ? 1 : 100}" min="0" step="${hasUnit ? 1 : 10}" />
          ${hasUnit ? `<select id="fd-mode">
              <option value="unit">${U.esc(food.unit)} (${food.unitGrams} ג')</option>
              <option value="g">גרם</option>
            </select>` : `<span style="white-space:nowrap">גרם</span>`}
        </div>
        <div class="gram-presets">
          ${[50,100,150,200,250,300].map(g => `<button class="gram-btn" data-g="${g}">${g}ג'</button>`).join("")}
        </div>
        <div id="fd-detail-totals" class="totals-grid" style="margin-top:12px"></div>
        <button id="fd-confirm" class="btn-primary full">➕ הוסף ליומן</button>
        <button id="fd-edit" class="btn-secondary full">✏️ ערוך ערכים של מאכל זה</button>
      </div>
    `;

    const qty = root.querySelector("#fd-qty");
    const mode = root.querySelector("#fd-mode");
    const totalsEl = root.querySelector("#fd-detail-totals");

    function gramsNow() {
      const q = parseFloat(qty.value) || 0;
      return hasUnit && (!mode || mode.value === "unit") ? q * food.unitGrams : q;
    }
    function label() {
      const q = parseFloat(qty.value) || 0;
      return hasUnit && (!mode || mode.value === "unit")
        ? `${U.round(q)} ${food.unit} (${Math.round(gramsNow())} ג')`
        : `${Math.round(gramsNow())} ג'`;
    }
    function mini(label, val, unit) {
      return `<div class="stat-card mini"><div class="stat-label">${label}</div><div class="stat-value">${val}<small> ${unit}</small></div></div>`;
    }
    function upd() {
      const f = gramsNow() / 100;
      totalsEl.innerHTML =
        mini("קלוריות", Math.round(food.kcal * f), 'קק"ל') +
        mini("חלבון", U.round(food.protein * f), "ג'") +
        mini("פחמימות", U.round(food.carbs * f), "ג'") +
        mini("שומן", U.round(food.fat * f), "ג'");
    }
    qty.addEventListener("input", upd);
    if (mode) mode.addEventListener("change", () => { qty.value = mode.value === "unit" ? 1 : 100; qty.step = mode.value === "unit" ? 1 : 10; upd(); });
    root.querySelectorAll(".gram-btn").forEach((b) =>
      b.addEventListener("click", () => {
        if (mode && mode.value === "unit") { mode.value = "g"; qty.step = 10; }
        qty.value = b.dataset.g;
        root.querySelectorAll(".gram-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        upd();
      })
    );
    upd();

    root.querySelector("#fd-back").addEventListener("click", () => { view = "main"; render(); });
    root.querySelector("#fd-edit").addEventListener("click", () => {
      editPrefill = { name: food.name, kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat, unit: food.unit, unitGrams: food.unitGrams };
      view = "custom"; render();
    });
    root.querySelector("#fd-confirm").addEventListener("click", () => {
      const g = gramsNow();
      if (!(g > 0)) { alert("הזן כמות."); return; }
      const f = g / 100;
      const list = entries();
      list.push({
        id: U.uid(), date: curDate(), name: food.name, grams: Math.round(g), label: label(),
        kcal: food.kcal * f, protein: food.protein * f, carbs: food.carbs * f, fat: food.fat * f,
      });
      saveEntries(list);
      view = "main";
      render();
    });
  }

  // ---------- custom food (הוספה + עריכה) ----------
  function renderCustom() {
    const p = editPrefill || {};
    const editing = !!editPrefill;
    const val = (v) => (v === undefined || v === null ? "" : v);
    root.innerHTML = `
      <button id="fd-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block">
        <h3>${editing ? "✏️ עריכת מאכל" : "הוספת מאכל משלך"} (ערכים ל-100 ג')</h3>
        <label class="field">שם <input id="cf-name" type="text" value="${U.esc(val(p.name))}" /></label>
        <div class="grid2">
          <label class="field">קלוריות <input id="cf-kcal" type="number" value="${val(p.kcal)}" /></label>
          <label class="field">חלבון <input id="cf-protein" type="number" value="${val(p.protein)}" /></label>
          <label class="field">פחמימות <input id="cf-carbs" type="number" value="${val(p.carbs)}" /></label>
          <label class="field">שומן <input id="cf-fat" type="number" value="${val(p.fat)}" /></label>
        </div>
        <p class="section-hint">לא חובה — אם המאכל נמדד ביחידות (לדוגמה "פרוסה"), מלא גם:</p>
        <div class="grid2">
          <label class="field">שם יחידה <input id="cf-unit" type="text" placeholder="פרוסה / כוס" value="${U.esc(val(p.unit))}" /></label>
          <label class="field">משקל יחידה (ג') <input id="cf-unitg" type="number" value="${val(p.unitGrams)}" /></label>
        </div>
        <button id="cf-save" class="btn-primary full">${editing ? "💾 שמור שינויים" : "הוסף למאגר"}</button>
        ${editing ? `<button id="cf-cancel" class="btn-secondary full">ביטול</button>` : ""}
      </div>
      <div class="card-block">
        <h3>המאכלים שלי</h3>
        ${custom().length ? custom().map((c, i) => `
          <div class="log-row">
            <span class="log-date">${U.esc(c.name)}</span>
            <span class="log-sets">${c.kcal} קק"ל</span>
            <button class="edit-x" data-editc="${i}" aria-label="ערוך">✏️</button>
            <button class="del-x" data-delc="${i}" aria-label="מחק">✕</button>
          </div>`).join("") : `<p class="status">עדיין אין מאכלים מותאמים.</p>`}
      </div>
    `;
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
      const idx = list.findIndex((f) => f.name === name);          // upsert לפי שם
      if (idx >= 0) list[idx] = item; else list.unshift(item);
      saveCustom(list);
      editPrefill = null;
      alert(idx >= 0 ? "נשמר! ✅" : "נוסף! עכשיו אפשר לחפש אותו.");
      render();
    });
    root.querySelectorAll("[data-editc]").forEach((b) =>
      b.addEventListener("click", () => { editPrefill = { ...custom()[+b.dataset.editc] }; render(); window.scrollTo(0, 0); })
    );
    root.querySelectorAll("[data-delc]").forEach((b) =>
      b.addEventListener("click", () => { const l = custom(); l.splice(+b.dataset.delc, 1); saveCustom(l); render(); })
    );
  }

  return { mount, show };
})();
