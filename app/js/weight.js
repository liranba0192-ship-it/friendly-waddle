"use strict";
window.App = window.App || {};

// מקטע משקל (בתוך טאב תזונה): משקל נוכחי והתקדמות ליעד, גרף, תובנות, מחשבון יעד קלוריות, היסטוריה.
App.weight = (function () {
  const U = App.util, S = App.store, N = App.nutrition, I = App.icon;
  const RANGES = [["שבוע", 7], ["חודש", 31], ["3 ח׳", 92], ["הכל", 0]];
  const RATES = [-0.75, -0.5, -0.25, 0, 0.25, 0.5];
  const ACT = [[1.2, "ישיבה רוב היום"], [1.375, "קלה · 1–3 אימונים בשבוע"], [1.55, "בינונית · 3–5 אימונים בשבוע"], [1.725, "גבוהה · 6–7 אימונים בשבוע"], [1.9, "גבוהה מאוד / עבודה פיזית"]];
  let root, range = 31, entryOpen = false;

  // רשומות שקילה: [{id,date,kg}] — מותר כמה שרוצים, גם באותו יום.
  function logs() {
    const l = S.get("weight.logs", []);
    let changed = false;
    for (const w of l) if (!w.id) { w.id = U.uid(); changed = true; }
    if (changed) S.set("weight.logs", l);
    return l.slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
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
  const goodDown = () => N.profile().goalDir !== "gain";

  function stats(data, g) {
    const last = data[data.length - 1], first = data[0];
    const wk = data.filter((w) => w.date >= addDays(U.todayISO(), -6));
    const avg7 = U.round((wk.length ? wk : [last]).reduce((a, w) => a + w.kg, 0) / (wk.length || 1));
    const span = dBetween(first.date, last.date);
    const weekly = span >= 3 ? (last.kg - first.kg) / span * 7 : null;
    const h = N.profile().height;
    const bmi = h > 0 ? last.kg / ((h / 100) ** 2) : null;
    let etaWeeks = null, reached = false, wrongWay = false;
    if (g) {
      if (Math.abs(last.kg - g) < 0.2) reached = true;
      else if (weekly && ((g < last.kg && weekly < 0) || (g > last.kg && weekly > 0))) etaWeeks = Math.max(1, Math.round(Math.abs((last.kg - g) / weekly)));
      else if (weekly) wrongWay = true;
    }
    return { last, first, avg7, weekly, bmi, etaWeeks, reached, wrongWay };
  }

  function render() {
    const data = logs();
    const g = goal();
    const today = U.todayISO();

    let hero;
    if (!data.length) {
      hero = `<section class="hero" style="padding:20px;display:flex;flex-direction:column;gap:14px" aria-label="משקל">
        <span class="lbl">עוד אין שקילות</span><h2 class="t2">הזן שקילה ראשונה כדי לראות התקדמות</h2>
        ${entryForm()}</section>`;
    } else {
      const st = stats(data, g);
      const diff = U.round(st.last.kg - st.first.kg);
      const good = diff === 0 ? null : (diff < 0) === goodDown();
      let prog = "";
      if (g) {
        const total = Math.abs(st.first.kg - g) || 1;
        const pct = Math.max(0, Math.min(100, Math.round((1 - Math.abs(st.last.kg - g) / total) * 100)));
        prog = `<div style="display:flex;flex-direction:column;gap:8px">
          <div class="bar"><i style="width:${pct}%"></i></div>
          <div style="display:flex;justify-content:space-between"><span class="lbl">התחלה ${U.round(st.first.kg)}</span><span class="lbl">${pct}% מהדרך</span><span class="lbl">יעד <b style="color:var(--text)">${g}</b></span></div>
        </div>`;
      }
      hero = `<section class="hero" style="padding:20px;display:flex;flex-direction:column;gap:18px" aria-label="משקל נוכחי">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
          <div style="display:flex;flex-direction:column;gap:6px">
            <span class="lbl">משקל נוכחי · ${st.last.date === today ? "היום" : U.prettyDate(st.last.date)}</span>
            <span class="numline"><span class="num" style="font-size:56px;font-weight:800">${U.round(st.last.kg)}</span><span class="lbl" style="font-size:16px">ק״ג</span></span>
          </div>
          ${diff ? `<span class="pill ${good ? "good" : "bad"}">${I(diff < 0 ? "down" : "up", 16)}${Math.abs(diff)} ק״ג</span>` : ""}
        </div>
        ${prog}
        ${entryOpen ? entryForm() : `<button class="btn btn-p" id="wt-open">${I("plus")}הזן שקילה</button>`}
        <button class="btn btn-t" id="wt-goal" style="align-self:center;min-height:40px">${g ? "שנה משקל יעד (" + g + ")" : "הגדר משקל יעד"}</button>
      </section>`;
    }

    let chartCard = "", insights = "";
    if (data.length) {
      const from = range ? addDays(today, -range + 1) : "0000";
      const shown = data.filter((w) => w.date >= from);
      chartCard = `<section class="card" style="padding:16px;display:flex;flex-direction:column;gap:14px" aria-label="גרף התקדמות">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <h2 class="t3">התקדמות</h2>
          <div class="chips" role="group" aria-label="טווח">${RANGES.map(([l, d]) => `<button class="chip sm${d === range ? " on" : ""}" data-range="${d}" aria-pressed="${d === range}">${l}</button>`).join("")}</div>
        </div>
        ${chart(shown, g)}
      </section>`;
      const st = stats(data, g);
      const trendGood = st.weekly == null ? null : (st.weekly < 0) === goodDown();
      const bmiCat = st.bmi == null ? "" : st.bmi < 18.5 ? "תת-משקל" : st.bmi < 25 ? "תקין" : st.bmi < 30 ? "עודף" : "השמנה";
      insights = `<h2 class="sec-title">תובנות</h2>
        <div class="two-col" style="gap:8px">
          <div class="card stat"><span class="lbl">ממוצע 7 ימים</span><span class="num" style="font-size:24px">${st.avg7}</span></div>
          <div class="card stat"><span class="lbl">מגמה</span><span class="num" style="font-size:24px${trendGood == null ? "" : `;color:var(${trendGood ? "--green" : "--danger"})`}">${st.weekly == null ? "—" : (st.weekly > 0 ? "+" : "") + U.round(st.weekly)}<span class="lbl"> ק״ג/שבוע</span></span></div>
          <div class="card stat"><span class="lbl">BMI</span><span class="num" style="font-size:24px">${st.bmi == null ? "—" : U.round(st.bmi)}<span class="lbl"> ${bmiCat}</span></span></div>
          <div class="card stat"><span class="lbl">${g ? "צפי להגעה ליעד" : "נותרו ליעד"}</span><span class="num" style="font-size:24px">${!g ? "—" : st.reached ? "הגעת" : st.etaWeeks ? `~${st.etaWeeks}<span class="lbl"> שבועות</span>` : `${Math.abs(U.round(st.last.kg - g))}<span class="lbl"> ק״ג</span>`}</span></div>
        </div>
        ${st.wrongWay ? `<p class="lbl" style="margin:0 4px">המשקל לא זז בכיוון היעד — כדאי לעדכן את יעד הקלוריות במחשבון.</p>` : ""}`;
    }

    const hist = data.slice().reverse();
    root.innerHTML = `
      <div class="stack">
        ${hero}
        ${chartCard}
        ${insights}
        <h2 class="sec-title">מחשבון יעד קלוריות</h2>
        ${calculatorCard(data)}
        <button class="btn btn-t" id="wt-remind" style="align-self:center">${I("bell", 20)}תזכורת שקילה שבועית</button>
        ${hist.length ? `<details class="card hist-box"><summary><span class="t3">היסטוריית שקילות</span><span class="lbl">${hist.length}</span></summary>
          ${hist.map((w) => `<div class="hist-row"><span class="grow">${U.dayName(w.date)} · ${U.prettyDate(w.date)}</span>
            <span class="num" style="font-size:16px">${U.round(w.kg)} <span class="lbl">ק״ג</span></span>
            <button class="ibtn ghost sm" data-del="${w.id}" aria-label="מחק שקילה מ-${U.prettyDate(w.date)}">${I("trash", 18)}</button></div>`).join("")}
        </details>` : ""}
      </div>`;

    const open = root.querySelector("#wt-open");
    if (open) open.addEventListener("click", () => { entryOpen = true; render(); const k = root.querySelector("#wt-kg"); if (k) k.focus(); });
    const saveBtn = root.querySelector("#wt-save");
    if (saveBtn) saveBtn.addEventListener("click", () => {
      const date = root.querySelector("#wt-date").value || today;
      const kg = parseFloat(root.querySelector("#wt-kg").value);
      if (!(kg > 0)) { alert('הזן משקל בק"ג.'); return; }
      const list = logs(); list.push({ id: U.uid(), date, kg }); save(list);
      entryOpen = false; render();
    });
    const cancel = root.querySelector("#wt-cancel");
    if (cancel) cancel.addEventListener("click", () => { entryOpen = false; render(); });
    const goalBtn = root.querySelector("#wt-goal");
    if (goalBtn) goalBtn.addEventListener("click", () => {
      const v = prompt('משקל יעד בק"ג (ריק = ללא יעד):', g || "");
      if (v === null) return;
      const n = parseFloat(v); saveGoal(n > 0 ? n : null); render();
    });
    root.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { range = +b.dataset.range; render(); }));
    root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      if (!confirm("למחוק את השקילה?")) return;
      save(logs().filter((w) => w.id !== b.dataset.del)); render();
    }));
    root.querySelector("#wt-remind").addEventListener("click", () => App.openSettings && App.openSettings());
    bindCalculator(data);
  }

  function entryForm() {
    return `<div class="entry-form">
      <div class="two-col" style="gap:8px">
        <label class="fl"><span class="lbl">משקל (ק״ג)</span><input id="wt-kg" type="number" inputmode="decimal" step="0.1" placeholder="78.4"></label>
        <label class="fl"><span class="lbl">תאריך</span><input id="wt-date" type="date" value="${U.todayISO()}"></label>
      </div>
      <div style="display:flex;gap:8px"><button class="btn btn-p" id="wt-save" style="flex:1">שמור שקילה</button>${logs().length ? `<button class="btn btn-s" id="wt-cancel">ביטול</button>` : ""}</div>
      <span class="lbl">אפשר כמה שקילות ביום — הגרף מציג את כולן.</span>
    </div>`;
  }

  // ---------- מחשבון יעד קלוריות ----------
  function curRate(p) { return p.goalDir === "maintain" ? 0 : (p.goalDir === "gain" ? 1 : -1) * (p.goalRate || 0.5); }
  function calculatorCard(data) {
    const p = N.profile();
    const w = N.latestWeight();
    const rate = curRate(p);
    const tg = N.targets();
    return `<section class="card calc" style="padding:16px;display:flex;flex-direction:column;gap:14px" aria-label="מחשבון יעד קלוריות">
      ${w ? "" : `<label class="fl"><span class="lbl">משקל נוכחי (ק״ג)</span><input id="ca-weight" type="number" inputmode="decimal" step="0.1" placeholder="מהשקילה"></label>`}
      <div class="two-col" style="gap:10px">
        <label class="fl"><span class="lbl">גובה (ס״מ)</span><input id="ca-height" type="number" inputmode="numeric" value="${p.height}"></label>
        <label class="fl"><span class="lbl">גיל</span><input id="ca-age" type="number" inputmode="numeric" value="${p.age}"></label>
      </div>
      <div class="fl"><span class="lbl">מין</span>
        <div class="seg" role="group" aria-label="מין"><button data-sex="male" class="${p.sex === "male" ? "on" : ""}" aria-pressed="${p.sex === "male"}">זכר</button><button data-sex="female" class="${p.sex === "female" ? "on" : ""}" aria-pressed="${p.sex === "female"}">נקבה</button></div></div>
      <label class="fl"><span class="lbl">רמת פעילות</span>
        <select id="ca-activity">${ACT.map(([v, l]) => `<option value="${v}" ${Number(p.activity) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <div class="fl"><span class="lbl">קצב (ק״ג לשבוע)</span>
        <div class="rate-grid" role="group" aria-label="קצב">${RATES.map((r) => `<button class="chip${r === rate ? " on" : ""}" data-rate="${r}" aria-pressed="${r === rate}">${r === 0 ? "שמירה" : (r > 0 ? "+" : "−") + Math.abs(r)}</button>`).join("")}</div></div>
      <details class="adv"><summary class="lbl">מתקדם · אחוז שומן מהקלוריות</summary>
        <label class="fl" style="margin-top:8px"><span class="lbl">אחוז שומן (ברירת מחדל 30%)</span><input id="ca-fatpct" type="number" inputmode="decimal" min="15" max="45" value="${p.fatPct || 30}"></label>
        <span class="lbl">החלבון מחושב לפי ק״ג משקל גוף, והפחמימות ממלאות את השאר.</span></details>
      <div class="po-card" style="align-items:center;justify-content:space-between">
        <div style="display:flex;flex-direction:column;gap:4px"><span class="lbl po-lbl">יעד מומלץ</span>
          <span class="num" style="font-size:28px" id="ca-kcal">—</span><span class="lbl" id="ca-macros"></span></div>
        <button class="btn btn-s" id="ca-apply" style="min-height:44px;font-size:14px">עדכן יעד</button>
      </div>
      <span class="lbl" id="ca-warn"></span>
      <span class="lbl">יעד נוכחי: ${tg.kcal} קק״ל · חלבון ${tg.protein} ג׳ · פחמימות ${tg.carbs || 0} ג׳ · שומן ${tg.fat || 0} ג׳</span>
    </section>`;
  }

  function bindCalculator() {
    const p = N.profile();
    let sex = p.sex, rate = curRate(p), computed = null;
    const read = () => ({
      sex,
      age: parseInt(root.querySelector("#ca-age").value, 10) || p.age,
      height: parseFloat(root.querySelector("#ca-height").value) || p.height,
      activity: parseFloat(root.querySelector("#ca-activity").value),
      goalDir: rate === 0 ? "maintain" : rate > 0 ? "gain" : "lose",
      goalRate: Math.abs(rate) || p.goalRate || 0.5,
      fatPct: parseFloat(root.querySelector("#ca-fatpct").value) || 30,
    });
    const weightNow = () => N.latestWeight() || parseFloat((root.querySelector("#ca-weight") || {}).value);
    function recalc() {
      const w = weightNow();
      const kEl = root.querySelector("#ca-kcal");
      if (!(w > 0)) { computed = null; kEl.textContent = "—"; root.querySelector("#ca-macros").textContent = "הזן משקל כדי לחשב"; return; }
      computed = N.computeTargets(read(), w);
      kEl.innerHTML = `${computed.kcal.toLocaleString("he-IL")} <span class="lbl">קק״ל ליום</span>`;
      root.querySelector("#ca-macros").textContent = `חלבון ${computed.protein} ג׳ · פחמימות ${computed.carbs} ג׳ · שומן ${computed.fat} ג׳ · תחזוקה ${computed.tdee}`;
      root.querySelector("#ca-warn").textContent = computed.warn || "";
    }
    root.querySelectorAll("[data-sex]").forEach((b) => b.addEventListener("click", () => {
      sex = b.dataset.sex;
      root.querySelectorAll("[data-sex]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
      recalc();
    }));
    root.querySelectorAll("[data-rate]").forEach((b) => b.addEventListener("click", () => {
      rate = parseFloat(b.dataset.rate);
      root.querySelectorAll("[data-rate]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
      recalc();
    }));
    root.querySelectorAll(".calc input, .calc select").forEach((el) => el.addEventListener("input", recalc));
    recalc();
    root.querySelector("#ca-apply").addEventListener("click", () => {
      if (!computed) { alert("הזן משקל כדי לחשב יעד."); return; }
      N.saveProfile(read());
      N.saveTargets({ kcal: computed.kcal, protein: computed.protein, carbs: computed.carbs, fat: computed.fat });
      alert("היעד עודכן — הוא מופיע ביומן ובמסך הבית.");
      render();
    });
  }

  // ---------- גרף ----------
  function chart(data, goalKg) {
    if (data.length < 2) return `<p class="status">צריך לפחות 2 שקילות בטווח הזה כדי לראות גרף.</p>`;
    const W = 340, H = 180, padL = 8, padR = 30, padT = 16, padB = 16;
    const ys = data.map((d) => d.kg);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (goalKg && goalKg >= lo - 3 && goalKg <= hi + 3) { lo = Math.min(lo, goalKg); hi = Math.max(hi, goalKg); }
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    const pad2 = (hi - lo) * 0.12; hi += pad2; lo -= pad2;
    const t0 = new Date(data[0].date).getTime(), t1 = new Date(data[data.length - 1].date).getTime() || t0 + 1;
    const px = (d, i) => padL + (t1 > t0 ? (new Date(d.date).getTime() - t0) / (t1 - t0) : i / (data.length - 1)) * (W - padL - padR);
    const py = (kg) => padT + (1 - (kg - lo) / (hi - lo)) * (H - padT - padB);
    const pts = data.map((d, i) => `${px(d, i).toFixed(1)},${py(d.kg).toFixed(1)}`);
    const area = `${padL},${H - padB} ${pts.join(" ")} ${px(data[data.length - 1], data.length - 1).toFixed(1)},${H - padB}`;
    const grid = [0, 0.5, 1].map((f) => {
      const y = padT + f * (H - padT - padB);
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" class="ch-grid"/><text x="${W - 2}" y="${y + 4}" class="ch-txt" text-anchor="end">${U.round(hi - f * (hi - lo))}</text>`;
    }).join("");
    const last = data[data.length - 1];
    const goalLine = goalKg && goalKg > lo && goalKg < hi
      ? `<line x1="${padL}" y1="${py(goalKg)}" x2="${W - padR}" y2="${py(goalKg)}" class="ch-goal"/><text x="${padL + 2}" y="${py(goalKg) - 4}" class="ch-txt">יעד ${goalKg}</text>` : "";
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="גרף משקל: מ-${U.round(data[0].kg)} ל-${U.round(last.kg)} ק״ג" dir="ltr" style="direction:ltr">
      <defs><linearGradient id="wtarea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${grid}${goalLine}
      <polygon points="${area}" fill="url(#wtarea)"/>
      <polyline points="${pts.join(" ")}" fill="none" class="ch-line" stroke-width="3"/>
      <circle cx="${px(last, data.length - 1)}" cy="${py(last.kg)}" r="5" class="ch-dot-last"/>
    </svg>`;
  }

  return { mount, show, isHome: () => true };
})();
