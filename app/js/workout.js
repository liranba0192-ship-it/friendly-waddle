"use strict";
window.App = window.App || {};

App.workout = (function () {
  const U = App.util, S = App.store;
  let root, current = null; // exerciseId currently open

  const DEFAULT_EXERCISES = [
    { id: "squat", name: "סקוואט", muscle: "רגליים" },
    { id: "bench", name: "לחיצת חזה", muscle: "חזה" },
    { id: "deadlift", name: "דדליפט", muscle: "גב/רגליים" },
    { id: "ohp", name: "לחיצת כתפיים", muscle: "כתפיים" },
    { id: "row", name: "חתירה", muscle: "גב" },
    { id: "pullup", name: "מתח", muscle: "גב" },
    { id: "curl", name: "כפיפת מרפק", muscle: "יד קדמית" },
    { id: "legpress", name: "לחיצת רגליים", muscle: "רגליים" },
  ];
  const TARGET_REPS = 12;   // קצה עליון של טווח החזרות
  const MIN_REPS = 8;       // קצה תחתון
  const STEP_KG = 2.5;      // עלייה במשקל

  function data() {
    return S.get("workout", { exercises: DEFAULT_EXERCISES.slice(), logs: [] });
  }
  function save(d) { S.set("workout", d); }

  function logsFor(d, exId) {
    return d.logs.filter((l) => l.exerciseId === exId).sort((a, b) => b.date.localeCompare(a.date));
  }

  // הצעת Progressive Overload לפי האימון האחרון
  function suggestion(d, exId) {
    const past = logsFor(d, exId);
    if (!past.length) return { text: "אימון ראשון — בחר משקל נוח שמאפשר 8–12 חזרות בטכניקה טובה." };
    const last = past[0];
    const top = last.sets.reduce((m, s) => (s.reps >= m.reps ? s : m), last.sets[0]);
    if (top.reps >= TARGET_REPS) {
      return {
        text: `כל הכבוד! הגעת ל-${top.reps} חזרות ב-${top.weight} ק"ג. הפעם העלה ל-<b>${U.round(top.weight + STEP_KG)} ק"ג</b> וכוון ל-${MIN_REPS} חזרות.`,
        weight: U.round(top.weight + STEP_KG), reps: MIN_REPS,
      };
    }
    return {
      text: `שמור על <b>${top.weight} ק"ג</b> ונסה להוסיף חזרה (יעד: ${top.reps + 1}, עד ${TARGET_REPS}). כשתגיע ל-${TARGET_REPS} — תעלה משקל.`,
      weight: top.weight, reps: Math.min(top.reps + 1, TARGET_REPS),
    };
  }

  function mount(el) { root = el; render(); }
  function show() { render(); }

  function render() {
    if (current) return renderExercise(current);
    renderHome();
  }

  function renderHome() {
    const d = data();
    const today = U.todayISO();
    const cards = d.exercises.map((ex) => {
      const past = logsFor(d, ex.id);
      const last = past[0];
      const lastTxt = last
        ? `אחרון: ${U.prettyDate(last.date)} · ${last.sets.map((s) => `${s.weight}×${s.reps}`).join(", ")}`
        : "טרם תועד";
      const didToday = last && last.date === today;
      return `
        <button class="list-card" data-ex="${ex.id}">
          <div class="lc-main">
            <div class="lc-title">${U.esc(ex.name)} ${didToday ? "✅" : ""}</div>
            <div class="lc-sub">${U.esc(ex.muscle || "")} · ${U.esc(lastTxt)}</div>
          </div>
          <span class="lc-chevron">‹</span>
        </button>`;
    }).join("");

    root.innerHTML = `
      <p class="section-hint">💪 בחר תרגיל כדי לתעד סטים ולקבל הצעת התקדמות (Progressive Overload).</p>
      <div class="list-cards">${cards}</div>
      <button id="wk-add" class="btn-secondary full">➕ הוסף תרגיל</button>
    `;
    root.querySelectorAll("[data-ex]").forEach((b) =>
      b.addEventListener("click", () => { current = b.dataset.ex; render(); })
    );
    root.querySelector("#wk-add").addEventListener("click", addExercise);
  }

  function addExercise() {
    const name = prompt("שם התרגיל:");
    if (!name) return;
    const muscle = prompt("קבוצת שריר (לא חובה):") || "";
    const d = data();
    d.exercises.push({ id: U.uid(), name: name.trim(), muscle: muscle.trim() });
    save(d);
    render();
  }

  function renderExercise(exId) {
    const d = data();
    const ex = d.exercises.find((e) => e.id === exId);
    if (!ex) { current = null; return render(); }
    const sug = suggestion(d, exId);
    const past = logsFor(d, exId);

    const history = past.map((l) => `
      <div class="log-row">
        <span class="log-date">${U.prettyDate(l.date)} · יום ${U.dayName(l.date)}</span>
        <span class="log-sets">${l.sets.map((s) => `${s.weight}×${s.reps}`).join(" · ")}</span>
        <button class="del-x" data-del="${l.id}" aria-label="מחק">✕</button>
      </div>`).join("") || `<p class="status">אין היסטוריה עדיין.</p>`;

    root.innerHTML = `
      <button id="wk-back" class="btn-secondary">‹ חזרה לתרגילים</button>
      <h2 class="view-h2">${U.esc(ex.name)}</h2>

      <div class="suggest-box">💡 ${sug.text}</div>

      <div class="card-block">
        <h3>תיעוד אימון היום</h3>
        <div id="wk-sets"></div>
        <button id="wk-addset" class="btn-secondary">➕ הוסף סט</button>
        <button id="wk-savesession" class="btn-primary full">שמור אימון</button>
      </div>

      <div class="card-block">
        <h3>היסטוריה</h3>
        ${history}
      </div>
    `;

    // טופס סטים דינמי
    const setsEl = root.querySelector("#wk-sets");
    const draft = [];
    function addSetRow(weight = sug.weight || "", reps = sug.reps || "") {
      const i = draft.length;
      draft.push({ weight, reps });
      const row = document.createElement("div");
      row.className = "set-input-row";
      row.innerHTML = `
        <span class="set-num">סט ${i + 1}</span>
        <input type="number" inputmode="decimal" step="0.5" placeholder='ק"ג' value="${weight}" data-i="${i}" data-f="weight" />
        <span>×</span>
        <input type="number" inputmode="numeric" placeholder="חזרות" value="${reps}" data-i="${i}" data-f="reps" />
      `;
      setsEl.appendChild(row);
    }
    addSetRow();
    setsEl.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.i != null) draft[+t.dataset.i][t.dataset.f] = t.value;
    });

    root.querySelector("#wk-addset").addEventListener("click", () => addSetRow());
    root.querySelector("#wk-back").addEventListener("click", () => { current = null; render(); });
    root.querySelector("#wk-savesession").addEventListener("click", () => {
      const sets = draft
        .map((s) => ({ weight: parseFloat(s.weight), reps: parseInt(s.reps, 10) }))
        .filter((s) => s.weight > 0 && s.reps > 0);
      if (!sets.length) { alert("הזן לפחות סט אחד עם משקל וחזרות."); return; }
      const dd = data();
      dd.logs.push({ id: U.uid(), exerciseId: exId, date: U.todayISO(), sets });
      save(dd);
      render();
    });

    root.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!confirm("למחוק את הרישום?")) return;
        const dd = data();
        dd.logs = dd.logs.filter((l) => l.id !== b.dataset.del);
        save(dd);
        render();
      })
    );
  }

  return { mount, show };
})();
