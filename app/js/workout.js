"use strict";
window.App = window.App || {};

App.workout = (function () {
  const U = App.util, S = App.store, I = App.icon;
  let root;
  let groups = [];          // [{name, exercises:[name,...]}] מהמאגר
  let loaded = false;
  let view = { kind: "home" }; // home | exercise({name,group}) | history
  const timer = { active: false, paused: false, done: false, remaining: 0, total: 0, _id: null };
  let selDate = null;
  const curDate = () => selDate || U.todayISO();

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
    if (!past.length) return { text: `אימון ראשון (${goalName(G)}) — בחר משקל שמאפשר ${G.repMin}–${G.repMax} חזרות בטכניקה טובה.` };
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

  // ---------- rest timer (כרטיס בתוך מסך התרגיל) ----------
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
  const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  function timerCard() { return root && root.querySelector("#rest-card"); }
  function paintTimer() {
    const el = timerCard(); if (!el) return;
    el.hidden = !timer.active && !timer.done;
    const C = 2 * Math.PI * 26;
    const frac = timer.total ? timer.remaining / timer.total : 0;
    el.querySelector(".rt-num").textContent = timer.done ? "זמן!" : mmss(timer.remaining);
    el.querySelector(".rt-arc").setAttribute("stroke-dasharray", `${(frac * C).toFixed(1)} ${C.toFixed(1)}`);
  }
  function timerTick() {
    if (timer.paused) return;
    timer.remaining = Math.max(0, timer.remaining - 1);
    if (timer.remaining === 0) {
      clearInterval(timer._id); timer.active = false; timer.done = true;
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch {}
      beep();
      setTimeout(() => { timer.done = false; paintTimer(); }, 2500);
    }
    paintTimer();
  }
  function startTimer(secs) {
    clearInterval(timer._id);
    Object.assign(timer, { active: true, paused: false, done: false, remaining: secs, total: secs });
    timer._id = setInterval(timerTick, 1000);
    paintTimer();
  }
  function stopTimer() {
    clearInterval(timer._id);
    Object.assign(timer, { active: false, paused: false, done: false });
    paintTimer();
  }

  // ---------- עזרי תצוגה ----------
  const goalName = (g) => g.label.replace(/^\S+\s/, "");
  function splitTitle(def) {
    if (!def.match) return { big: "אימון חופשי", sub: "כל קבוצות השריר" };
    const en = /\(([^)]+)\)/.exec(def.label);
    return { big: en ? en[1] : def.label, sub: def.match.join(" · ") };
  }
  function weekDays() {
    const p2 = (x) => String(x).padStart(2, "0");
    const now = new Date();
    const sun = new Date(now); sun.setDate(now.getDate() - now.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun); d.setDate(sun.getDate() + i);
      return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    });
  }
  const HE_M = ["בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני", "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"];
  function weekLabel(days) {
    const [, m1, d1] = days[0].split("-").map(Number), [, m2, d2] = days[6].split("-").map(Number);
    const jan1 = new Date(new Date().getFullYear(), 0, 1);
    const wk = Math.ceil(((new Date() - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `שבוע ${wk} · ${d1}${m1 !== m2 ? " " + HE_M[m1 - 1] : ""}–${d2} ${HE_M[m2 - 1]}`;
  }
  const shortDay = (iso) => U.dayName(iso).charAt(0) + "׳";
  const setsTxt = (sets) => {
    const same = sets.every((s) => s.weight === sets[0].weight);
    return same ? `${sets[0].weight} × ${sets.map((s) => s.reps).join(", ")}` : sets.map((s) => `${s.weight}×${s.reps}`).join(" · ");
  };
  function splitGroups(def) {
    return allGroups().filter((g) => !def.match || def.match.some((m) => g.name.includes(m)));
  }

  // ---------- מסך הבית של הטאב ----------
  function renderHome() {
    const today = U.todayISO();
    const cur = curDate();
    const all = logs();
    const days = weekDays();
    const weekLogs = all.filter((l) => l.date >= days[0] && l.date <= days[6]);
    const trainedDays = new Set(weekLogs.map((l) => l.date));
    const last = all.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    const lastTxt = !last ? "—" : last.date === today ? "היום" : daysAgo(last.date) === 1 ? "אתמול" : U.prettyDate(last.date).replace(/\.\d{4}$/, "");

    const def = SPLITS.find((s) => s.key === splitFor(cur)) || SPLITS[0];
    const title = splitTitle(def);
    const groupsToShow = splitGroups(def);
    const exCount = groupsToShow.reduce((a, g) => a + g.exercises.length, 0);
    const dayLogs = logsForDate(cur);
    const rest = isRest(cur);
    const walked = walkDone(cur);
    const isToday = cur === today;
    const G = goalDef();

    const latest = {};
    for (const l of all) if (!latest[l.exerciseName] || l.date > latest[l.exerciseName].date) latest[l.exerciseName] = l;

    const strip = days.map((iso) => {
      const sel = iso === cur, trained = trainedDays.has(iso), r = isRest(iso), fut = iso > today;
      const mark = trained ? `<span class="wd-mark ok">${I("check", 14)}</span>`
        : r ? `<span class="wd-rest">מנוחה</span>` : `<i class="wd-dot${fut ? " fut" : ""}"></i>`;
      return `<button class="wday${sel ? " sel" : ""}" data-day="${iso}" ${sel ? 'aria-current="date"' : ""} aria-label="יום ${U.dayName(iso)} ${U.prettyDate(iso)}${trained ? " — תועד אימון" : r ? " — יום מנוחה" : ""}">
        <span>${shortDay(iso)}</span><b>${+iso.slice(8)}</b>${mark}</button>`;
    }).join("");

    const doneRows = dayLogs.map((l) => `
      <div class="done-row"><span class="grow">${U.esc(l.exerciseName)}</span><span class="lbl">${setsTxt(l.sets)}</span>
        <button class="ibtn ghost sm" data-del="${l.id}" aria-label="מחק את ${U.esc(l.exerciseName)}">${I("trash", 18)}</button></div>`).join("");

    const heroBody = rest ? `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div style="display:flex;flex-direction:column;gap:6px"><span class="lbl">${isToday ? "האימון של היום" : "יום " + U.dayName(cur)}</span>
            <h2 class="num" style="font-size:34px;font-weight:800">יום מנוחה</h2>
            <span style="color:var(--muted-2)">מומלץ: 30 דק׳ הליכה קלה (התאוששות אקטיבית)</span></div>
          <div class="itile lg">${I("rest")}</div>
        </div>
        <button class="btn ${walked ? "btn-s" : "btn-p"}" id="wk-walk">${walked ? I("check", 20) + "הליכה בוצעה" : "סמן שביצעתי 30 דק׳ הליכה"}</button>
        <button class="btn btn-t" id="wk-rest" style="align-self:center">${I("x", 20)}בטל יום מנוחה</button>` : `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="lbl">${isToday ? "האימון של היום" : "יום " + U.dayName(cur) + " · " + U.prettyDate(cur)}</span>
            <h2 class="num" style="font-size:40px;font-weight:800">${U.esc(title.big)}</h2>
            <span style="color:var(--muted-2)">${U.esc(title.sub)}</span></div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
            <span class="tag">${exCount} תרגילים</span>
            ${dayLogs.length ? `<span class="tag hot">${dayLogs.length} תועדו</span>` : ""}
            <span class="tag">${G.repMin}–${G.repMax} חזרות</span></div>
        </div>
        ${doneRows ? `<div class="done-list">${doneRows}</div>` : ""}
        <button class="btn btn-p" id="wk-start">${I("play", 20)}${dayLogs.length ? "המשך אימון" : "התחל אימון"}</button>
        <button class="btn btn-t" id="wk-rest" style="align-self:center">${I("rest", 20)}סמן כיום מנוחה</button>`;

    const sections = groupsToShow.map((g) => {
      const rows = g.exercises.map((name) => {
        const last = latest[name];
        const sug = last ? suggestion(name) : null;
        const up = sug && sug.weight && last && sug.weight > Math.max(...last.sets.map((s) => s.weight));
        const sub = last ? `אחרון ${last.sets[0].weight} ק״ג × ${last.sets.length} סטים · ${last.date === today ? "היום" : U.prettyDate(last.date).replace(/\.\d{4}$/, "")}` : "טרם תועד";
        return `<button class="ex-row" data-ex="${U.esc(name)}">
          <div class="itile ex-ico">${I("dumbbell")}</div>
          <span class="grow"><span class="ex-name">${U.esc(name)}</span><span class="lbl">${sub}</span></span>
          ${up ? `<span class="tag warm">+${U.round(sug.weight - Math.max(...last.sets.map((s) => s.weight)))}</span>` : `<span class="chev">${I("chev")}</span>`}
        </button>`;
      }).join("");
      const openAttr = def.match || groupsToShow.length <= 3 ? " open" : "";
      return `<details class="ex-group"${openAttr}><summary><span>${U.esc(g.name)}</span><span class="lbl">${g.exercises.length}</span></summary>${rows}</details>`;
    }).join("");

    root.innerHTML = `
      <header class="home-head" style="padding-bottom:8px">
        <div><span class="lbl">${weekLabel(days)}</span><h1 class="t1">אימון</h1></div>
        <button class="ibtn" id="wk-history" aria-label="היסטוריית אימונים">${I("history")}</button>
      </header>
      <div class="stack">
        <div class="stat3">
          <div class="card stat"><span class="lbl">אימונים השבוע</span><span class="num" style="font-size:30px">${trainedDays.size}</span></div>
          <div class="card stat"><span class="lbl">סטים השבוע</span><span class="num" style="font-size:30px">${weekLogs.reduce((a, l) => a + l.sets.length, 0)}</span></div>
          <div class="card stat"><span class="lbl">אחרון</span><span class="num" style="font-size:20px;line-height:30px">${lastTxt}</span></div>
        </div>
        <div class="week7" role="group" aria-label="השבוע">${strip}</div>
        <section class="hero wk-hero" aria-label="האימון של היום">${heroBody}</section>

        <h2 class="sec-title">מטרה</h2>
        <div class="seg" role="group" aria-label="מטרת אימון">
          ${GOALS.map((g) => `<button data-goal="${g.key}" class="${g.key === G.key ? "on" : ""}" aria-pressed="${g.key === G.key}">${goalName(g)}</button>`).join("")}
        </div>
        <p class="lbl" style="margin:0 4px">${G.repMin}–${G.repMax} חזרות · מנוחה ${G.rest} — ${G.tip}</p>

        <h2 class="sec-title">חלוקת אימון${isToday ? " להיום" : ""}</h2>
        <div class="chips scroll" role="group" aria-label="חלוקת אימון">
          ${SPLITS.map((s) => `<button class="chip${s.key === def.key ? " on" : ""}" data-split="${s.key}" aria-pressed="${s.key === def.key}">${s.label}</button>`).join("")}
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px 0">
          <h2 class="sec-title" style="margin:0">תרגילים · ${U.esc(title.big)}</h2>
          <button class="btn btn-t" id="wk-add" style="font-size:14px">${I("plus", 18)}הוסף</button>
        </div>
        <section class="card ex-list">${sections || `<p class="status">אין קבוצות לחלוקה זו.</p>`}</section>
      </div>`;

    root.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { selDate = b.dataset.day; render(); }));
    root.querySelector("#wk-rest").addEventListener("click", () => { toggleRest(cur); render(); });
    const walkBtn = root.querySelector("#wk-walk");
    if (walkBtn) walkBtn.addEventListener("click", () => { toggleWalk(cur); render(); });
    const startBtn = root.querySelector("#wk-start");
    if (startBtn) startBtn.addEventListener("click", () => {
      const doneNames = new Set(dayLogs.map((l) => l.exerciseName));
      const first = groupsToShow.flatMap((g) => g.exercises).find((n) => !doneNames.has(n));
      if (first) { view = { kind: "exercise", name: first }; render(); }
    });
    root.querySelectorAll("[data-split]").forEach((b) => b.addEventListener("click", () => { setSplit(cur, b.dataset.split); render(); }));
    root.querySelectorAll("[data-goal]").forEach((b) => b.addEventListener("click", () => { setTrainGoal(b.dataset.goal); render(); }));
    root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      const d = raw(); d.logs = (d.logs || []).filter((l) => l.id !== b.dataset.del); save(d); render();
    }));
    root.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => { view = { kind: "exercise", name: b.dataset.ex }; render(); window.scrollTo(0, 0); }));
    root.querySelector("#wk-history").addEventListener("click", () => { view = { kind: "history" }; render(); window.scrollTo(0, 0); });
    root.querySelector("#wk-add").addEventListener("click", addExercise);
  }
  function daysAgo(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const n = new Date();
    return Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(y, m - 1, d)) / 86400000);
  }

  // ---------- מסך תרגיל ----------
  function renderExercise(name) {
    const G = goalDef();
    const sug = suggestion(name);
    const past = logsForName(name);
    const prev = past.find((l) => l.date < curDate()) || null;
    const def = SPLITS.find((s) => s.key === splitFor(curDate())) || SPLITS[0];
    const order = splitGroups(def).flatMap((g) => g.exercises);
    const idx = order.indexOf(name);
    const nextName = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
    const targetSets = prev ? prev.sets.length : 3;
    const best = past.length ? Math.max(...past.map((l) => Math.max(...l.sets.map((s) => s.weight)))) : 0;
    const bestId = past.find((l) => l.sets.some((s) => s.weight === best));

    // טיוטת הסטים של היום — נשמרת בין רינדורים של אותו תרגיל
    if (!view.draft) view.draft = [];
    const draft = view.draft;
    if (!view.cur) {
      const base = (prev && prev.sets[0]) || (sug.weight ? { weight: sug.weight, reps: sug.reps } : { weight: 0, reps: G.repMin });
      view.cur = { weight: base.weight, reps: base.reps };
    }
    const prevSet = prev ? prev.sets[Math.min(draft.length, prev.sets.length - 1)] : null;

    const history = past.map((l) => `
      <div class="hist-row">
        <span class="lbl" style="width:64px">${shortDay(l.date)} ${U.prettyDate(l.date).replace(/\.\d{4}$/, "")}</span>
        <span class="grow" style="font-weight:500">${setsTxt(l.sets)}</span>
        ${bestId && l.id === bestId.id ? `<span class="tag ok">שיא</span>` : ""}
        <button class="ibtn ghost sm" data-del="${l.id}" aria-label="מחק רישום מ-${U.prettyDate(l.date)}">${I("trash", 18)}</button>
      </div>`).join("");

    root.innerHTML = `
      <div class="subhead">
        <button class="ibtn ghost" id="wk-back" aria-label="חזרה לאימון">${I("back")}</button>
        <div style="flex:1;display:flex;flex-direction:column;min-width:0">
          <span class="lbl" style="font-size:12px">${idx >= 0 ? `תרגיל ${idx + 1} מתוך ${order.length} · ` : ""}${U.esc(splitTitle(def).big)}</span>
          <h1 class="t3" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(name)}</h1>
        </div>
      </div>
      <div class="stack" style="padding-bottom:96px">
        <section class="hero demo" aria-label="הדגמה">
          <button class="demo-play" id="wk-video" aria-label="צפה בהדגמה ביוטיוב">${I("play", 28)}</button>
          <span class="tag demo-cap">הדגמה ביוטיוב</span>
          <button class="btn btn-s demo-img" id="wk-img">${I("search", 18)}תמונות</button>
        </section>
        <div class="stat3">
          <div class="card stat"><span class="lbl">סטים</span><span class="num" style="font-size:22px">${targetSets}</span></div>
          <div class="card stat"><span class="lbl">חזרות</span><span class="num" style="font-size:22px">${G.repMin}–${G.repMax}</span></div>
          <div class="card stat"><span class="lbl">מנוחה</span><span class="num" style="font-size:22px">${mmss(G.restSecs)}</span></div>
        </div>
        <section class="po-card" aria-label="המלצת התקדמות">
          <div class="itile hot">${I("up")}</div>
          <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
            <span class="lbl po-lbl">המלצה להיום · Progressive Overload</span>
            ${sug.weight ? `<span class="num" style="font-size:24px">${sug.weight} ק״ג × ${sug.reps}</span>` : ""}
            <span class="po-txt">${sug.text}</span>
          </div>
        </section>

        <h2 class="sec-title">סטים · ${draft.length}/${Math.max(targetSets, draft.length)}</h2>
        <section class="card" style="padding:4px 0">
          ${draft.map((s, i) => `<div class="set-done">
            <span class="num set-n">${i + 1}</span>
            <span class="num grow" style="font-size:18px;font-weight:600">${s.weight} <span class="lbl">ק״ג</span> × ${s.reps}</span>
            <button class="ibtn ghost sm" data-undo="${i}" aria-label="מחק סט ${i + 1}">${I("x", 18)}</button>
          </div>`).join("")}
          <div class="set-cur">
            <div style="display:flex;align-items:center;justify-content:space-between"><span class="t3">סט ${draft.length + 1}</span>
              ${prevSet ? `<span class="lbl">בפעם הקודמת ${prevSet.weight} × ${prevSet.reps}</span>` : ""}</div>
            <div class="two-col" style="gap:8px">
              <label class="step-wrap"><span class="lbl">משקל (ק״ג)</span>
                <span class="step"><button type="button" data-step="w" data-d="2.5" aria-label="הוסף 2.5 ק״ג">${I("plus")}</button>
                  <input class="num" id="cur-w" type="number" inputmode="decimal" step="0.5" min="0" value="${view.cur.weight}" aria-label="משקל בקילוגרמים">
                  <button type="button" data-step="w" data-d="-2.5" aria-label="הפחת 2.5 ק״ג">${I("minus")}</button></span></label>
              <label class="step-wrap"><span class="lbl">חזרות</span>
                <span class="step"><button type="button" data-step="r" data-d="1" aria-label="הוסף חזרה">${I("plus")}</button>
                  <input class="num" id="cur-r" type="number" inputmode="numeric" min="1" value="${view.cur.reps}" aria-label="מספר חזרות">
                  <button type="button" data-step="r" data-d="-1" aria-label="הפחת חזרה">${I("minus")}</button></span></label>
            </div>
            <button class="btn btn-s" id="wk-logset" style="border-color:var(--accent)">${I("check", 20)}סיימתי סט · התחל מנוחה</button>
          </div>
        </section>

        <section class="card rest-card" id="rest-card" aria-label="טיימר מנוחה" aria-live="polite" hidden>
          <div class="rt-ring"><svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" class="ring-track" stroke-width="6"/><circle class="rt-arc ring-val" cx="32" cy="32" r="26" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 999" transform="rotate(-90 32 32)"/></svg></div>
          <div style="flex-grow:1;display:flex;flex-direction:column;gap:4px"><span class="lbl">מנוחה</span><span class="num rt-num" style="font-size:30px">0:00</span></div>
          <button class="ibtn" id="rt-minus" aria-label="הפחת 15 שניות" style="font:600 13px var(--font-display)">−15</button>
          <button class="ibtn" id="rt-plus" aria-label="הוסף 15 שניות" style="font:600 13px var(--font-display)">+15</button>
          <button class="ibtn ghost" id="rt-skip" aria-label="סיים מנוחה">${I("x", 20)}</button>
        </section>

        <h2 class="sec-title">היסטוריה</h2>
        <section class="card" style="padding:4px 0">${history || `<p class="status">זה האימון הראשון שלך בתרגיל הזה.</p>`}</section>
      </div>
      <div class="dock">
        ${nextName ? `<button class="btn btn-s" id="wk-next" style="width:120px">הבא</button>` : ""}
        <button class="btn btn-p" id="wk-save" style="flex-grow:1">${draft.length ? `שמור תרגיל · ${draft.length} סטים` : "שמור תרגיל"}</button>
      </div>`;
    paintTimer();

    const wIn = root.querySelector("#cur-w"), rIn = root.querySelector("#cur-r");
    wIn.addEventListener("input", () => { view.cur.weight = parseFloat(wIn.value) || 0; });
    rIn.addEventListener("input", () => { view.cur.reps = parseInt(rIn.value, 10) || 0; });
    root.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault();
      const d = parseFloat(b.dataset.d);
      if (b.dataset.step === "w") { view.cur.weight = Math.max(0, Math.round((view.cur.weight + d) * 2) / 2); wIn.value = view.cur.weight; }
      else { view.cur.reps = Math.max(1, view.cur.reps + d); rIn.value = view.cur.reps; }
    }));
    root.querySelector("#wk-logset").addEventListener("click", () => {
      if (!(view.cur.weight >= 0) || !(view.cur.reps > 0)) { alert("הזן משקל וחזרות."); return; }
      draft.push({ weight: view.cur.weight, reps: view.cur.reps });
      const nextPrev = prev && prev.sets[Math.min(draft.length, prev.sets.length - 1)];
      if (nextPrev && draft.length < prev.sets.length) view.cur = { weight: Math.max(view.cur.weight, nextPrev.weight), reps: view.cur.reps };
      render();
      startTimer(G.restSecs);
    });
    root.querySelectorAll("[data-undo]").forEach((b) => b.addEventListener("click", () => { draft.splice(+b.dataset.undo, 1); render(); }));
    root.querySelector("#rt-minus").addEventListener("click", () => { timer.remaining = Math.max(1, timer.remaining - 15); paintTimer(); });
    root.querySelector("#rt-plus").addEventListener("click", () => { timer.remaining += 15; timer.total = Math.max(timer.total, timer.remaining); paintTimer(); });
    root.querySelector("#rt-skip").addEventListener("click", stopTimer);
    root.querySelector("#wk-video").addEventListener("click", () =>
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(name + " תרגיל טכניקה הדגמה")}`, "_blank", "noopener"));
    root.querySelector("#wk-img").addEventListener("click", () =>
      window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(name + " exercise")}`, "_blank", "noopener"));
    root.querySelector("#wk-back").addEventListener("click", () => {
      if (draft.length && !confirm("יש סטים שלא נשמרו. לצאת בלי לשמור?")) return;
      stopTimer(); view = { kind: "home" }; render(); window.scrollTo(0, 0);
    });
    const saveSession = () => {
      const sets = draft.filter((s) => s.weight >= 0 && s.reps > 0);
      if (!sets.length) return false;
      const d = raw();
      (d.logs ??= []).push({ id: U.uid(), exerciseName: name, date: curDate(), sets });
      save(d);
      return true;
    };
    root.querySelector("#wk-save").addEventListener("click", () => {
      if (!draft.length) { alert("סמן לפחות סט אחד (סיימתי סט) לפני השמירה."); return; }
      saveSession(); stopTimer(); view = { kind: "home" }; render(); window.scrollTo(0, 0);
    });
    const nextBtn = root.querySelector("#wk-next");
    if (nextBtn) nextBtn.addEventListener("click", () => {
      if (draft.length) saveSession();
      stopTimer(); view = { kind: "exercise", name: nextName }; render(); window.scrollTo(0, 0);
    });
    root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      if (!confirm("למחוק את הרישום?")) return;
      const d = raw(); d.logs = (d.logs || []).filter((l) => l.id !== b.dataset.del); save(d); render();
    }));
  }

  // ---------- היסטוריה מלאה ----------
  function renderHistory() {
    const all = logs().slice().sort((a, b) => b.date.localeCompare(a.date));
    const byDate = {};
    for (const l of all) (byDate[l.date] ??= []).push(l);
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
    const body = dates.length ? dates.map((date) => `
      <h2 class="sec-title">${U.dayName(date)} · ${U.prettyDate(date)}</h2>
      <section class="card" style="padding:4px 0">
        ${byDate[date].map((l) => `<div class="hist-row"><span class="grow" style="font-weight:600">${U.esc(l.exerciseName)}</span>
          <span class="lbl">${setsTxt(l.sets)}</span>
          <button class="ibtn ghost sm" data-del="${l.id}" aria-label="מחק את ${U.esc(l.exerciseName)}">${I("trash", 18)}</button></div>`).join("")}
      </section>`).join("") : `<p class="status">עדיין אין אימונים מתועדים.</p>`;
    root.innerHTML = `
      <div class="subhead"><button class="ibtn ghost" id="wk-back" aria-label="חזרה לאימון">${I("back")}</button><h1 class="t3" style="flex:1">היסטוריית אימונים</h1></div>
      <div class="stack">${body}</div>`;
    root.querySelector("#wk-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
    root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      if (!confirm("למחוק את הרישום?")) return;
      const d = raw(); d.logs = (d.logs || []).filter((l) => l.id !== b.dataset.del); save(d); render();
    }));
  }

  // סיכום להיום — לכרטיס "האימון של היום" במסך הבית
  function todaySummary() {
    const today = U.todayISO();
    const splitDef = SPLITS.find((s) => s.key === splitFor(today)) || SPLITS[0];
    const exCount = allGroups().filter((g) => !splitDef.match || splitDef.match.some((m) => g.name.includes(m)))
      .reduce((a, g) => a + g.exercises.length, 0);
    const done = logsForDate(today);
    return {
      rest: isRest(today),
      splitLabel: splitDef.key === "all" ? "אימון חופשי" : splitDef.label,
      exerciseCount: exCount,
      doneCount: done.length,
      doneSets: done.reduce((a, l) => a + l.sets.length, 0),
    };
  }

  return { mount, show, todaySummary, ready: ensure, hideTabbar: () => view.kind === "exercise", home: () => { view = { kind: "home" }; if (root) render(); }, isHome: () => view.kind === "home" };
})();
