"use strict";
window.App = window.App || {};

/* טאב לימוד: אוצר מילים לאנגלית (10 מילים ביום, סימון הבנתי/לא הבנתי + תרגול)
   ומסלול ידע פיננסי מהיסוד (שיעורים). הכל אופליין מתוך data/vocab.json + data/finance.json */
App.learn = (function () {
  const U = App.util, S = App.store;
  let root;
  let words = [], lessons = [], readings = [], loaded = false;
  let section = "en";                 // en | finance
  let view = { kind: "home" };        // home | practice | lesson({id})
  const BATCH = 10;

  // ---------- storage ----------
  function raw() { return S.get("learn", { batch: 0, marks: {}, lastBatchDate: null, doneLessons: [] }); }
  function save(d) { S.set("learn", d); }

  function mark(id, val) {
    const d = raw(); d.marks = d.marks || {}; d.marks[String(id)] = val; save(d);
  }
  function reviewPool() {
    const m = raw().marks || {};
    return Object.keys(m).filter((k) => m[k] === "miss").map((k) => +k);
  }

  // ---------- data ----------
  async function ensure() {
    if (loaded) return;
    try {
      const [v, f] = await Promise.all([
        fetch(`data/vocab.json?ts=${Date.now()}`, { cache: "force-cache" }).then((r) => r.json()),
        fetch(`data/finance.json?ts=${Date.now()}`, { cache: "force-cache" }).then((r) => r.json()),
      ]);
      words = v.words || [];
      lessons = f.lessons || [];
    } catch { words = []; lessons = []; }
    // קריאת הבוקר (נוצרת ע"י routine יומי) — טעינה נפרדת כדי שכשל לא יפיל את השאר
    try {
      const r = await fetch(`../readings/index.json?ts=${Date.now()}`, { cache: "no-cache" });
      if (r.ok) readings = (await r.json()).readings || [];
    } catch { readings = []; }
    loaded = true;
  }

  function todaysReading() {
    if (!readings.length) return null;
    const sorted = readings.slice().sort((a, b) => b.date.localeCompare(a.date));
    return sorted.find((r) => r.date === U.todayISO()) || sorted[0];
  }

  function curBatchWords() {
    const b = raw().batch || 0;
    const start = (b * BATCH) % Math.max(words.length, 1);
    return words.slice(start, start + BATCH);
  }

  // ---------- lifecycle ----------
  async function mount(el) { root = el; await ensure(); render(); }
  async function show() { await ensure(); render(); }

  function render() {
    if (section === "en" && view.kind === "practice") return renderPractice();
    if (section === "en" && view.kind === "reading") return renderReading(view.file);
    if (section === "finance" && view.kind === "lesson") return renderLesson(view.id);
    renderHome();
  }

  function sectionTabs() {
    return `<div class="seg learn-seg" id="learn-seg">
      <button data-sec="en" class="${section === "en" ? "active" : ""}">🔤 אנגלית</button>
      <button data-sec="finance" class="${section === "finance" ? "active" : ""}">💰 פיננסים</button>
    </div>`;
  }

  // מתקדם אוטומטית ל-10 הבאות בכל יום קלנדרי חדש — כדי שלא נחזור על אותן מילים מאתמול
  function ensureDailyBatch() {
    const d = raw();
    const today = U.todayISO();
    if (!d.batchDate) { d.batchDate = today; save(d); return; }
    if (d.batchDate !== today) {
      d.batch = (d.batch || 0) + 1;   // יום חדש = מנה חדשה (10 מילים חדשות)
      d.batchDate = today;
      save(d);
    }
  }

  // שיעור פיננסי יומי — מתקדם אוטומטית בכל יום קלנדרי חדש, בלי לחזור על אתמול
  function ensureDailyLesson() {
    const d = raw();
    const today = U.todayISO();
    if (!d.finDate) { d.finDay = d.finDay || 0; d.finDate = today; save(d); return; }
    if (d.finDate !== today) {
      d.finDay = ((d.finDay || 0) + 1) % Math.max(lessons.length, 1); // יום חדש = שיעור הבא
      d.finDate = today;
      save(d);
    }
  }

  function renderHome() {
    if (section === "en") ensureDailyBatch();
    if (section === "finance") ensureDailyLesson();
    root.innerHTML = sectionTabs() + (section === "en" ? enHomeHTML() : financeHomeHTML());
    root.querySelectorAll("#learn-seg button").forEach((b) =>
      b.addEventListener("click", () => { section = b.dataset.sec; view = { kind: "home" }; render(); })
    );
    if (section === "en") wireEnHome(); else wireFinanceHome();
  }

  // ========== ENGLISH ==========
  function enHomeHTML() {
    const d = raw();
    const batch = d.batch || 0;
    const totalBatches = Math.ceil(words.length / BATCH);
    const list = curBatchWords();
    const marks = d.marks || {};
    const today = U.todayISO();
    const doneToday = d.lastBatchDate === today;
    const pool = reviewPool();

    const cards = list.map((w) => {
      const st = marks[String(w.id)]; // got | miss | undefined
      const revealed = st === "miss";
      return `
        <div class="vocab-card${st ? " marked-" + st : ""}" data-id="${w.id}">
          <div class="vc-top">
            <div class="vc-en">${U.esc(w.en)} ${w.pos ? `<span class="vc-pos">${U.esc(w.pos)}</span>` : ""}</div>
            ${w.rp ? `<span class="vc-rp">${w.rp === "Prod" ? "Productive" : "Receptive"}</span>` : ""}
          </div>
          ${w.meaningEn ? `<div class="vc-meaning-en">${U.esc(w.meaningEn)}</div>` : ""}
          <div class="vc-reveal" ${revealed ? "" : "hidden"}>
            <div class="vc-he">🇮🇱 ${U.esc(w.he)}</div>
            ${w.family ? `<div class="vc-family">משפחת מילים: <b>${U.esc(w.family)}</b></div>` : ""}
          </div>
          <div class="vc-btns">
            <button class="vc-btn got${st === "got" ? " sel" : ""}" data-act="got" data-id="${w.id}">✅ הבנתי</button>
            <button class="vc-btn miss${st === "miss" ? " sel" : ""}" data-act="miss" data-id="${w.id}">❌ לא הבנתי</button>
          </div>
        </div>`;
    }).join("");

    const markedCount = list.filter((w) => marks[String(w.id)]).length;

    const rd = todaysReading();
    const readingCard = rd ? `
      <button class="card-block fin-today reading-card" data-reading="${U.esc(rd.file)}">
        <div class="fin-today-tag">📖 קריאת הבוקר · ~5 דק'</div>
        <div class="fin-today-row">
          <span class="fin-today-ico">📰</span>
          <div>
            <div class="fin-today-title">${U.esc(rd.title || "Daily Reading")}</div>
            <div class="fin-today-tip">${rd.date === today ? "חדש להיום" : U.prettyDate(rd.date)} · קריאה באנגלית לתרגול</div>
          </div>
        </div>
        <div class="fin-today-cta">קרא עכשיו ←</div>
      </button>` : "";

    return `
      ${readingCard}
      <div class="card-block learn-intro">
        <h3>🔤 המנה היומית — 10 מילים</h3>
        <p class="section-hint">סמן ✅ אם הבנת, או ❌ אם לא — ואז יופיע התרגום + תרגול. מנה ${batch + 1} מתוך ${totalBatches}.</p>
        <div class="learn-progress"><div class="lp-bar" style="width:${Math.round(((batch) / totalBatches) * 100)}%"></div></div>
        <div class="learn-stats">
          <span>📚 נלמדו: <b>${Object.values(marks).length}</b></span>
          <span>🔁 לחזרה: <b>${pool.length}</b></span>
        </div>
      </div>
      <div class="vocab-list">${cards}</div>
      <div class="row-btns">
        <button id="en-next" class="btn-secondary">➕ עוד 10 מילים עכשיו</button>
        ${pool.length ? `<button id="en-practice" class="btn-primary">🎯 תרגול (${pool.length})</button>` : ""}
      </div>
      ${doneToday && markedCount === list.length
        ? `<p class="section-hint center">מעולה! סיימת את המנה של היום 🎉 מחר יחכו לך 10 מילים חדשות אוטומטית.</p>`
        : `<p class="section-hint center">⏭️ מחר תקבל אוטומטית 10 מילים חדשות — בלי חזרה על היום.</p>`}
    `;
  }

  function wireEnHome() {
    root.querySelectorAll(".vc-btn").forEach((b) =>
      b.addEventListener("click", () => {
        const id = +b.dataset.id, act = b.dataset.act;
        mark(id, act);
        // אם הגיע ל-10 מסומנים — סמן שהמנה הושלמה היום
        const list = curBatchWords();
        const marks = raw().marks || {};
        if (list.every((w) => marks[String(w.id)])) {
          const d = raw(); d.lastBatchDate = U.todayISO(); save(d);
        }
        renderHome();
      })
    );
    const next = root.querySelector("#en-next");
    if (next) next.addEventListener("click", () => {
      const d = raw();
      d.batch = (d.batch || 0) + 1;
      d.batchDate = U.todayISO(); // עדכון ידני היום → מחר עדיין יתקדם פעם אחת נוספת
      save(d);
      window.scrollTo(0, 0); renderHome();
    });
    const pr = root.querySelector("#en-practice");
    if (pr) pr.addEventListener("click", () => { view = { kind: "practice" }; render(); });
    const rd = root.querySelector("[data-reading]");
    if (rd) rd.addEventListener("click", () => { view = { kind: "reading", file: rd.dataset.reading }; render(); });
  }

  // ----- קריאת הבוקר (Markdown מתוך readings/) -----
  async function renderReading(file) {
    root.innerHTML = `
      <button id="rd-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block lesson-body reading-article" id="rd-article"><p class="status">טוען…</p></div>`;
    root.querySelector("#rd-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
    try {
      const res = await fetch(`../readings/${file}?ts=${Date.now()}`, { cache: "no-cache" });
      if (!res.ok) throw new Error();
      const md = await res.text();
      const art = root.querySelector("#rd-article");
      art.innerHTML = window.marked ? window.marked.parse(md) : `<pre>${U.esc(md)}</pre>`;
      art.querySelectorAll("a[href^='http']").forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
    } catch {
      const art = root.querySelector("#rd-article");
      if (art) art.innerHTML = `<p class="status">לא ניתן לטעון את הקריאה 😕</p>`;
    }
  }

  // ----- practice (multiple choice over the review pool) -----
  let practiceQ = null;
  function nextPracticeQ() {
    const pool = reviewPool();
    if (!pool.length) { practiceQ = null; return; }
    const id = pool[Math.floor(Math.random() * pool.length)];
    const correct = words.find((w) => w.id === id);
    // 3 הסחות אקראיות
    const others = words.filter((w) => w.id !== id && w.he);
    const opts = [correct];
    while (opts.length < 4 && others.length) {
      const cand = others.splice(Math.floor(Math.random() * others.length), 1)[0];
      if (!opts.includes(cand)) opts.push(cand);
    }
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    practiceQ = { correct, opts };
  }

  function renderPractice() {
    if (!practiceQ) nextPracticeQ();
    const pool = reviewPool();
    if (!practiceQ) {
      root.innerHTML = `
        <button id="pr-back" class="btn-secondary">‹ חזרה</button>
        <div class="card-block center">
          <h3>🎉 כל הכבוד!</h3>
          <p class="section-hint">אין מילים לחזרה כרגע. סמן עוד מילים כ"לא הבנתי" כדי לתרגל.</p>
        </div>`;
      root.querySelector("#pr-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
      return;
    }
    const q = practiceQ;
    root.innerHTML = `
      <button id="pr-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block">
        <p class="section-hint center">🎯 תרגול · נותרו ${pool.length} מילים</p>
        <div class="practice-word">${U.esc(q.correct.en)} ${q.correct.pos ? `<span class="vc-pos">${U.esc(q.correct.pos)}</span>` : ""}</div>
        <p class="section-hint center">מה הפירוש בעברית?</p>
        <div class="practice-opts">
          ${q.opts.map((o) => `<button class="practice-opt" data-id="${o.id}">${U.esc(o.he)}</button>`).join("")}
        </div>
        <div id="pr-feedback" class="practice-feedback"></div>
      </div>`;
    root.querySelector("#pr-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
    root.querySelectorAll(".practice-opt").forEach((b) =>
      b.addEventListener("click", () => {
        const chosen = +b.dataset.id;
        const fb = root.querySelector("#pr-feedback");
        root.querySelectorAll(".practice-opt").forEach((x) => x.disabled = true);
        if (chosen === q.correct.id) {
          b.classList.add("correct");
          fb.innerHTML = `<span class="pf-ok">✅ נכון!</span>
            <button id="pr-know" class="btn-secondary">ידעתי — הוצא מהחזרה</button>
            <button id="pr-cont" class="btn-primary">המשך ←</button>`;
          root.querySelector("#pr-know").addEventListener("click", () => { mark(q.correct.id, "got"); practiceQ = null; render(); });
          root.querySelector("#pr-cont").addEventListener("click", () => { practiceQ = null; render(); });
        } else {
          b.classList.add("wrong");
          root.querySelectorAll(".practice-opt").forEach((x) => { if (+x.dataset.id === q.correct.id) x.classList.add("correct"); });
          fb.innerHTML = `<span class="pf-no">הפירוש: <b>${U.esc(q.correct.he)}</b></span>
            <button id="pr-cont" class="btn-primary">המשך ←</button>`;
          root.querySelector("#pr-cont").addEventListener("click", () => { practiceQ = null; render(); });
        }
      })
    );
  }

  // ========== FINANCE ==========
  function financeHomeHTML() {
    const d = raw();
    const done = d.doneLessons || [];
    const finDay = d.finDay || 0;
    const todayLesson = lessons[finDay];
    const items = lessons.map((l, i) => {
      const isDone = done.includes(l.id);
      const isToday = i === finDay;
      return `
        <button class="list-card lesson-card${isToday ? " lesson-today" : ""}" data-lesson="${l.id}">
          <div class="lesson-ico">${l.icon}</div>
          <div class="lc-main">
            <div class="lc-title">${i + 1}. ${U.esc(l.title)} ${isDone ? '<span class="lesson-done">✓</span>' : ""}${isToday ? ' <span class="lesson-todaytag">היום</span>' : ""}</div>
            <div class="lc-sub">${U.esc(l.tip || "")}</div>
          </div>
          <span class="lc-chevron">‹</span>
        </button>`;
    }).join("");
    const pct = lessons.length ? Math.round((done.length / lessons.length) * 100) : 0;
    const todayCard = todayLesson ? `
      <button class="card-block fin-today" data-lesson="${todayLesson.id}">
        <div class="fin-today-tag">📅 שיעור היום</div>
        <div class="fin-today-row">
          <span class="fin-today-ico">${todayLesson.icon}</span>
          <div>
            <div class="fin-today-title">${U.esc(todayLesson.title)}</div>
            <div class="fin-today-tip">${U.esc(todayLesson.tip || "")}</div>
          </div>
        </div>
        <div class="fin-today-cta">פתח שיעור ←</div>
      </button>` : "";
    return `
      <div class="card-block learn-intro">
        <h3>💰 ידע פיננסי מהיסוד</h3>
        <p class="section-hint">שיעור קצר כל יום — מהבסיס ועד השקעות ופנסיה. מחר יחכה לך השיעור הבא אוטומטית.</p>
        <div class="learn-progress"><div class="lp-bar" style="width:${pct}%"></div></div>
        <div class="learn-stats"><span>✅ הושלמו: <b>${done.length}/${lessons.length}</b></span></div>
      </div>
      ${todayCard}
      <p class="section-hint" style="margin:14px 0 6px">כל השיעורים:</p>
      <div class="list-cards">${items}</div>`;
  }

  function wireFinanceHome() {
    root.querySelectorAll("[data-lesson]").forEach((b) =>
      b.addEventListener("click", () => { view = { kind: "lesson", id: b.dataset.lesson }; render(); })
    );
  }

  function renderLesson(id) {
    const l = lessons.find((x) => x.id === id);
    if (!l) { view = { kind: "home" }; return renderHome(); }
    const done = raw().doneLessons || [];
    const isDone = done.includes(id);
    const idx = lessons.findIndex((x) => x.id === id);
    const next = lessons[idx + 1];
    const body = window.marked ? window.marked.parse(l.md) : `<pre>${U.esc(l.md)}</pre>`;
    root.innerHTML = `
      <button id="ls-back" class="btn-secondary">‹ חזרה לשיעורים</button>
      <h2 class="view-h2">${l.icon} ${U.esc(l.title)}</h2>
      <div class="card-block lesson-body">${body}</div>
      <button id="ls-done" class="btn-${isDone ? "secondary" : "primary"} full">${isDone ? "✓ הושלם — סמן כלא נלמד" : "✅ סיימתי את השיעור"}</button>
      ${next ? `<button id="ls-next" class="btn-secondary full">לשיעור הבא: ${U.esc(next.title)} ←</button>` : ""}
    `;
    root.querySelector("#ls-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
    root.querySelector("#ls-done").addEventListener("click", () => {
      const d = raw(); d.doneLessons = d.doneLessons || [];
      const i = d.doneLessons.indexOf(id);
      if (i >= 0) d.doneLessons.splice(i, 1); else d.doneLessons.push(id);
      save(d);
      if (i < 0 && next) { view = { kind: "lesson", id: next.id }; window.scrollTo(0, 0); }
      render();
    });
    const nx = root.querySelector("#ls-next");
    if (nx) nx.addEventListener("click", () => { view = { kind: "lesson", id: next.id }; window.scrollTo(0, 0); render(); });
  }

  return { mount, show };
})();
