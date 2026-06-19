"use strict";
window.App = window.App || {};

App.food = (function () {
  const U = App.util, S = App.store, N = App.nutrition;
  let root, db = [], loaded = false, view = "main";

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
      b.addEventListener("click", () => selectFood(list[+b.dataset.i]))
    );
  }

  function selectFood(food) {
    const box = root.querySelector("#fd-add");
    box.hidden = false;
    const hasUnit = food.unit && food.unitGrams > 0;
    box.innerHTML = `
      <div class="add-row">
        <strong>${U.esc(food.name)}</strong>
        <div class="qty">
          <input id="fd-qty" type="number" inputmode="decimal" value="${hasUnit ? 1 : 100}" min="0" step="${hasUnit ? 1 : 10}" />
          ${hasUnit ? `<select id="fd-mode">
              <option value="unit">${U.esc(food.unit)} (${food.unitGrams} ג')</option>
              <option value="g">גרם</option>
            </select>` : `<span>גרם</span>`}
          <button id="fd-confirm" class="btn-primary">הוסף</button>
        </div>
        <div id="fd-preview" class="add-preview"></div>
      </div>`;
    const qty = root.querySelector("#fd-qty");
    const mode = root.querySelector("#fd-mode");
    const preview = root.querySelector("#fd-preview");

    function gramsNow() {
      const q = parseFloat(qty.value) || 0;
      if (hasUnit && (!mode || mode.value === "unit")) return q * food.unitGrams;
      return q;
    }
    function label() {
      const q = parseFloat(qty.value) || 0;
      if (hasUnit && (!mode || mode.value === "unit")) return `${U.round(q)} ${food.unit} (${Math.round(gramsNow())} ג')`;
      return `${Math.round(gramsNow())} ג'`;
    }
    function upd() {
      const f = gramsNow() / 100;
      preview.textContent = `${Math.round(food.kcal * f)} קק"ל · חלבון ${U.round(food.protein * f)} ג' · פחמ' ${U.round(food.carbs * f)} · שומן ${U.round(food.fat * f)}`;
    }
    qty.addEventListener("input", upd);
    if (mode) mode.addEventListener("change", () => { qty.value = mode.value === "unit" ? 1 : 100; qty.step = mode.value === "unit" ? 1 : 10; upd(); });
    upd();

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
