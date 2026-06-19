"use strict";
window.App = window.App || {};

App.workout = (function () {
  const U = App.util, S = App.store;
  let root;
  let groups = [];          // [{name, exercises:[name,...]}] מהמאגר
  let loaded = false;
  let view = { kind: "home" }; // home | exercise({name,group}) | history
  let selDate = null;
  const curDate = () => selDate || U.todayISO();

  function dateStrip() {
    const today = U.todayISO(), cur = curDate(), p2 = (x) => String(x).padStart(2, "0");
    const base = new Date(), cells = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(base); dt.setDate(base.getDate() - i);
      const iso = `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
      const [, , dd] = iso.split("-");
      cells.push(`<button class="day-cell${iso === cur ? " sel" : ""}" data-day="${iso}">
        <span class="day-name">${iso === today ? "היום" : "יום " + U.dayName(iso)}</span>
        <span class="day-num">${+dd}</span>
        ${isRest(iso) ? '<span class="day-rest">🛌</span>' : ""}
      </button>`);
    }
    return `<div class="date-strip">${cells.join("")}</div>`;
  }

  const TARGET_REPS = 12, MIN_REPS = 8, STEP_KG = 2.5;

  // חלוקות אימון — כל חלוקה והקבוצות שמשתייכות אליה (התאמה לפי תת-מחרוזת)
  const SPLITS = [
    { key: "all", label: "הכל", match: null },
    { key: "push", label: "דחיפה (Push)", match: ["חזה", "כתפיים", "יד אחורית"] },
    { key: "pull", label: "משיכה (Pull)", match: ["גב", "יד קדמית", "אמות"] },
    { key: "legs", label: "רגליים (Legs)", match: ["רגליים"] },
    { key: "arms", label: "ידיים (Arms)", match: ["יד קדמית", "יד אחורית", "אמות"] },
    { key: "upper", label: "פלג עליון", match: ["חזה", "גב", "כתפיים", "יד קדמית", "יד אחורית", "אמות"] },
    { key: "lower", label: "פלג תחתון", match: ["רגליים", "בטן"] },
    { key: "full", label: "גוף מלא (Full Body)", match: ["חזה", "גב", "רגליים", "כתפיים", "יד קדמית", "יד אחורית"] },
    { key: "bro", label: "ברו ספליט (Bro Split)", match: null },
  ];
  function splitFor(date) { return (raw().split || {})[date] || "all"; }
  function setSplit(date, key) {
    const d = raw(); d.split = d.split || {}; d.split[date] = key; save(d);
  }

  // ---------- storage (+ מיגרציה מהפורמט הישן) ----------
  function raw() { return S.get("workout", { customExercises: [], logs: [] }); }
  function save(d) { S.set("workout", d); }

  function migrate() {
    const d = raw();
    let changed = false;
    // פורמט ישן: { exercises:[{id,name,muscle}], logs:[{exerciseId,...}] }
    const OLD = {
      squat: "סקוואט (מוט גב)", bench: "לחיצת חזה במוט (שטוח)", deadlift: "דדליפט",
      ohp: "לחיצת כתפיים במוט (Overhead Press)", row: "חתירה במוט (Barbell Row)",
      pullup: "מתח (Pull-up)", curl: "כפיפת מרפק במוט (Barbell Curl)", legpress: "לחיצת רגליים (Leg Press)",
    };
    if (!d.customExercises) { d.customExercises = []; changed = true; }
    if (d.exercises) {
      const oldIds = Object.keys(OLD);
      for (const ex of d.exercises) {
        if (!oldIds.includes(ex.id)) d.customExercises.push({ name: ex.name, group: ex.muscle || "מותאם אישית" });
      }
      // מפה id->name לתרגום הלוגים
      const idName = {};
      for (const ex of d.exercises) idName[ex.id] = ex.name;
      for (const log of d.logs || []) {
        if (!log.exerciseName) log.exerciseName = OLD[log.exerciseId] || idName[log.exerciseId] || log.exerciseId;
      }
      delete d.exercises;
      changed = true;
    }
    // ודא שלכל לוג יש exerciseName
    for (const log of d.logs || []) {
      if (!log.exerciseName && log.exerciseId) { log.exerciseName = log.exerciseId; changed = true; }
    }
    if (changed) save(d);
  }

  function logs() { return raw().logs || []; }
  function logsForName(name) {
    return logs().filter((l) => l.exerciseName === name).sort((a, b) => b.date.localeCompare(a.date));
  }

  // ---------- progressive overload ----------
  function suggestion(name) {
    const past = logsForName(name);
    if (!past.length) return { text: "אימון ראשון — בחר משקל שמאפשר 8–12 חזרות בטכניקה טובה." };
    const last = past[0];
    const top = last.sets.reduce((m, s) => (s.reps >= m.reps ? s : m), last.sets[0]);
    if (top.reps >= TARGET_REPS) {
      return {
        text: `כל הכבוד! ${top.reps} חזרות ב-${top.weight} ק"ג. הפעם נסה <b>${U.round(top.weight + STEP_KG)} ק"ג</b> ל-${MIN_REPS} חזרות.`,
        weight: U.round(top.weight + STEP_KG), reps: MIN_REPS,
      };
    }
    return {
      text: `שמור על <b>${top.weight} ק"ג</b> והוסף חזרה (יעד ${top.reps + 1}, עד ${TARGET_REPS}). אז תעלה משקל.`,
      weight: top.weight, reps: Math.min(top.reps + 1, TARGET_REPS),
    };
  }

  // ---------- exercises data ----------
  async function ensure() {
    if (loaded) return;
    migrate();
    try {
      const res = await fetch(`data/exercises.json?ts=${Date.now()}`, { cache: "force-cache" });
      groups = (await res.json()).groups || [];
    } catch { groups = []; }
    loaded = true;
  }

  function allGroups() {
    const g = groups.map((x) => ({ name: x.name, exercises: x.exercises.slice() }));
    const custom = raw().customExercises || [];
    if (custom.length) {
      const map = {};
      for (const c of custom) (map[c.group || "מותאם אישית"] ??= []).push(c.name);
      for (const [gname, list] of Object.entries(map)) {
        const existing = g.find((x) => x.name === gname);
        if (existing) existing.exercises.push(...list);
        else g.push({ name: gname, exercises: list });
      }
    }
    return g;
  }

  // ---------- lifecycle ----------
  async function mount(el) { root = el; await ensure(); render(); }
  async function show() { await ensure(); render(); }

  function render() {
    if (view.kind === "exercise") return renderExercise(view.name);
    if (view.kind === "history") return renderHistory();
    renderHome();
  }

  // ---------- home (grouped) ----------
  function weekSummary() {
    const all = logs();
    const base = new Date(); const p2 = (x) => String(x).padStart(2, "0");
    const weekAgo = new Date(base); weekAgo.setDate(base.getDate() - 6);
    const wIso = `${weekAgo.getFullYear()}-${p2(weekAgo.getMonth() + 1)}-${p2(weekAgo.getDate())}`;
    const recent = all.filter((l) => l.date >= wIso);
    const days = new Set(recent.map((l) => l.date)).size;
    const sets = recent.reduce((a, l) => a + l.sets.length, 0);
    const last = all.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    const lastTxt = last ? (last.date === U.todayISO() ? "היום" : U.prettyDate(last.date)) : "—";
    const mini = (label, val) => `<div class="stat-card mini"><div class="stat-label">${label}</div><div class="stat-value">${val}</div></div>`;
    return `<div class="dash-summary">
      ${mini("אימונים השבוע", days)}
      ${mini("סטים השבוע", sets)}
      ${mini("אימון אחרון", lastTxt)}
    </div>`;
  }

  function renderHome() {
    const latest = {};
    for (const l of logs()) {
      if (!latest[l.exerciseName] || l.date > latest[l.exerciseName].date) latest[l.exerciseName] = l;
    }
    const today = U.todayISO();

    // סינון קבוצות לפי חלוקת האימון שנבחרה ליום
    const curSplit = splitFor(curDate());
    const splitDef = SPLITS.find((s) => s.key === curSplit) || SPLITS[0];
    const groupsToShow = allGroups().filter((g) =>
      !splitDef.match || splitDef.match.some((m) => g.name.includes(m))
    );

    const sections = groupsToShow.map((g) => {
      const items = g.exercises.map((name) => {
        const last = latest[name];
        const sub = last
          ? `${last.date === today ? "היום ✅ · " : U.prettyDate(last.date) + " · "}${last.sets.map((s) => `${s.weight}×${s.reps}`).join(", ")}`
          : "טרם תועד";
        return `
          <button class="list-card" data-ex="${U.esc(name)}">
            <div class="lc-main">
              <div class="lc-title">${U.esc(name)}</div>
              <div class="lc-sub">${U.esc(sub)}</div>
            </div>
            <span class="lc-chevron">‹</span>
          </button>`;
      }).join("");
      return `
        <details class="muscle-group" open>
          <summary>${U.esc(g.name)} <span class="mg-count">${g.exercises.length}</span></summary>
          <div class="list-cards">${items}</div>
        </details>`;
    }).join("");

    // מה תועד ביום הנבחר
    const dayLogs = logsForDate(curDate());
    const doneHtml = dayLogs.length
      ? dayLogs.map((l) => `
        <div class="log-row">
          <span class="log-date">${U.esc(l.exerciseName)}</span>
          <span class="log-sets">${l.sets.map((s) => `${s.weight}×${s.reps}`).join(" · ")}</span>
          <button class="del-x" data-del="${l.id}" aria-label="מחק">✕</button>
        </div>`).join("")
      : `<p class="status">לא תועד אימון ביום זה. בחר תרגיל למטה כדי לתעד.</p>`;
    const isToday = curDate() === U.todayISO();
    const dayTitle = isToday ? "האימון של היום" : `אימון מ-${U.prettyDate(curDate())} (יום ${U.dayName(curDate())})`;
    const rest = isRest(curDate());
    const dayBody = rest
      ? `<div class="rest-banner">🛌 יום מנוחה — תן לשרירים להתאושש 💪</div>`
      : doneHtml;

    root.innerHTML = `
      ${weekSummary()}
      ${dateStrip()}
      <div class="card-block">
        <h3>${dayTitle}</h3>
        ${dayBody}
        <button id="wk-rest" class="btn-secondary full">${rest ? "↩️ בטל יום מנוחה" : "🛌 סמן כיום מנוחה"}</button>
      </div>
      <div class="row-btns">
        <button id="wk-history" class="btn-secondary">📋 היסטוריה</button>
        <button id="wk-add" class="btn-secondary">➕ הוסף תרגיל</button>
      </div>
      <p class="section-hint" style="margin-bottom:6px">חלוקת אימון להיום:</p>
      <div class="split-chips">
        ${SPLITS.map((s) => `<button class="split-chip${s.key === curSplit ? " sel" : ""}" data-split="${s.key}">${s.label}</button>`).join("")}
      </div>
      ${sections || `<p class="status">אין קבוצות לחלוקה זו.</p>`}
    `;
    root.querySelectorAll("[data-day]").forEach((b) =>
      b.addEventListener("click", () => { selDate = b.dataset.day; render(); })
    );
    root.querySelector("#wk-rest").addEventListener("click", () => { toggleRest(curDate()); render(); });
    root.querySelectorAll("[data-split]").forEach((b) =>
      b.addEventListener("click", () => { setSplit(curDate(), b.dataset.split); render(); })
    );
    root.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        const d = raw(); d.logs = (d.logs || []).filter((l) => l.id !== b.dataset.del); save(d); render();
      })
    );
    root.querySelectorAll("[data-ex]").forEach((b) =>
      b.addEventListener("click", () => { view = { kind: "exercise", name: b.dataset.ex }; render(); })
    );
    root.querySelector("#wk-history").addEventListener("click", () => { view = { kind: "history" }; render(); });
    root.querySelector("#wk-add").addEventListener("click", addExercise);
  }

  function logsForDate(date) {
    return logs().filter((l) => l.date === date);
  }

  // ימי מנוחה
  function restDays() { return raw().restDays || []; }
  function isRest(date) { return restDays().includes(date); }
  function toggleRest(date) {
    const d = raw();
    d.restDays = d.restDays || [];
    const i = d.restDays.indexOf(date);
    if (i >= 0) d.restDays.splice(i, 1); else d.restDays.push(date);
    save(d);
  }

  function addExercise() {
    const name = prompt("שם התרגיל:");
    if (!name || !name.trim()) return;
    const group = prompt("קבוצת שריר (חזה / גב / רגליים / כתפיים / יד קדמית (ביצפס) / יד אחורית (טריצפס) / בטן וליבה / אירובי):") || "מותאם אישית";
    const d = raw();
    (d.customExercises ??= []).push({ name: name.trim(), group: group.trim() || "מותאם אישית" });
    save(d);
    render();
  }

  // ---------- single exercise ----------
  function renderExercise(name) {
    const sug = suggestion(name);
    const past = logsForName(name);
    const history = past.map((l) => `
      <div class="log-row">
        <span class="log-date">${U.prettyDate(l.date)} · יום ${U.dayName(l.date)}</span>
        <span class="log-sets">${l.sets.map((s) => `${s.weight}×${s.reps}`).join(" · ")}</span>
        <button class="del-x" data-del="${l.id}" aria-label="מחק">✕</button>
      </div>`).join("") || `<p class="status">אין היסטוריה לתרגיל זה.</p>`;

    root.innerHTML = `
      <button id="wk-back" class="btn-secondary">‹ חזרה לתרגילים</button>
      <h2 class="view-h2">${U.esc(name)}</h2>
      <div class="row-btns">
        <button id="wk-video" class="btn-secondary">▶️ צפה בהדגמה</button>
        <button id="wk-img" class="btn-secondary">🖼️ תמונות</button>
      </div>
      <div class="suggest-box">💡 ${sug.text}</div>
      <div class="card-block">
        <h3>תיעוד ל-${curDate() === U.todayISO() ? "היום" : U.prettyDate(curDate())}</h3>
        <div id="wk-sets"></div>
        <button id="wk-addset" class="btn-secondary">➕ הוסף סט</button>
        <button id="wk-savesession" class="btn-primary full">שמור אימון</button>
      </div>
      <div class="card-block">
        <h3>היסטוריה</h3>
        ${history}
      </div>
    `;

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
        <input type="number" inputmode="numeric" placeholder="חזרות" value="${reps}" data-i="${i}" data-f="reps" />`;
      setsEl.appendChild(row);
    }
    addSetRow();
    setsEl.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.i != null) draft[+t.dataset.i][t.dataset.f] = t.value;
    });

    root.querySelector("#wk-video").addEventListener("click", () =>
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(name + " תרגיל טכניקה הדגמה")}`, "_blank", "noopener")
    );
    root.querySelector("#wk-img").addEventListener("click", () =>
      window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(name + " exercise")}`, "_blank", "noopener")
    );
    root.querySelector("#wk-addset").addEventListener("click", () => addSetRow());
    root.querySelector("#wk-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
    root.querySelector("#wk-savesession").addEventListener("click", () => {
      const sets = draft
        .map((s) => ({ weight: parseFloat(s.weight), reps: parseInt(s.reps, 10) }))
        .filter((s) => s.weight > 0 && s.reps > 0);
      if (!sets.length) { alert("הזן לפחות סט אחד עם משקל וחזרות."); return; }
      const d = raw();
      (d.logs ??= []).push({ id: U.uid(), exerciseName: name, date: curDate(), sets });
      save(d);
      render();
    });
    root.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!confirm("למחוק את הרישום?")) return;
        const d = raw();
        d.logs = (d.logs || []).filter((l) => l.id !== b.dataset.del);
        save(d);
        render();
      })
    );
  }

  // ---------- full history ----------
  function renderHistory() {
    const all = logs().slice().sort((a, b) => b.date.localeCompare(a.date));
    // קיבוץ לפי תאריך
    const byDate = {};
    for (const l of all) (byDate[l.date] ??= []).push(l);
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    const body = dates.length ? dates.map((date) => `
      <div class="card-block">
        <h3>${U.prettyDate(date)} · יום ${U.dayName(date)}</h3>
        ${byDate[date].map((l) => `
          <div class="log-row">
            <span class="log-date">${U.esc(l.exerciseName)}</span>
            <span class="log-sets">${l.sets.map((s) => `${s.weight}×${s.reps}`).join(" · ")}</span>
            <button class="del-x" data-del="${l.id}" aria-label="מחק">✕</button>
          </div>`).join("")}
      </div>`).join("") : `<p class="status">עדיין אין אימונים מתועדים 🏋️</p>`;

    root.innerHTML = `
      <button id="wk-back" class="btn-secondary">‹ חזרה לתרגילים</button>
      <h2 class="view-h2">📋 היסטוריית אימונים</h2>
      ${body}
    `;
    root.querySelector("#wk-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
    root.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!confirm("למחוק את הרישום?")) return;
        const d = raw();
        d.logs = (d.logs || []).filter((l) => l.id !== b.dataset.del);
        save(d);
        render();
      })
    );
  }

  return { mount, show };
})();
