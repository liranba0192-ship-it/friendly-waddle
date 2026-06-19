"use strict";
window.App = window.App || {};

App.food = (function () {
  const U = App.util, S = App.store, N = App.nutrition;
  let root, db = [], loaded = false, view = "main", selectedFood = null;

  function entries() { return S.get("food.entries", []); }   // [{id,date,name,grams,kcal,protein,carbs,fat}]
  function custom() { return S.get("food.custom", []); }     // user foods (per 100g, optional unit)
  function saveEntries(v) { S.set("food.entries", v); }
  function saveCustom(v) { S.set("food.custom", v); }

  async function ensureDB() {
    if (loaded) return;
    try {
      const res = await fetch(`data/foods.json?ts=${Date.now()}`, { cache: "force-cache" });
      db = (await res.json()).foods || [];
    } catch { db = []; }
    loaded = true;
  }

  function allFoods() {
    return [...custom().map((f) => ({ ...f, custom: true })), ...db];
  }

  async function mount(el) { root = el; await ensureDB(); render(); }
  async function show() { await ensureDB(); render(); }

  function render() {
    if (view === "custom") return renderCustom();
    if (view === "detail") return renderDetail(selectedFood);
    renderMain();
  }

  // ---------- main screen ----------
  function renderMain() {
    const today = U.todayISO();
    const todays = entries().filter((e) => e.date === today);
    const tot = todays.reduce((a, e) => ({
      kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat,
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const tg = N.targets();

    const rows = todays.map((e) => `
      <div class="log-row">
        <span class="log-date">${U.esc(e.name)} · ${U.esc(e.label || (e.grams + " ג'"))}</span>
        <span class="log-sets">${Math.round(e.kcal)} קק"ל · ${U.round(e.protein)} ח'</span>
        <button class="del-x" data-del="${e.id}" aria-label="מחק">✕</button>
      </div>`).join("") || `<p class="status">עדיין לא הוספת מאכלים היום.</p>`;

    root.innerHTML = `
      <div class="totals-grid">
        ${stat("קלוריות", Math.round(tot.kcal), tg.kcal, 'קק"ל')}
        ${stat("חלבון", U.round(tot.protein), tg.protein, "ג'")}
        ${stat("פחמימות", U.round(tot.carbs), tg.carbs || 0, "ג'")}
        ${stat("שומן", U.round(tot.fat), tg.fat || 0, "ג'")}
      </div>

      <div class="card-block">
        <h3>הוספת מאכל</h3>
        <input id="fd-search" class="search-input" type="search" placeholder="חפש מאכל… (למשל: חזה עוף)" autocomplete="off" />
        <div id="fd-results" class="results-list"></div>
        <div id="fd-add" hidden></div>
      </div>

      <div class="card-block">
        <h3>היום אכלתי</h3>
        ${rows}
      </div>

      <p class="section-hint">💡 את היעדים והמחשבון תמצא עכשיו בטאב <b>שקילה ⚖️</b>.</p>
      <button id="fd-custom" class="btn-secondary full">➕ הוסף מאכל משלך למאגר</button>
    `;

    const search = root.querySelector("#fd-search");
    const results = root.querySelector("#fd-results");
    search.addEventListener("input", () => renderResults(search.value, results));
    renderResults("", results);

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
        <div id="fd-detail-totals" class="totals-grid" style="margin-top:12px"></div>
        <button id="fd-confirm" class="btn-primary full">➕ הוסף ליומן</button>
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
    upd();

    root.querySelector("#fd-back").addEventListener("click", () => { view = "main"; render(); });
    root.querySelector("#fd-confirm").addEventListener("click", () => {
      const g = gramsNow();
      if (!(g > 0)) { alert("הזן כמות."); return; }
      const f = g / 100;
      const list = entries();
      list.push({
        id: U.uid(), date: U.todayISO(), name: food.name, grams: Math.round(g), label: label(),
        kcal: food.kcal * f, protein: food.protein * f, carbs: food.carbs * f, fat: food.fat * f,
      });
      saveEntries(list);
      view = "main";
      render();
    });
  }

  // ---------- custom food ----------
  function renderCustom() {
    root.innerHTML = `
      <button id="fd-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block">
        <h3>הוספת מאכל משלך (ערכים ל-100 ג')</h3>
        <label class="field">שם <input id="cf-name" type="text" /></label>
        <div class="grid2">
          <label class="field">קלוריות <input id="cf-kcal" type="number" /></label>
          <label class="field">חלבון <input id="cf-protein" type="number" /></label>
          <label class="field">פחמימות <input id="cf-carbs" type="number" /></label>
          <label class="field">שומן <input id="cf-fat" type="number" /></label>
        </div>
        <p class="section-hint">לא חובה — אם המאכל נמדד ביחידות (לדוגמה "פרוסה"), מלא גם:</p>
        <div class="grid2">
          <label class="field">שם יחידה <input id="cf-unit" type="text" placeholder="פרוסה / כוס" /></label>
          <label class="field">משקל יחידה (ג') <input id="cf-unitg" type="number" /></label>
        </div>
        <button id="cf-save" class="btn-primary full">הוסף למאגר</button>
      </div>
      <div class="card-block">
        <h3>המאכלים שלי</h3>
        ${custom().length ? custom().map((c, i) => `
          <div class="log-row">
            <span class="log-date">${U.esc(c.name)}</span>
            <span class="log-sets">${c.kcal} קק"ל</span>
            <button class="del-x" data-delc="${i}" aria-label="מחק">✕</button>
          </div>`).join("") : `<p class="status">עדיין אין מאכלים מותאמים.</p>`}
      </div>
    `;
    root.querySelector("#fd-back").addEventListener("click", () => { view = "main"; render(); });
    root.querySelector("#cf-save").addEventListener("click", () => {
      const name = root.querySelector("#cf-name").value.trim();
      if (!name) { alert("הזן שם מאכל."); return; }
      const num = (id) => parseFloat(root.querySelector(id).value) || 0;
      const unit = root.querySelector("#cf-unit").value.trim();
      const unitGrams = num("#cf-unitg");
      const item = { name, cat: "מותאם", kcal: num("#cf-kcal"), protein: num("#cf-protein"), carbs: num("#cf-carbs"), fat: num("#cf-fat") };
      if (unit && unitGrams > 0) { item.unit = unit; item.unitGrams = unitGrams; }
      const list = custom();
      list.unshift(item);
      saveCustom(list);
      alert("נוסף! עכשיו אפשר לחפש אותו.");
      render();
    });
    root.querySelectorAll("[data-delc]").forEach((b) =>
      b.addEventListener("click", () => { const l = custom(); l.splice(+b.dataset.delc, 1); saveCustom(l); render(); })
    );
  }

  return { mount, show };
})();
