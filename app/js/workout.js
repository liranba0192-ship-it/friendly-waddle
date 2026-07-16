"use strict";
window.App = window.App || {};

App.workout = (function () {
  const U = App.util, S = App.store;
  let root;
  let groups = [];          // [{name, exercises:[name,...]}] מהמאגר
  let loaded = false;
  let view = { kind: "home" }; // home | exercise({name,group}) | history
  const timer = { active: false, paused: false, remaining: 0, _id: null };
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
    { key: "full", label: "גוף מלא (Full Body)", match: ["חזה", "גב", "רגליים", "כתפיים", "יד קדמית", "יד אחורית", "משקל גוף"] },
    { key: "bro", label: "ברו ספליט (Bro Split)", match: null },
  ];
  function splitFor(date) { return (raw().split || {})[date] || "all"; }
  function setSplit(date, key) {
    const d = raw(); d.split = d.split || {}; d.split[date] = key; save(d);
  }

  // מטרת אימון → עצימות (טווח חזרות + מנוחה)
  const GOALS = [
    { key: "cut", label: "🔥 חיטוב", repMin: 12, repMax: 15, rest: "45–60 שׄ", restSecs: 60, tip: "חזרות גבוהות ומנוחות קצרות — שמירה על שריר בזמן גירעון" },
    { key: "mass", label: "💪 מסה", repMin: 8, repMax: 12, rest: "90–120 שׄ", restSecs: 120, tip: "עומס מתון-כבד ונפח גבוה — מקסום היפרטרופיה (בניית שריר)" },
    { key: "neutral", label: "⚖️ ניטרלי", repMin: 8, repMax: 12, rest: "60–90 שׄ", restSecs: 90, tip: "איזון כוח ונפח לכושר כללי" },
  ];
  function trainGoal() {
    const stored = raw().trainGoal;
    if (stored) return stored;
    const dir = App.nutrition.profile().goalDir; // ברירת מחדל לפי מטרת התזונה
    return dir === "lose" ? "cut" : dir === "gain" ? "mass" : "neutral";
  }
  function goalDef() { return GOALS.find((g) => g.key === trainGoal()) || GOALS[2]; }
  function setTrainGoal(key) { const d = raw(); d.trainGoal = key; save(d); }

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

  // ---------- progressive overload (לפי מטרת האימון) ----------
  function suggestion(name) {
    const G = goalDef();
    const past = logsForName(name);
    if (!past.length) return { text: `אימון ראשון (${G.label}) — בחר משקל שמאפשר ${G.repMin}–${G.repMax} חזרות בטכניקה טובה.` };
    const last = past[0];
    const top = last.sets.reduce((m, s) => (s.reps >= m.reps ? s : m), last.sets[0]);
    if (top.reps >= G.repMax) {
      return {
        text: `כל הכבוד! ${top.reps} חזרות ב-${top.weight} ק"ג. הפעם נסה <b>${U.round(top.weight + STEP_KG)} ק"ג</b> ל-${G.repMin} חזרות.`,
        weight: U.round(top.weight + STEP_KG), reps: G.repMin,
      };
    }
    return {
      text: `שמור על <b>${top.weight} ק"ג</b> והוסף חזרה (יעד ${top.reps + 1}, עד ${G.repMax}). אז תעלה משקל.`,
      weight: top.weight, reps: Math.min(top.reps + 1, G.repMax),
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

    const allLogs = logs();
    const sections = groupsToShow.map((g) => {
      // סיכום האימון הקודם של הקבוצה: התאריך האחרון בו תועד תרגיל מהקבוצה
      const inGroup = new Set(g.exercises);
      const gLogs = allLogs.filter((l) => inGroup.has(l.exerciseName) && l.date < curDate());
      let summary = "";
      if (gLogs.length) {
        const lastDate = gLogs.reduce((m, l) => (l.date > m ? l.date : m), gLogs[0].date);
        const onDate = gLogs.filter((l) => l.date === lastDate);
        summary = `<div class="grp-summary">📋 אימון קודם · ${U.prettyDate(lastDate)}:
          ${onDate.map((l) => `<span class="gs-ex">${U.esc(l.exerciseName)} <b>${l.sets.map((s) => `${s.weight}×${s.reps}`).join(", ")}</b></span>`).join("")}</div>`;
      }

      const items = g.exercises.map((name) => {
        const last = latest[name];
        let sub;
        if (last) {
          const sug = suggestion(name);
          const lastTxt = `${last.date === today ? "היום ✅" : U.prettyDate(last.date)} · ${last.sets.map((s) => `${s.weight}×${s.reps}`).join(", ")}`;
          sub = sug.weight ? `${lastTxt} <span class="po-target">🎯 ${sug.weight}×${sug.reps}</span>` : lastTxt;
        } else sub = "טרם תועד";
        return `
          <button class="list-card" data-ex="${U.esc(name)}">
            <div class="lc-main">
              <div class="lc-title">${U.esc(name)}</div>
              <div class="lc-sub">${sub}</div>
            </div>
            <span class="lc-chevron">‹</span>
          </button>`;
      }).join("");
      return `
        <details class="muscle-group" open>
          <summary>${U.esc(g.name)} <span class="mg-count">${g.exercises.length}</span></summary>
          ${summary}
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
    const walked = walkDone(curDate());
    const dayBody = rest
      ? `<div class="rest-banner">
           🛌 יום מנוחה — תן לשרירים להתאושש 💪<br>
           <span class="rest-tip">🚶 מומלץ: <b>30 דק' הליכה קלה</b> (התאוששות אקטיבית)</span>
           <button id="wk-walk" class="btn-${walked ? "secondary" : "primary"} full" style="margin-top:12px">
             ${walked ? "✅ סימנת שהלכת 30 דק'" : "סמן שביצעתי 30 דק' הליכה"}
           </button>
         </div>`
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
      <p class="section-hint" style="margin-bottom:6px">מטרת אימון (קובעת עצימות):</p>
      <div class="split-chips">
        ${GOALS.map((g) => `<button class="split-chip${g.key === trainGoal() ? " sel" : ""}" data-goal="${g.key}">${g.label}</button>`).join("")}
      </div>
      <div class="goal-tip">🎯 ${goalDef().repMin}–${goalDef().repMax} חזרות · מנוחה ${goalDef().rest} — ${goalDef().tip}</div>
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
    const walkBtn = root.querySelector("#wk-walk");
    if (walkBtn) walkBtn.addEventListener("click", () => { toggleWalk(curDate()); render(); });
    root.querySelectorAll("[data-split]").forEach((b) =>
      b.addEventListener("click", () => { setSplit(curDate(), b.dataset.split); render(); })
    );
    root.querySelectorAll("[data-goal]").forEach((b) =>
      b.addEventListener("click", () => { setTrainGoal(b.dataset.goal); render(); })
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
  function walkDone(date) { return (raw().restWalk || []).includes(date); }
  function toggleWalk(date) {
    const d = raw();
    d.restWalk = d.restWalk || [];
    const i = d.restWalk.indexOf(date);
    if (i >= 0) d.restWalk.splice(i, 1); else d.restWalk.push(date);
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

  // ---------- rest timer ----------
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(); osc.stop(ctx.currentTime + 0.6);
    } catch {}
  }

  function timerEl() { return document.getElementById("rest-timer-banner"); }

  function timerTick() {
    if (timer.paused) return;
    timer.remaining = Math.max(0, timer.remaining - 1);
    const el = timerEl(); if (!el || el.hidden) return;
    if (timer.remaining === 0) {
      clearInterval(timer._id); timer.active = false;
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch {}
      beep();
      el.querySelector(".rt-countdown").textContent = "✅ זמן!";
      setTimeout(() => { el.hidden = true; }, 2500);
    } else {
      const m = Math.floor(timer.remaining / 60), s = timer.remaining % 60;
      el.querySelector(".rt-countdown").textContent = `${m}:${String(s).padStart(2, "0")}`;
    }
  }

  function startTimer(secs) {
    clearInterval(timer._id);
    timer.active = true; timer.paused = false; timer.remaining = secs;
    let el = timerEl();
    if (!el) {
      el = document.createElement("div");
      el.id = "rest-timer-banner";
      el.className = "rest-timer-banner";
      document.body.appendChild(el);
    }
    const fmtSec = (n) => n >= 60 ? (n / 60) + "′" : n + "″";
    el.innerHTML = `
      <div class="rt-top">
        <span class="rt-label">⏱️ מנוחה</span>
        <span class="rt-countdown">0:00</span>
        <button type="button" id="rt-pause" class="rt-btn">⏸</button>
        <button type="button" id="rt-skip" class="rt-btn">⏭ דלג</button>
      </div>
      <div class="rt-presets">
        ${[30, 60, 90, 120].map((n) => `<button type="button" class="rt-preset${secs === n ? " sel" : ""}" data-secs="${n}">${fmtSec(n)}</button>`).join("")}
      </div>`;
    el.hidden = false;
    const m0 = Math.floor(secs / 60), s0 = secs % 60;
    el.querySelector(".rt-countdown").textContent = `${m0}:${String(s0).padStart(2, "0")}`;
    el.querySelector("#rt-pause").addEventListener("click", () => {
      timer.paused = !timer.paused;
      el.querySelector("#rt-pause").textContent = timer.paused ? "▶️" : "⏸";
    });
    el.querySelector("#rt-skip").addEventListener("click", () => {
      clearInterval(timer._id); timer.active = false; el.hidden = true;
    });
    el.querySelectorAll(".rt-preset").forEach((b) =>
      b.addEventListener("click", () => startTimer(+b.dataset.secs))
    );
    timer._id = setInterval(timerTick, 1000);
  }

  function stopTimer() {
    clearInterval(timer._id); timer.active = false; timer.paused = false;
    const el = timerEl(); if (el) el.hidden = true;
  }

  // ---------- single exercise ----------
  function renderExercise(name) {
    const sug = suggestion(name);
    const past = logsForName(name);
    const prev = past.find((l) => l.date < curDate()) || null; // האימון הקודם (לפני היום הנבחר)
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
      <div class="goal-tip">${goalDef().label} · יעד ${goalDef().repMin}–${goalDef().repMax} חזרות · מנוחה ${goalDef().rest}</div>
      <div class="suggest-box">💡 ${sug.text}</div>
      ${prev ? `<div class="card-block prev-card">
        <h3>💪 האימון הקודם · ${U.prettyDate(prev.date)} (יום ${U.dayName(prev.date)})</h3>
        <div class="prev-sets">${prev.sets.map((s, i) => `<span class="prev-chip">סט ${i + 1}: <b>${s.weight}</b>×<b>${s.reps}</b></span>`).join("")}</div>
      </div>` : `<div class="card-block"><p class="status">זה האימון הראשון שלך בתרגיל הזה 💪</p></div>`}
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
    function addSetRow(weight = "", reps = "", prevSet = null) {
      const i = draft.length;
      draft.push({ weight: String(weight), reps: String(reps) });
      const row = document.createElement("div");
      row.className = "set-input-row";
      row.innerHTML = `
        <span class="set-num">סט ${i + 1}</span>
        <div class="set-field">
          <button type="button" class="qbtn" data-i="${i}" data-f="weight" data-d="-2.5">−</button>
          <input type="number" inputmode="decimal" step="0.5" placeholder='ק"ג' value="${weight}" data-i="${i}" data-f="weight" />
          <button type="button" class="qbtn" data-i="${i}" data-f="weight" data-d="2.5">+</button>
        </div>
        <span class="set-x">×</span>
        <div class="set-field">
          <button type="button" class="qbtn" data-i="${i}" data-f="reps" data-d="-1">−</button>
          <input type="number" inputmode="numeric" placeholder="חזרות" value="${reps}" data-i="${i}" data-f="reps" />
          <button type="button" class="qbtn" data-i="${i}" data-f="reps" data-d="1">+</button>
        </div>
        ${prevSet ? `<span class="set-prev">קודם ${prevSet.weight}×${prevSet.reps}</span>` : ""}`;
      setsEl.appendChild(row);
      row.querySelectorAll(".qbtn").forEach((b) =>
        b.addEventListener("click", () => {
          const idx = +b.dataset.i, field = b.dataset.f, delta = parseFloat(b.dataset.d);
          const inp = row.querySelector(`input[data-i="${idx}"][data-f="${field}"]`);
          const cur = parseFloat(inp.value) || 0;
          const nv = field === "weight"
            ? Math.max(0, Math.round((cur + delta) * 2) / 2)
            : Math.max(1, Math.round(cur + delta));
          inp.value = nv;
          draft[idx][field] = String(nv);
        })
      );
    }
    // אתחול: שורה לכל סט מהאימון הקודם (מלא מראש כדי שתשפר), אחרת שורה אחת לפי ההצעה
    if (prev && prev.sets.length) prev.sets.forEach((ps) => addSetRow(ps.weight, ps.reps, ps));
    else addSetRow(sug.weight || "", sug.reps || "");
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
    root.querySelector("#wk-addset").addEventListener("click", () => {
      addSetRow("", "", prev && prev.sets[draft.length]);
      startTimer(goalDef().restSecs);
    });
    root.querySelector("#wk-back").addEventListener("click", () => { stopTimer(); view = { kind: "home" }; render(); });
    root.querySelector("#wk-savesession").addEventListener("click", () => {
      const sets = draft
        .map((s) => ({ weight: parseFloat(s.weight), reps: parseInt(s.reps, 10) }))
        .filter((s) => s.weight > 0 && s.reps > 0);
      if (!sets.length) { alert("הזן לפחות סט אחד עם משקל וחזרות."); return; }
      stopTimer();
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

  return { mount, show, isHome: () => view.kind === "home" };
})();
