"use strict";
window.App = window.App || {};

App.food = (function () {
  const U = App.util, S = App.store;
  let root, db = [], loaded = false, selected = null;

  function entries() { return S.get("food.entries", []); }      // [{id,date,name,grams,kcal,protein,carbs,fat}]
  function custom() { return S.get("food.custom", []); }        // user-added foods (per 100g)
  function targets() { return S.get("food.targets", { kcal: 2200, protein: 150 }); }
  function saveEntries(v) { S.set("food.entries", v); }
  function saveCustom(v) { S.set("food.custom", v); }
  function saveTargets(v) { S.set("food.targets", v); }

  async function ensureDB() {
    if (loaded) return;
    try {
      const res = await fetch(`data/foods.json?ts=${Date.now()}`, { cache: "force-cache" });
      const json = await res.json();
      db = json.foods || [];
    } catch { db = []; }
    loaded = true;
  }

  function allFoods() {
    return [...custom().map((f) => ({ ...f, custom: true })), ...db];
  }

  async function mount(el) { root = el; await ensureDB(); render(); }
  async function show() { await ensureDB(); render(); }

  function render() {
    const today = U.todayISO();
    const todays = entries().filter((e) => e.date === today);
    const tot = todays.reduce((a, e) => ({
      kcal: a.kcal + e.kcal, protein: a.protein + e.protein,
      carbs: a.carbs + e.carbs, fat: a.fat + e.fat,
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const tg = targets();

    const rows = todays.map((e) => `
      <div class="log-row">
        <span class="log-date">${U.esc(e.name)} · ${e.grams} ג'</span>
        <span class="log-sets">${Math.round(e.kcal)} קק"ל · ${U.round(e.protein)} ח'</span>
        <button class="del-x" data-del="${e.id}" aria-label="מחק">✕</button>
      </div>`).join("") || `<p class="status">עדיין לא הוספת מאכלים היום.</p>`;

    root.innerHTML = `
      <div class="totals-grid">
        ${stat("קלוריות", Math.round(tot.kcal), tg.kcal, 'קק"ל')}
        ${stat("חלבון", U.round(tot.protein), tg.protein, "ג'")}
        ${miniStat("פחמימות", U.round(tot.carbs) + " ג'")}
        ${miniStat("שומן", U.round(tot.fat) + " ג'")}
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

      <button id="fd-settings" class="btn-secondary full">⚙️ יעדים יומיים והוספת מאכל מותאם</button>
    `;

    const search = root.querySelector("#fd-search");
    const results = root.querySelector("#fd-results");
    search.addEventListener("input", () => renderResults(search.value, results));
    renderResults("", results);

    root.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        saveEntries(entries().filter((e) => e.id !== b.dataset.del));
        render();
      })
    );
    root.querySelector("#fd-settings").addEventListener("click", openSettings);
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
  function miniStat(label, val) {
    return `<div class="stat-card mini"><div class="stat-label">${label}</div><div class="stat-value">${val}</div></div>`;
  }

  function renderResults(q, container) {
    q = q.trim();
    let list = allFoods();
    if (q) list = list.filter((f) => f.name.includes(q));
    list = list.slice(0, 30);
    if (!list.length) { container.innerHTML = `<p class="status">לא נמצא. אפשר להוסיף מאכל מותאם בהגדרות.</p>`; return; }
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
    selected = food;
    const box = root.querySelector("#fd-add");
    box.hidden = false;
    box.innerHTML = `
      <div class="add-row">
        <strong>${U.esc(food.name)}</strong>
        <div class="qty">
          <input id="fd-grams" type="number" inputmode="decimal" value="100" min="1" /> <span>גרם</span>
          <button id="fd-confirm" class="btn-primary">הוסף</button>
        </div>
        <div id="fd-preview" class="add-preview"></div>
      </div>`;
    const grams = root.querySelector("#fd-grams");
    const preview = root.querySelector("#fd-preview");
    function upd() {
      const g = parseFloat(grams.value) || 0;
      const f = g / 100;
      preview.textContent = `${Math.round(food.kcal * f)} קק"ל · חלבון ${U.round(food.protein * f)} ג' · פחמ' ${U.round(food.carbs * f)} · שומן ${U.round(food.fat * f)}`;
    }
    grams.addEventListener("input", upd); upd();
    root.querySelector("#fd-confirm").addEventListener("click", () => {
      const g = parseFloat(grams.value);
      if (!(g > 0)) { alert("הזן כמות בגרמים."); return; }
      const f = g / 100;
      const list = entries();
      list.push({
        id: U.uid(), date: U.todayISO(), name: food.name, grams: g,
        kcal: food.kcal * f, protein: food.protein * f, carbs: food.carbs * f, fat: food.fat * f,
      });
      saveEntries(list);
      selected = null;
      render();
    });
  }

  function openSettings() {
    const tg = targets();
    root.innerHTML = `
      <button id="fd-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block">
        <h3>יעדים יומיים</h3>
        <label class="field">יעד קלוריות (קק"ל)
          <input id="tg-kcal" type="number" value="${tg.kcal}" />
        </label>
        <label class="field">יעד חלבון (ג')
          <input id="tg-protein" type="number" value="${tg.protein}" />
        </label>
        <button id="tg-save" class="btn-primary full">שמור יעדים</button>
      </div>
      <div class="card-block">
        <h3>הוספת מאכל מותאם (ל-100 ג')</h3>
        <label class="field">שם <input id="cf-name" type="text" /></label>
        <div class="grid2">
          <label class="field">קלוריות <input id="cf-kcal" type="number" /></label>
          <label class="field">חלבון <input id="cf-protein" type="number" /></label>
          <label class="field">פחמימות <input id="cf-carbs" type="number" /></label>
          <label class="field">שומן <input id="cf-fat" type="number" /></label>
        </div>
        <button id="cf-save" class="btn-primary full">הוסף למאגר</button>
      </div>
    `;
    root.querySelector("#fd-back").addEventListener("click", render);
    root.querySelector("#tg-save").addEventListener("click", () => {
      saveTargets({
        kcal: parseInt(root.querySelector("#tg-kcal").value, 10) || tg.kcal,
        protein: parseInt(root.querySelector("#tg-protein").value, 10) || tg.protein,
      });
      render();
    });
    root.querySelector("#cf-save").addEventListener("click", () => {
      const name = root.querySelector("#cf-name").value.trim();
      if (!name) { alert("הזן שם מאכל."); return; }
      const num = (id) => parseFloat(root.querySelector(id).value) || 0;
      const list = custom();
      list.unshift({ name, cat: "מותאם", kcal: num("#cf-kcal"), protein: num("#cf-protein"), carbs: num("#cf-carbs"), fat: num("#cf-fat") });
      saveCustom(list);
      alert("נוסף! עכשיו אפשר לחפש אותו.");
      render();
    });
  }

  return { mount, show };
})();
