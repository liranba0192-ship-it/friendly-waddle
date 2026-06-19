"use strict";
window.App = window.App || {};

App.weight = (function () {
  const U = App.util, S = App.store, N = App.nutrition;
  let root;

  // רשומות שקילה: [{id,date,kg}] — מותר כמה שרוצים, גם באותו יום.
  function logs() {
    let l = S.get("weight.logs", []);
    let changed = false;
    for (const w of l) if (!w.id) { w.id = U.uid(); changed = true; } // מיגרציה מפורמט ישן (לפי תאריך)
    if (changed) S.set("weight.logs", l);
    return l.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }
  function save(v) { S.set("weight.logs", v); }
  function goal() { return S.get("weight.goal", null); }
  function saveGoal(v) { S.set("weight.goal", v); }

  function mount(el) { root = el; render(); }
  function show() { render(); }

  function render() {
    const data = logs();
    const last = data[data.length - 1];
    const first = data[0];
    const g = goal();
    let change = "";
    if (data.length >= 2) {
      const diff = U.round(last.kg - first.kg);
      change = `${diff > 0 ? "+" : ""}${diff} ק"ג`;
    }

    const rows = data.slice().reverse().map((w) => `
      <div class="log-row">
        <span class="log-date">${U.prettyDate(w.date)} · יום ${U.dayName(w.date)}</span>
        <span class="log-sets">${U.round(w.kg)} ק"ג</span>
        <button class="del-x" data-del="${w.id}" aria-label="מחק">✕</button>
      </div>`).join("") || `<p class="status">עדיין אין שקילות.</p>`;

    root.innerHTML = `
      <div class="totals-grid">
        ${miniStat("משקל נוכחי", last ? U.round(last.kg) + ' ק"ג' : "—")}
        ${miniStat("שינוי", change || "—")}
        ${miniStat("יעד", g ? g + ' ק"ג' : "—")}
      </div>

      <div class="card-block">
        <h3>גרף התקדמות</h3>
        <div id="wt-chart">${chart(data, g)}</div>
      </div>

      <div class="card-block">
        <h3>שקילה חדשה</h3>
        <div class="add-row inline">
          <input id="wt-date" type="date" value="${U.todayISO()}" />
          <input id="wt-kg" type="number" inputmode="decimal" step="0.1" placeholder='ק"ג' />
          <button id="wt-save" class="btn-primary">שמור</button>
        </div>
        <p class="section-hint">אפשר להוסיף כמה שקילות שרוצים — גם כמה באותו יום.</p>
      </div>

      <button id="wt-goal" class="btn-secondary full">🎯 הגדר משקל יעד</button>

      ${calculatorCard()}

      <div class="card-block">
        <h3>היסטוריית שקילות</h3>
        ${rows}
      </div>
    `;

    root.querySelector("#wt-save").addEventListener("click", () => {
      const date = root.querySelector("#wt-date").value || U.todayISO();
      const kg = parseFloat(root.querySelector("#wt-kg").value);
      if (!(kg > 0)) { alert('הזן משקל בק"ג.'); return; }
      const list = logs();
      list.push({ id: U.uid(), date, kg });
      save(list);
      render();
    });
    root.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => { save(logs().filter((w) => w.id !== b.dataset.del)); render(); })
    );
    root.querySelector("#wt-goal").addEventListener("click", () => {
      const v = prompt('משקל יעד בק"ג:', g || "");
      if (v === null) return;
      const n = parseFloat(v);
      saveGoal(n > 0 ? n : null);
      render();
    });

    bindCalculator();
  }

  function miniStat(label, val) {
    return `<div class="stat-card mini"><div class="stat-label">${label}</div><div class="stat-value">${val}</div></div>`;
  }

  // ---------- מחשבון יעדים קלוריים (עבר מטאב האוכל) ----------
  function calculatorCard() {
    const p = N.profile();
    const w = N.latestWeight();
    const tg = N.targets();
    return `
      <div class="card-block">
        <h3>🎯 יעד קלוריות — כמה לרדת/לעלות בשבוע</h3>
        <p class="section-hint">בוחרים קצב שבועי והאפליקציה מחשבת כמה לאכול ביום. היעד מופיע בטאב האוכל.</p>
        <div class="grid2">
          <label class="field">משקל נוכחי (ק"ג)
            <input id="ca-weight" type="number" inputmode="decimal" step="0.1" value="${w || ""}" placeholder="מהשקילה" />
          </label>
          <label class="field">גובה (ס"מ)<input id="ca-height" type="number" value="${p.height}" /></label>
          <label class="field">גיל<input id="ca-age" type="number" value="${p.age}" /></label>
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
          <label class="field">קצב חופשי (ק"ג בשבוע)
            <input id="ca-rate" type="number" inputmode="decimal" step="0.05" min="0" value="${p.goalRate}" placeholder="לדוגמה 0.5" />
          </label>
        </div>
        <div id="ca-result" class="suggest-box" hidden></div>
        <button id="ca-calc" class="btn-secondary full">חשב יעד</button>
        <button id="ca-apply" class="btn-primary full" hidden>החל את היעדים ✅</button>
        <p class="section-hint" style="margin-top:10px">יעד נוכחי: 🔥 ${tg.kcal} קק"ל · 🥩 ${tg.protein} ג' · 🍞 ${tg.carbs || 0} ג' · 🥑 ${tg.fat || 0} ג'</p>
      </div>`;
  }

  function bindCalculator() {
    let computed = null;
    const p = N.profile();
    const readProfile = () => ({
      sex: root.querySelector("#ca-sex").value,
      age: parseInt(root.querySelector("#ca-age").value, 10) || p.age,
      height: parseFloat(root.querySelector("#ca-height").value) || p.height,
      activity: parseFloat(root.querySelector("#ca-activity").value),
      goalDir: root.querySelector("#ca-dir").value,
      goalRate: parseFloat(root.querySelector("#ca-rate").value),
    });
    root.querySelector("#ca-calc").addEventListener("click", () => {
      const weight = parseFloat(root.querySelector("#ca-weight").value);
      if (!(weight > 0)) { alert('הזן משקל נוכחי בק"ג (או רשום שקילה למעלה).'); return; }
      const prof = readProfile();
      N.saveProfile(prof);
      computed = N.computeTargets(prof, weight);
      const dirTxt = prof.goalDir === "lose" ? "ירידה" : prof.goalDir === "gain" ? "עלייה" : "שמירה";
      const box = root.querySelector("#ca-result");
      box.hidden = false;
      box.innerHTML = `
        תחזוקה (TDEE): <b>${computed.tdee}</b> קק"ל ביום.<br>
        ל${dirTxt}${prof.goalDir !== "maintain" ? ` של ${prof.goalRate} ק"ג בשבוע` : ""} — יעד יומי:<br>
        🔥 <b>${computed.kcal} קק"ל</b> · 🥩 <b>${computed.protein} ג'</b> ·
        🍞 <b>${computed.carbs} ג'</b> · 🥑 <b>${computed.fat} ג'</b>
        ${computed.warn ? `<br>⚠️ ${computed.warn}` : ""}`;
      root.querySelector("#ca-apply").hidden = false;
    });
    root.querySelector("#ca-apply").addEventListener("click", () => {
      if (!computed) return;
      N.saveTargets({ kcal: computed.kcal, protein: computed.protein, carbs: computed.carbs, fat: computed.fat });
      alert("היעדים עודכנו! ✅ תראה אותם בטאב האוכל.");
      render();
    });
  }

  // ---------- גרף ----------
  function chart(data, goalKg) {
    if (data.length < 2) return `<p class="status">צריך לפחות 2 שקילות כדי לראות גרף 📈</p>`;
    const W = 320, H = 160, pad = 28;
    const ys = data.map((d) => d.kg);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (goalKg) { lo = Math.min(lo, goalKg); hi = Math.max(hi, goalKg); }
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    const px = (i) => pad + (i / (data.length - 1)) * (W - pad * 2);
    const py = (kg) => pad + (1 - (kg - lo) / (hi - lo)) * (H - pad * 2);
    const pts = data.map((d, i) => `${px(i)},${py(d.kg)}`).join(" ");
    const dots = data.map((d, i) => `<circle cx="${px(i)}" cy="${py(d.kg)}" r="3" class="ch-dot" />`).join("");
    const goalLine = goalKg
      ? `<line x1="${pad}" y1="${py(goalKg)}" x2="${W - pad}" y2="${py(goalKg)}" class="ch-goal" />
         <text x="${W - pad}" y="${py(goalKg) - 4}" class="ch-txt" text-anchor="end">יעד ${goalKg}</text>`
      : "";
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet" dir="ltr">
      ${goalLine}
      <polyline points="${pts}" class="ch-line" fill="none" />
      ${dots}
      <text x="4" y="${py(hi) + 4}" class="ch-txt">${U.round(hi)}</text>
      <text x="4" y="${py(lo) + 4}" class="ch-txt">${U.round(lo)}</text>
    </svg>`;
  }

  return { mount, show };
})();
