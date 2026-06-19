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

  function dBetween(a, b) {
    const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }
  function addDays(iso, n) {
    const p = iso.split("-").map(Number); const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    dt.setUTCDate(dt.getUTCDate() + n); const p2 = (x) => String(x).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
  }

  function insightsCard(data, g) {
    if (!data.length) return "";
    const last = data[data.length - 1], first = data[0];
    const cutoff = addDays(U.todayISO(), -6);
    const wk = data.filter((w) => w.date >= cutoff);
    const avg7 = U.round((wk.length ? wk : [last]).reduce((a, w) => a + w.kg, 0) / (wk.length || 1));
    let weekly = null; const span = dBetween(first.date, last.date);
    if (span >= 3) weekly = (last.kg - first.kg) / span * 7;
    const trend = weekly == null ? "—" : (Math.abs(weekly) < 0.05 ? "➡️ יציב" : (weekly < 0 ? `⬇️ ${U.round(weekly)}` : `⬆️ +${U.round(weekly)}`));
    const h = App.nutrition.profile().height;
    let bmi = "—";
    if (h > 0) { const v = last.kg / ((h / 100) ** 2); const c = v < 18.5 ? "תת" : v < 25 ? "תקין" : v < 30 ? "עודף" : "השמנה"; bmi = `${U.round(v)} · ${c}`; }
    let rem = "—", eta = "—", motiv = "";
    if (g) {
      rem = `${Math.abs(U.round(last.kg - g))} ק"ג`;
      if (Math.abs(last.kg - g) < 0.2) { motiv = "🎉 הגעת ליעד! כל הכבוד!"; eta = "הגעת ✅"; }
      else if (weekly && ((g < last.kg && weekly < 0) || (g > last.kg && weekly > 0))) {
        eta = U.prettyDate(addDays(U.todayISO(), Math.round(Math.abs((last.kg - g) / weekly) * 7)));
        motiv = "💪 אתה בכיוון הנכון — ממשיכים!";
      } else if (weekly) { motiv = "⚠️ המשקל לא בכיוון היעד. כוונן את הקלוריות במחשבון למטה."; }
    }
    return `<div class="card-block">
      <h3>📈 תובנות</h3>
      <div class="totals-grid">
        ${miniStat("ממוצע 7 ימים", avg7 + ' ק"ג')}
        ${miniStat("מגמה לשבוע", trend)}
        ${miniStat("BMI", bmi)}
        ${miniStat("נותרו ליעד", rem)}
        ${miniStat("צפי הגעה ליעד", eta)}
      </div>
      ${motiv ? `<div class="motiv-line">${motiv}</div>` : ""}
    </div>`;
  }

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

      ${insightsCard(data, g)}

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
    if (data.length < 2) return `<p class="status">צריך לפחות 2 שקילות כדי לראות גרף 📈<br><small>הוסף עוד שקילה למטה.</small></p>`;
    const W = 340, H = 200, padX = 30, padT = 18, padB = 26;
    const ys = data.map((d) => d.kg);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (goalKg) { lo = Math.min(lo, goalKg); hi = Math.max(hi, goalKg); }
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    const pad2 = (hi - lo) * 0.12; hi += pad2; lo -= pad2;
    const px = (i) => padX + (i / (data.length - 1)) * (W - padX * 2);
    const py = (kg) => padT + (1 - (kg - lo) / (hi - lo)) * (H - padT - padB);
    const linePts = data.map((d, i) => `${px(i)},${py(d.kg)}`).join(" ");
    const areaPts = `${px(0)},${H - padB} ${linePts} ${px(data.length - 1)},${H - padB}`;
    // קווי רשת אופקיים
    const grid = [0, 0.5, 1].map((f) => {
      const y = padT + f * (H - padT - padB);
      const val = U.round(hi - f * (hi - lo));
      return `<line x1="${padX}" y1="${y}" x2="${W - padX}" y2="${y}" class="ch-grid"/>
              <text x="${padX - 4}" y="${y + 3}" class="ch-txt" text-anchor="end">${val}</text>`;
    }).join("");
    const dots = data.map((d, i) => `<circle cx="${px(i)}" cy="${py(d.kg)}" r="3.5" class="ch-dot" />`).join("");
    // ערך אחרון מודגש
    const lastI = data.length - 1, lastV = data[lastI].kg;
    const lastLabel = `<circle cx="${px(lastI)}" cy="${py(lastV)}" r="5" class="ch-dot-last"/>
      <text x="${px(lastI)}" y="${py(lastV) - 9}" class="ch-last-txt" text-anchor="middle">${U.round(lastV)}</text>`;
    const goalLine = goalKg
      ? `<line x1="${padX}" y1="${py(goalKg)}" x2="${W - padX}" y2="${py(goalKg)}" class="ch-goal" />
         <text x="${W - padX}" y="${py(goalKg) - 4}" class="ch-txt" text-anchor="end">🎯 ${goalKg}</text>`
      : "";
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet" dir="ltr">
      <defs><linearGradient id="wtarea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.35"/>
        <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}
      ${goalLine}
      <polygon points="${areaPts}" fill="url(#wtarea)" stroke="none"/>
      <polyline points="${linePts}" class="ch-line" fill="none" />
      ${dots}${lastLabel}
    </svg>`;
  }

  return { mount, show };
})();
