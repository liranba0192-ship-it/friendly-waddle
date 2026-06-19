"use strict";
window.App = window.App || {};

App.food = (function () {
  const U = App.util, S = App.store;
  let root, db = [], loaded = false, selected = null;

  function entries() { return S.get("food.entries", []); }      // [{id,date,name,grams,kcal,protein,carbs,fat}]
  function custom() { return S.get("food.custom", []); }        // user-added foods (per 100g)
  function targets() { return S.get("food.targets", { kcal: 2200, protein: 150, carbs: 220, fat: 70 }); }
  function profile() { return S.get("food.profile", { sex: "male", age: 30, height: 175, activity: 1.375, goalDir: "lose", goalRate: 0.5 }); }
  function saveEntries(v) { S.set("food.entries", v); }
  function saveCustom(v) { S.set("food.custom", v); }
  function saveTargets(v) { S.set("food.targets", v); }
  function saveProfile(v) { S.set("food.profile", v); }

  // המשקל העדכני ביותר מתוך טאב השקילה (אם קיים)
  function latestWeight() {
    const logs = S.get("weight.logs", []);
    if (!logs.length) return null;
    return logs.slice().sort((a, b) => a.date.localeCompare(b.date)).pop().kg;
  }

  // חישוב יעד קלורי + חלבון לפי TDEE (Mifflin-St Jeor) וקצב היעד השבועי.
  // 1 ק"ג שומן ≈ 7700 קק"ל → התאמה יומית = קצב(ק"ג/שבוע) × 7700 / 7.
  function computeTargets(p, weightKg) {
    const bmr = 10 * weightKg + 6.25 * p.height - 5 * p.age + (p.sex === "male" ? 5 : -161);
    const tdee = bmr * p.activity;
    const dailyAdj = (p.goalRate || 0) * 7700 / 7;
    let kcal = tdee;
    if (p.goalDir === "lose") kcal = tdee - dailyAdj;
    else if (p.goalDir === "gain") kcal = tdee + dailyAdj;
    // רצפת ביטחון כדי לא לרדת נמוך מדי
    const floor = p.sex === "male" ? 1500 : 1200;
    let warn = "";
    if (kcal < floor) { warn = `החישוב יצא נמוך מהמומלץ — הועלה ל-${floor} קק"ל. כדאי לבחור קצב ירידה מתון יותר.`; kcal = floor; }
    // חלבון: 2.0 ג'/ק"ג בירידה, 1.8 אחרת (לשמירת מסת שריר)
    const protein = Math.round(weightKg * (p.goalDir === "lose" ? 2.0 : 1.8));
    // שומן: ~25% מהקלוריות (9 קק"ל לגרם). פחמימה: כל השאר (4 קק"ל לגרם).
    const fat = Math.round((kcal * 0.25) / 9);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal), protein, carbs, fat, warn };
  }

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
    const p = profile();
    const w = latestWeight();
    root.innerHTML = `
      <button id="fd-back" class="btn-secondary">‹ חזרה</button>

      <div class="card-block">
        <h3>🎯 מחשבון יעדים אוטומטי</h3>
        <p class="section-hint">מחשב כמה קלוריות לאכול ביום לפי הקצב שתבחר. המשקל נלקח מהשקילה האחרונה.</p>
        <div class="grid2">
          <label class="field">משקל נוכחי (ק"ג)
            <input id="ca-weight" type="number" inputmode="decimal" step="0.1" value="${w || ""}" placeholder="הזן/מהשקילה" />
          </label>
          <label class="field">גובה (ס"מ)
            <input id="ca-height" type="number" value="${p.height}" />
          </label>
          <label class="field">גיל
            <input id="ca-age" type="number" value="${p.age}" />
          </label>
          <label class="field">מין
            <select id="ca-sex">
              <option value="male" ${p.sex === "male" ? "selected" : ""}>זכר</option>
              <option value="female" ${p.sex === "female" ? "selected" : ""}>נקבה</option>
            </select>
          </label>
        </div>
        <label class="field">רמת פעילות
          <select id="ca-activity">
            <option value="1.2" ${p.activity == 1.2 ? "selected" : ""}>ישיבה רוב היום</option>
            <option value="1.375" ${p.activity == 1.375 ? "selected" : ""}>קלה — 1-3 אימונים בשבוע</option>
            <option value="1.55" ${p.activity == 1.55 ? "selected" : ""}>בינונית — 3-5 אימונים</option>
            <option value="1.725" ${p.activity == 1.725 ? "selected" : ""}>גבוהה — 6-7 אימונים</option>
            <option value="1.9" ${p.activity == 1.9 ? "selected" : ""}>מאוד גבוהה / עבודה פיזית</option>
          </select>
        </label>
        <div class="grid2">
          <label class="field">מטרה
            <select id="ca-dir">
              <option value="lose" ${p.goalDir === "lose" ? "selected" : ""}>ירידה במשקל</option>
              <option value="maintain" ${p.goalDir === "maintain" ? "selected" : ""}>שמירה</option>
              <option value="gain" ${p.goalDir === "gain" ? "selected" : ""}>עלייה במסה</option>
            </select>
          </label>
          <label class="field">קצב (ק"ג בשבוע)
            <select id="ca-rate">
              <option value="0.25" ${p.goalRate == 0.25 ? "selected" : ""}>0.25 — איטי</option>
              <option value="0.5" ${p.goalRate == 0.5 ? "selected" : ""}>0.5 — מומלץ</option>
              <option value="0.75" ${p.goalRate == 0.75 ? "selected" : ""}>0.75 — מהיר</option>
              <option value="1" ${p.goalRate == 1 ? "selected" : ""}>1.0 — אגרסיבי</option>
            </select>
          </label>
        </div>
        <div id="ca-result" class="suggest-box" hidden></div>
        <button id="ca-calc" class="btn-secondary full">חשב</button>
        <button id="ca-apply" class="btn-primary full" hidden>החל את היעדים האלה ✅</button>
      </div>

      <div class="card-block">
        <h3>יעדים יומיים (ידני)</h3>
        <div class="grid2">
          <label class="field">קלוריות (קק"ל)
            <input id="tg-kcal" type="number" value="${tg.kcal}" />
          </label>
          <label class="field">חלבון (ג')
            <input id="tg-protein" type="number" value="${tg.protein}" />
          </label>
          <label class="field">פחמימות (ג')
            <input id="tg-carbs" type="number" value="${tg.carbs || 0}" />
          </label>
          <label class="field">שומן (ג')
            <input id="tg-fat" type="number" value="${tg.fat || 0}" />
          </label>
        </div>
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

    // --- מחשבון יעדים ---
    let computed = null;
    function readProfile() {
      return {
        sex: root.querySelector("#ca-sex").value,
        age: parseInt(root.querySelector("#ca-age").value, 10) || p.age,
        height: parseFloat(root.querySelector("#ca-height").value) || p.height,
        activity: parseFloat(root.querySelector("#ca-activity").value),
        goalDir: root.querySelector("#ca-dir").value,
        goalRate: parseFloat(root.querySelector("#ca-rate").value),
      };
    }
    root.querySelector("#ca-calc").addEventListener("click", () => {
      const weight = parseFloat(root.querySelector("#ca-weight").value);
      if (!(weight > 0)) { alert('הזן משקל נוכחי בק"ג (או רשום שקילה בטאב שקילה).'); return; }
      const prof = readProfile();
      saveProfile(prof);
      computed = computeTargets(prof, weight);
      const dirTxt = prof.goalDir === "lose" ? "ירידה" : prof.goalDir === "gain" ? "עלייה" : "שמירה";
      const box = root.querySelector("#ca-result");
      box.hidden = false;
      box.innerHTML = `
        תחזוקה (TDEE): <b>${computed.tdee}</b> קק"ל ביום.<br>
        ל${dirTxt}${prof.goalDir !== "maintain" ? ` של ${prof.goalRate} ק"ג בשבוע` : ""} — יעד יומי:<br>
        🔥 <b>${computed.kcal} קק"ל</b> · 🥩 חלבון <b>${computed.protein} ג'</b> ·
        🍞 פחמימות <b>${computed.carbs} ג'</b> · 🥑 שומן <b>${computed.fat} ג'</b>
        ${computed.warn ? `<br>⚠️ ${computed.warn}` : ""}`;
      root.querySelector("#ca-apply").hidden = false;
    });
    root.querySelector("#ca-apply").addEventListener("click", () => {
      if (!computed) return;
      saveTargets({ kcal: computed.kcal, protein: computed.protein, carbs: computed.carbs, fat: computed.fat });
      alert("היעדים עודכנו! ✅");
      render();
    });

    root.querySelector("#tg-save").addEventListener("click", () => {
      saveTargets({
        kcal: parseInt(root.querySelector("#tg-kcal").value, 10) || tg.kcal,
        protein: parseInt(root.querySelector("#tg-protein").value, 10) || tg.protein,
        carbs: parseInt(root.querySelector("#tg-carbs").value, 10) || tg.carbs || 0,
        fat: parseInt(root.querySelector("#tg-fat").value, 10) || tg.fat || 0,
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
