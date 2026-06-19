"use strict";
window.App = window.App || {};

App.weight = (function () {
  const U = App.util, S = App.store;
  let root;

  function logs() { return S.get("weight.logs", []).slice().sort((a, b) => a.date.localeCompare(b.date)); }
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
      change = `${diff > 0 ? "+" : ""}${diff} ק"ג מההתחלה`;
    }

    const rows = data.slice().reverse().map((w) => `
      <div class="log-row">
        <span class="log-date">${U.prettyDate(w.date)} · יום ${U.dayName(w.date)}</span>
        <span class="log-sets">${U.round(w.kg)} ק"ג</span>
        <button class="del-x" data-del="${w.date}" aria-label="מחק">✕</button>
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
      </div>

      <div class="card-block">
        <h3>היסטוריה</h3>
        ${rows}
      </div>

      <button id="wt-goal" class="btn-secondary full">🎯 הגדר משקל יעד</button>
    `;

    root.querySelector("#wt-save").addEventListener("click", () => {
      const date = root.querySelector("#wt-date").value || U.todayISO();
      const kg = parseFloat(root.querySelector("#wt-kg").value);
      if (!(kg > 0)) { alert('הזן משקל בק"ג.'); return; }
      const list = logs().filter((w) => w.date !== date); // שקילה אחת ליום
      list.push({ date, kg });
      save(list);
      render();
    });
    root.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => { save(logs().filter((w) => w.date !== b.dataset.del)); render(); })
    );
    root.querySelector("#wt-goal").addEventListener("click", () => {
      const v = prompt('משקל יעד בק"ג:', g || "");
      if (v === null) return;
      const n = parseFloat(v);
      saveGoal(n > 0 ? n : null);
      render();
    });
  }

  function miniStat(label, val) {
    return `<div class="stat-card mini"><div class="stat-label">${label}</div><div class="stat-value">${val}</div></div>`;
  }

  // גרף קו פשוט ב-SVG
  function chart(data, goalKg) {
    if (data.length < 2) return `<p class="status">צריך לפחות 2 שקילות כדי לראות גרף 📈</p>`;
    const W = 320, H = 160, pad = 28;
    const xs = data.map((_, i) => i);
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
    const yLabHi = `<text x="4" y="${py(hi) + 4}" class="ch-txt">${U.round(hi)}</text>`;
    const yLabLo = `<text x="4" y="${py(lo) + 4}" class="ch-txt">${U.round(lo)}</text>`;

    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet" dir="ltr">
      ${goalLine}
      <polyline points="${pts}" class="ch-line" fill="none" />
      ${dots}${yLabHi}${yLabLo}
    </svg>`;
  }

  return { mount, show };
})();
