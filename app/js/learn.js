"use strict";
window.App = window.App || {};

/* טאב לימוד: אוצר מילים לאנגלית (10 מילים ביום, סימון הבנתי/לא הבנתי + תרגול)
   ומסלול ידע פיננסי מהיסוד (שיעורים). הכל אופליין מתוך data/vocab.json + data/finance.json */
App.learn = (function () {
  const U = App.util, S = App.store, I = App.icon;
  let root;
  let words = [], lessons = [], aiLessons = [], loaded = false;
  let section = "en";                 // en | finance | ai
  let view = { kind: "home" };        // home | practice | weekquiz | lesson({id})
  const BATCH = 10;
  const QUIZ_LEN = 12;
  let weekQuizSession = null;         // { qs:[{word,opts}], idx, correct } — נבנה בכניסה לבוחן
  let dictFilter = "all";             // all | got | miss | none — סינון מסך "המילון שלי"
  let dictSearch = "";
  let practiceMode = "mc";            // mc | mc-rev | flashcard | type — נבחר בתפריט התרגול

  // ---------- storage ----------
  function raw() { return S.get("learn", { batch: 0, marks: {}, lastBatchDate: null, doneLessons: [], featuredSince: {}, autoAdvancedHint: {}, readDoneFiles: [] }); }
  function save(d) { S.set("learn", d); }

  function mark(id, val) {
    const d = raw(); d.marks = d.marks || {}; d.marks[String(id)] = val; save(d);
  }
  function reviewPool() {
    const m = raw().marks || {};
    return Object.keys(m).filter((k) => m[k] === "miss").map((k) => +k);
  }

  // סדר אקראי-קבוע (seeded) של המילים — כך המנה היומית מרגישה אקראית אבל נשארת
  // ניתנת לחישוב זהה גם בענן (ראו daily-reading-prompt.md) בלי לשמור מצב על שרת.
  const SHUFFLE_SEED = 42; // קבוע — אסור לשנות, אחרת הסדר יתפזר מחדש בלי בקרה
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffledOrder(list) {
    const arr = list.slice();
    const rnd = mulberry32(SHUFFLE_SEED);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- data ----------
  async function ensure() {
    if (loaded) return;
    try {
      const [v, f] = await Promise.all([
        fetch(`data/vocab.json`, { cache: "no-cache" }).then((r) => r.json()),
        fetch(`data/finance.json?ts=${Date.now()}`, { cache: "no-cache" }).then((r) => r.json()),
      ]);
      words = shuffledOrder(v.words || []);
      lessons = f.lessons || [];
    } catch { words = []; lessons = []; }
    // מדריך ה-AI — טעינה נפרדת כדי שכשל לא יפיל את השאר
    try {
      const a = await fetch(`data/ai-guide.json?ts=${Date.now()}`, { cache: "no-cache" }).then((r) => r.json());
      aiLessons = a.lessons || [];
    } catch { aiLessons = []; }
    // איפוס חד-פעמי: מעכשיו הסדר היומי אקראי-קבוע והאפוק זז להיום — מנקים סימונים
    // ישנים כדי שהמחזור החדש יתחיל נקי (לא נוגע ב-doneLessons/aiDone/weekQuiz).
    const d = raw();
    if (!d.vocabResetV2) {
      d.marks = {};
      d.lastBatchDate = null;
      d.vocabResetV2 = true;
      save(d);
    }
    loaded = true;
  }

  // בסיס קבוע לחישוב מנת המילים היומית — כך גם שגרת קריאת הבוקר (שרצה בענן, בלי
  // גישה ל-localStorage של המכשיר) יכולה לחשב בדיוק את אותה מנה של 10 מילים.
  const VOCAB_EPOCH = "2026-07-16";
  function daysSince(epochIso, todayIso) {
    const [ey, em, ed] = epochIso.split("-").map(Number);
    const [ty, tm, td] = todayIso.split("-").map(Number);
    return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(ey, em - 1, ed)) / 86400000);
  }
  function batchIndexFor(iso) {
    const totalBatches = Math.max(1, Math.ceil(words.length / BATCH));
    const days = Math.max(0, daysSince(VOCAB_EPOCH, iso));
    return days % totalBatches;
  }
  function todaysBatchIndex() { return batchIndexFor(U.todayISO()); }
  function curBatchWords() {
    const start = todaysBatchIndex() * BATCH;
    return words.slice(start, start + BATCH);
  }
  // כל המילים שכבר הוצגו עד היום (סבב שלם → כל הרשימה; אחרת המנות 0..היום ברצף)
  function learnedWordsSoFar() {
    const totalBatches = Math.max(1, Math.ceil(words.length / BATCH));
    const days = Math.max(0, daysSince(VOCAB_EPOCH, U.todayISO()));
    if (days >= totalBatches - 1) return words.slice();
    return words.slice(0, Math.min((days + 1) * BATCH, words.length));
  }

  // ---------- בוחן שבועי (חמישי/שישי) — מכל המילים שנלמדו אי-פעם, פעם בשבוע ----------
  function weekStartISO() {
    const now = new Date();
    const sunday = new Date(now); sunday.setDate(now.getDate() - now.getDay());
    const p2 = (x) => String(x).padStart(2, "0");
    return `${sunday.getFullYear()}-${p2(sunday.getMonth() + 1)}-${p2(sunday.getDate())}`;
  }
  function isQuizDay() { return [4, 5].includes(new Date().getDay()); } // חמישי/שישי
  function weekQuizState() { return raw().weekQuiz || {}; }
  function weekQuizDoneThisWeek() { return weekQuizState().weekKey === weekStartISO(); }
  function saveWeekQuizResult(score, total) {
    const d = raw();
    d.weekQuiz = { weekKey: weekStartISO(), score, total };
    save(d);
  }

  // ---------- lifecycle ----------
  async function mount(el) { root = el; await ensure(); render(); }
  async function show() { await ensure(); render(); }

  function render() {
    if (section === "en" && view.kind === "practice-menu") return renderPracticeMenu();
    if (section === "en" && view.kind === "practice") return renderPractice();
    if (section === "en" && view.kind === "weekquiz") return renderWeekQuiz();
    if (section === "en" && view.kind === "dictionary") return renderDictionary();
    if ((section === "finance" || section === "ai") && view.kind === "lesson") return renderLesson(view.id);
    renderHome();
  }

  function sectionTabs() {
    return `<div class="seg learn-seg" id="learn-seg" role="tablist" aria-label="מקטע לימוד">
      <button role="tab" data-sec="en" class="${section === "en" ? "on" : ""}" aria-selected="${section === "en"}">אנגלית</button>
      <button role="tab" data-sec="finance" class="${section === "finance" ? "on" : ""}" aria-selected="${section === "finance"}">פיננסים</button>
      <button role="tab" data-sec="ai" class="${section === "ai" ? "on" : ""}" aria-selected="${section === "ai"}">AI</button>
    </div>`;
  }

  function renderHome() {
    root.innerHTML = sectionTabs() + `<div class="stack" style="margin-top:12px">${section === "en" ? enHomeHTML() : courseHomeHTML(courseCfg())}</div>`;
    root.querySelectorAll("#learn-seg button").forEach((b) =>
      b.addEventListener("click", () => { section = b.dataset.sec; view = { kind: "home" }; render(); })
    );
    if (section === "en") wireEnHome(); else wireCourseHome();
  }

  // ========== ENGLISH ==========
  let enIdx = null, enReveal = false;   // המילה המוצגת בכרטיס + האם התרגום גלוי
  function enHomeHTML() {
    const d = raw();
    const list = curBatchWords();
    const marks = d.marks || {};
    const pool = reviewPool();
    const marked = list.filter((w) => marks[String(w.id)]).length;
    const got = list.filter((w) => marks[String(w.id)] === "got").length;
    const allDone = list.length && marked === list.length;
    if (enIdx == null || enIdx >= list.length) {
      const first = list.findIndex((w) => !marks[String(w.id)]);
      enIdx = first < 0 ? 0 : first;
    }
    const w = list[enIdx];
    const st = w ? marks[String(w.id)] : null;
    const reveal = enReveal || st === "miss";

    const dots = list.map((x, i) => {
      const s = marks[String(x.id)];
      return `<button class="wdot${i === enIdx ? " cur" : ""}${s ? " " + s : ""}" data-wi="${i}" aria-label="מילה ${i + 1}: ${U.esc(x.en)}${s === "got" ? " — הבנתי" : s === "miss" ? " — לא הבנתי" : ""}"${i === enIdx ? ' aria-current="true"' : ""}>${i + 1}</button>`;
    }).join("");

    const card = !w ? `<section class="hero" style="padding:20px"><p class="status">טוען מילים…</p></section>` : `
      <section class="hero word-card" aria-label="מילה יומית">
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between"><span class="lbl">מילה ${enIdx + 1} מתוך ${list.length}</span><span class="lbl">הבנתי ${got}</span></div>
          <div class="bar"><i style="width:${Math.round((marked / (list.length || 1)) * 100)}%"></i></div>
        </div>
        <div class="word-en" lang="en">
          <span class="num" style="font-size:40px;font-weight:800;line-height:1.1">${U.esc(w.en)}</span>
          <span class="lbl" style="font-size:14px">${[w.pos, w.rp ? (w.rp === "Prod" ? "Productive" : "Receptive") : ""].filter(Boolean).map(U.esc).join(" · ")}</span>
          ${w.meaningEn ? `<span class="word-mean">${U.esc(w.meaningEn)}</span>` : ""}
        </div>
        ${reveal ? `<div class="word-he"><span style="font-size:20px;font-weight:600">${U.esc(w.he)}</span>
          ${w.family ? `<span class="lbl" lang="en" style="direction:ltr;text-align:left">משפחת מילים: ${U.esc(w.family)}</span>` : ""}</div>`
          : `<button class="btn btn-t" id="en-reveal" style="align-self:flex-start;padding:0">${I("eye", 20)}הצג תרגום</button>`}
        ${st === "miss" ? `<button class="btn btn-p" id="en-next">המילה הבאה ›</button>` : `
        <div class="two-col" style="gap:8px">
          <button class="btn btn-s${st === "miss" ? " on" : ""}" data-act="miss">לא הבנתי</button>
          <button class="btn btn-p" data-act="got">${I("check", 20)}הבנתי</button>
        </div>`}
        <div class="wdots" role="group" aria-label="המילים של היום">${dots}</div>
      </section>`;

    const done = allDone ? `
      <section class="card" style="padding:16px;display:flex;align-items:center;gap:12px">
        <div class="itile" style="color:var(--green)">${I("check")}</div>
        <div style="flex:1;display:flex;flex-direction:column"><span class="t3">סיימת את 10 המילים של היום</span>
          <span class="lbl">${got} הבנתי · ${marked - got} לחזרה · מחר מחכות 10 חדשות</span></div>
      </section>` : "";

    const wqCount = learnedWordsSoFar().length;
    const quizOpen = isQuizDay() && wqCount >= 4;
    const wq = weekQuizState();
    const tiles = `
      <div class="tiles3">
        <button class="card tile" data-dict>${`<div class="itile">${I("book")}</div>`}<span style="font-weight:600">מילון אישי</span><span class="lbl">${wqCount} מילים</span></button>
        <button class="card tile" id="en-practice" ${pool.length ? "" : 'aria-disabled="true"'}><div class="itile">${I("history")}</div><span style="font-weight:600">תרגול</span><span class="lbl">${pool.length ? pool.length + " לחזרה" : "אין לחזרה"}</span></button>
        <button class="card tile${quizOpen ? " hot" : ""}" data-weekquiz ${quizOpen ? "" : 'aria-disabled="true"'}><div class="itile${quizOpen ? " hot" : ""}">${I("bolt")}</div><span style="font-weight:600">בוחן שבועי</span>
          <span class="lbl${quizOpen ? " po-lbl" : ""}">${!quizOpen ? "חמישי–שישי" : weekQuizDoneThisWeek() ? `עשית · ${wq.score}/${wq.total}` : "זמין היום"}</span></button>
      </div>`;

    return `${card}${done}${tiles}
      ${!allDone && list.length ? `<button class="btn btn-t" id="en-finish-batch" style="align-self:center">סמן את כל המנה כ"הבנתי"</button>` : ""}`;
  }

  function wireEnHome() {
    const list = curBatchWords();
    const markAndCheck = (id, act) => {
      mark(id, act);
      const marks = raw().marks || {};
      if (list.every((w) => marks[String(w.id)])) { const d = raw(); d.lastBatchDate = U.todayISO(); save(d); }
    };
    const nextUnmarked = () => {
      const marks = raw().marks || {};
      for (let k = 1; k <= list.length; k++) { const j = (enIdx + k) % list.length; if (!marks[String(list[j].id)]) return j; }
      return Math.min(enIdx + 1, list.length - 1);
    };
    root.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
      const w = list[enIdx]; if (!w) return;
      markAndCheck(w.id, b.dataset.act);
      if (b.dataset.act === "got") { enIdx = nextUnmarked(); enReveal = false; }
      else enReveal = true;
      renderHome();
    }));
    const nx = root.querySelector("#en-next");
    if (nx) nx.addEventListener("click", () => { enIdx = nextUnmarked(); enReveal = false; renderHome(); });
    const rv = root.querySelector("#en-reveal");
    if (rv) rv.addEventListener("click", () => { enReveal = true; renderHome(); });
    root.querySelectorAll("[data-wi]").forEach((b) => b.addEventListener("click", () => { enIdx = +b.dataset.wi; enReveal = false; renderHome(); }));
    const fin = root.querySelector("#en-finish-batch");
    if (fin) fin.addEventListener("click", () => {
      const d = raw(); d.marks = d.marks || {};
      list.forEach((w) => { if (!d.marks[String(w.id)]) d.marks[String(w.id)] = "got"; });
      d.lastBatchDate = U.todayISO(); save(d); renderHome();
    });
    const pr = root.querySelector("#en-practice");
    if (pr) pr.addEventListener("click", () => { if (!reviewPool().length) return; view = { kind: "practice-menu" }; render(); });
    const wq = root.querySelector("[data-weekquiz]");
    if (wq) wq.addEventListener("click", () => {
      if (!(isQuizDay() && learnedWordsSoFar().length >= 4)) { alert("הבוחן השבועי נפתח בימי חמישי ושישי."); return; }
      weekQuizSession = null; view = { kind: "weekquiz" }; render();
    });
    const dict = root.querySelector("[data-dict]");
    if (dict) dict.addEventListener("click", () => { dictFilter = "all"; dictSearch = ""; view = { kind: "dictionary" }; render(); });
  }

  // בוחר n-1 הסחות אקראיות מתוך words (לפי מפתח he/en) + המילה הנכונה, מעורבב
  function pickDistractors(correct, key, n) {
    const others = words.filter((w) => w.id !== correct.id && w[key]);
    const opts = [correct];
    while (opts.length < n && others.length) {
      const cand = others.splice(Math.floor(Math.random() * others.length), 1)[0];
      if (!opts.includes(cand)) opts.push(cand);
    }
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return opts;
  }

  // ----- תפריט בחירת סוג תרגול -----
  function renderPracticeMenu() {
    const n = reviewPool().length;
    const modes = [
      { mode: "mc", icon: "🔤", title: "רב-ברירה", sub: "רואים מילה באנגלית, בוחרים תרגום בעברית" },
      { mode: "mc-rev", icon: "🔄", title: "רב-ברירה הפוכה", sub: "רואים תרגום בעברית, בוחרים את המילה באנגלית" },
      { mode: "flashcard", icon: "🎴", title: "כרטיסיות", sub: "נחשו לפני שחושפים, וסמנו לבד אם ידעתם" },
      { mode: "type", icon: "⌨️", title: "הקלדה", sub: "רואים תרגום בעברית, מקלידים את המילה באנגלית" },
    ];
    root.innerHTML = `
      <button id="pm-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block learn-intro">
        <h3>🎯 תרגול (${n} מילים לחזרה)</h3>
        <p class="section-hint">בחר סוג תרגול:</p>
      </div>
      <div class="list-cards">
        ${modes.map((m) => `
          <button class="list-card" data-mode="${m.mode}">
            <div class="lesson-ico">${m.icon}</div>
            <div class="lc-main">
              <div class="lc-title">${m.title}</div>
              <div class="lc-sub">${m.sub}</div>
            </div>
            <span class="lc-chevron">‹</span>
          </button>`).join("")}
      </div>`;
    root.querySelector("#pm-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
    root.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        practiceMode = b.dataset.mode;
        practiceQ = null;
        flashRevealed = false;
        view = { kind: "practice" };
        render();
      })
    );
  }

  // ----- practice (4 modes over the review pool) -----
  let practiceQ = null;
  let flashRevealed = false;
  function nextPracticeQ() {
    const pool = reviewPool();
    if (!pool.length) { practiceQ = null; return; }
    const id = pool[Math.floor(Math.random() * pool.length)];
    const correct = words.find((w) => w.id === id);
    practiceQ = { correct, opts: pickDistractors(correct, practiceMode === "mc-rev" ? "en" : "he", 4) };
  }

  function emptyPracticeState() {
    root.innerHTML = `
      <button id="pr-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block center">
        <h3>🎉 כל הכבוד!</h3>
        <p class="section-hint">אין מילים לחזרה כרגע. סמן עוד מילים כ"לא הבנתי" כדי לתרגל.</p>
      </div>`;
    root.querySelector("#pr-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
  }

  function renderPractice() {
    if (practiceMode === "flashcard") return renderFlashcard();
    if (practiceMode === "type") return renderTypePractice();
    return renderPracticeMC(practiceMode === "mc-rev");
  }

  function renderPracticeMC(reversed) {
    if (!practiceQ) nextPracticeQ();
    const pool = reviewPool();
    if (!practiceQ) return emptyPracticeState();
    const q = practiceQ;
    const promptHTML = reversed
      ? `<div class="vc-he" style="text-align:center;font-size:20px">🇮🇱 ${U.esc(q.correct.he)}</div><p class="section-hint center">מה המילה באנגלית?</p>`
      : `<div class="practice-word">${U.esc(q.correct.en)} ${q.correct.pos ? `<span class="vc-pos">${U.esc(q.correct.pos)}</span>` : ""}</div><p class="section-hint center">מה הפירוש בעברית?</p>`;
    root.innerHTML = `
      <button id="pr-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block">
        <p class="section-hint center">🎯 תרגול · נותרו ${pool.length} מילים</p>
        ${promptHTML}
        <div class="practice-opts">
          ${q.opts.map((o) => `<button class="practice-opt" data-id="${o.id}">${U.esc(reversed ? o.en : o.he)}</button>`).join("")}
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
          fb.innerHTML = `<span class="pf-no">${reversed ? "המילה" : "הפירוש"}: <b>${U.esc(reversed ? q.correct.en : q.correct.he)}</b></span>
            <button id="pr-cont" class="btn-primary">המשך ←</button>`;
          root.querySelector("#pr-cont").addEventListener("click", () => { practiceQ = null; render(); });
        }
      })
    );
  }

  // ----- תרגול כרטיסיות (Anki-style): נחשו, חשפו, סמנו לבד -----
  function renderFlashcard() {
    if (!practiceQ) { nextPracticeQ(); flashRevealed = false; }
    const pool = reviewPool();
    if (!practiceQ) return emptyPracticeState();
    const q = practiceQ;
    root.innerHTML = `
      <button id="pr-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block center">
        <p class="section-hint center">🎴 כרטיסיות · נותרו ${pool.length} מילים</p>
        <div class="practice-word">${U.esc(q.correct.en)} ${q.correct.pos ? `<span class="vc-pos">${U.esc(q.correct.pos)}</span>` : ""}</div>
        ${flashRevealed
          ? `<div class="vc-he" style="margin-top:14px">🇮🇱 ${U.esc(q.correct.he)}</div>
             <div class="flash-btns">
               <button id="fc-no" class="btn-secondary">❌ לא ידעתי</button>
               <button id="fc-yes" class="btn-primary">✅ ידעתי</button>
             </div>`
          : `<button id="fc-reveal" class="btn-primary full" style="margin-top:14px">הצג תרגום 🔎</button>`}
      </div>`;
    root.querySelector("#pr-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
    const rv = root.querySelector("#fc-reveal");
    if (rv) rv.addEventListener("click", () => { flashRevealed = true; render(); });
    const yes = root.querySelector("#fc-yes");
    if (yes) yes.addEventListener("click", () => { mark(q.correct.id, "got"); practiceQ = null; flashRevealed = false; render(); });
    const no = root.querySelector("#fc-no");
    if (no) no.addEventListener("click", () => { mark(q.correct.id, "miss"); practiceQ = null; flashRevealed = false; render(); });
  }

  // ----- תרגול הקלדה: רואים עברית, מקלידים אנגלית — השוואה סלחנית -----
  function normalizeTyped(s) {
    return s.toLowerCase().replace(/\bsth\b|\bsb\b/g, "").replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  }
  function renderTypePractice() {
    if (!practiceQ) nextPracticeQ();
    const pool = reviewPool();
    if (!practiceQ) return emptyPracticeState();
    const q = practiceQ;
    root.innerHTML = `
      <button id="pr-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block">
        <p class="section-hint center">⌨️ הקלדה · נותרו ${pool.length} מילים</p>
        <div class="vc-he" style="text-align:center;font-size:20px">🇮🇱 ${U.esc(q.correct.he)}</div>
        <p class="section-hint center">הקלד/י את המילה באנגלית</p>
        <input id="tp-input" class="search-input" type="text" autocomplete="off" autocapitalize="off" placeholder="type the word…" />
        <button id="tp-check" class="btn-primary full">בדוק</button>
        <div id="tp-feedback" class="practice-feedback"></div>
      </div>`;
    root.querySelector("#pr-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
    const input = root.querySelector("#tp-input");
    const checkBtn = root.querySelector("#tp-check");
    const check = () => {
      const alts = q.correct.en.split(/ or |\//).map(normalizeTyped);
      const ok = alts.includes(normalizeTyped(input.value));
      const fb = root.querySelector("#tp-feedback");
      input.disabled = true; checkBtn.disabled = true;
      if (ok) {
        fb.innerHTML = `<span class="pf-ok">✅ נכון!</span> <button id="tp-cont" class="btn-primary">המשך ←</button>`;
        mark(q.correct.id, "got");
      } else {
        fb.innerHTML = `<span class="pf-no">התשובה: <b>${U.esc(q.correct.en)}</b></span> <button id="tp-cont" class="btn-primary">המשך ←</button>`;
        mark(q.correct.id, "miss");
      }
      root.querySelector("#tp-cont").addEventListener("click", () => { practiceQ = null; render(); });
    };
    checkBtn.addEventListener("click", check);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
    input.focus();
  }

  // ----- בוחן שבועי (multiple choice, מעורבב, מכל המילים שנלמדו אי-פעם) -----
  // דגימה משוקללת: מילים ❌ מופיעות הכי הרבה, לא-מסומנות באמצע, ✅ הכי פחות (לא נעלמות).
  function buildWeekQuiz() {
    const marks = raw().marks || {};
    const learned = learnedWordsSoFar().filter((w) => w.he);
    const weighted = [];
    learned.forEach((w) => {
      const st = marks[String(w.id)];
      const weight = st === "miss" ? 4 : !st ? 2 : 1;
      for (let i = 0; i < weight; i++) weighted.push(w);
    });
    for (let i = weighted.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [weighted[i], weighted[j]] = [weighted[j], weighted[i]]; }
    const picked = [];
    const seen = new Set();
    for (const w of weighted) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      picked.push(w);
      if (picked.length >= QUIZ_LEN) break;
    }
    const qs = picked.map((correct) => ({ word: correct, opts: pickDistractors(correct, "he", 4) }));
    weekQuizSession = { qs, idx: 0, correct: 0 };
  }

  function renderWeekQuiz() {
    if (!weekQuizSession) buildWeekQuiz();
    const s = weekQuizSession;

    if (!s.qs.length) {
      root.innerHTML = `
        <button id="wq-back" class="btn-secondary">‹ חזרה</button>
        <div class="card-block center">
          <h3>עדיין אין מספיק מילים השבוע</h3>
          <p class="section-hint">חזור אחרי שתלמד עוד כמה מנות יומיות.</p>
        </div>`;
      root.querySelector("#wq-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
      return;
    }

    if (s.idx >= s.qs.length) {
      saveWeekQuizResult(s.correct, s.qs.length);
      const pct = Math.round((s.correct / s.qs.length) * 100);
      const msg = pct >= 80 ? "🌟 מעולה! זכרת כמעט הכל." : pct >= 50 ? "👍 לא רע, אבל כדאי לחזור על כמה מילים." : "💪 היה קשה — כדאי לחזור על המנות של השבוע.";
      root.innerHTML = `
        <button id="wq-back" class="btn-secondary">‹ חזרה</button>
        <div class="card-block center">
          <h3>🏁 סיימת את בוחן השבוע!</h3>
          <p class="practice-word" style="font-size:32px">${s.correct}/${s.qs.length}</p>
          <p class="section-hint">${msg}</p>
          <button id="wq-redo" class="btn-secondary full">🔁 עשה שוב</button>
        </div>`;
      root.querySelector("#wq-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
      root.querySelector("#wq-redo").addEventListener("click", () => { weekQuizSession = null; render(); });
      return;
    }

    const q = s.qs[s.idx];
    root.innerHTML = `
      <button id="wq-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block">
        <p class="section-hint center">🧠 בוחן השבוע · שאלה ${s.idx + 1} מתוך ${s.qs.length}</p>
        <div class="learn-progress"><div class="lp-bar" style="width:${Math.round((s.idx / s.qs.length) * 100)}%"></div></div>
        <div class="practice-word">${U.esc(q.word.en)} ${q.word.pos ? `<span class="vc-pos">${U.esc(q.word.pos)}</span>` : ""}</div>
        <p class="section-hint center">מה הפירוש בעברית?</p>
        <div class="practice-opts">
          ${q.opts.map((o) => `<button class="practice-opt" data-id="${o.id}">${U.esc(o.he)}</button>`).join("")}
        </div>
        <div id="wq-feedback" class="practice-feedback"></div>
      </div>`;
    root.querySelector("#wq-back").addEventListener("click", () => { view = { kind: "home" }; render(); });
    root.querySelectorAll(".practice-opt").forEach((b) =>
      b.addEventListener("click", () => {
        const chosen = +b.dataset.id;
        const fb = root.querySelector("#wq-feedback");
        root.querySelectorAll(".practice-opt").forEach((x) => x.disabled = true);
        const isRight = chosen === q.word.id;
        if (isRight) { b.classList.add("correct"); s.correct++; mark(q.word.id, "got"); }
        else {
          b.classList.add("wrong");
          root.querySelectorAll(".practice-opt").forEach((x) => { if (+x.dataset.id === q.word.id) x.classList.add("correct"); });
          mark(q.word.id, "miss"); // ייכנס למאגר החזרה היומי
        }
        fb.innerHTML = `${isRight ? `<span class="pf-ok">✅ נכון!</span>` : `<span class="pf-no">הפירוש: <b>${U.esc(q.word.he)}</b></span>`}
          <button id="wq-cont" class="btn-primary">המשך ←</button>`;
        root.querySelector("#wq-cont").addEventListener("click", () => { s.idx++; render(); });
      })
    );
  }

  // ----- המילון שלי — כל המילים שנלמדו עד כה, עם חיפוש/סינון/סימון -----
  function dictFilteredWords() {
    const learned = learnedWordsSoFar();
    const marks = raw().marks || {};
    const q = dictSearch.trim().toLowerCase();
    return learned
      .filter((w) => {
        const st = marks[String(w.id)] || "none";
        if (dictFilter !== "all" && st !== dictFilter) return false;
        if (q && !(w.en.toLowerCase().includes(q) || (w.he || "").includes(q))) return false;
        return true;
      })
      .sort((a, b) => a.en.localeCompare(b.en));
  }

  function dictListHTML() {
    const marks = raw().marks || {};
    const filtered = dictFilteredWords();
    if (!filtered.length) return `<p class="section-hint center">אין מילים תואמות לסינון.</p>`;
    return `<div class="vocab-list">${filtered.map((w) => {
      const st = marks[String(w.id)];
      return `
        <div class="vocab-card${st ? " marked-" + st : ""}" data-id="${w.id}">
          <div class="vc-top">
            <div class="vc-en">${U.esc(w.en)} ${w.pos ? `<span class="vc-pos">${U.esc(w.pos)}</span>` : ""}</div>
          </div>
          <div class="vc-he">🇮🇱 ${U.esc(w.he)}</div>
          <div class="vc-btns">
            <button class="vc-btn got${st === "got" ? " sel" : ""}" data-act="got" data-id="${w.id}">✅ הבנתי</button>
            <button class="vc-btn miss${st === "miss" ? " sel" : ""}" data-act="miss" data-id="${w.id}">❌ לא הבנתי</button>
          </div>
        </div>`;
    }).join("")}</div>`;
  }

  function wireDictList() {
    const list = root.querySelector("#dict-list");
    if (list) list.innerHTML = dictListHTML();
    root.querySelectorAll("#dict-list .vc-btn").forEach((b) =>
      b.addEventListener("click", () => { mark(+b.dataset.id, b.dataset.act); wireDictList(); })
    );
    const cnt = root.querySelector("#dict-count");
    if (cnt) cnt.textContent = `${dictFilteredWords().length} מוצגות`;
  }

  function renderDictionary() {
    const total = learnedWordsSoFar().length;
    root.innerHTML = `
      <button id="dict-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block learn-intro">
        <h3>📔 המילון שלי</h3>
        <p class="section-hint">${total} מילים שכבר למדת · <span id="dict-count"></span></p>
        <input id="dict-search" class="search-input" type="search" placeholder="חפש מילה…" value="${U.esc(dictSearch)}" autocomplete="off" />
        <div class="seg dict-seg" id="dict-seg">
          <button data-f="all" class="${dictFilter === "all" ? "active" : ""}">הכל</button>
          <button data-f="got" class="${dictFilter === "got" ? "active" : ""}">✅ הבנתי</button>
          <button data-f="miss" class="${dictFilter === "miss" ? "active" : ""}">❌ לא הבנתי</button>
          <button data-f="none" class="${dictFilter === "none" ? "active" : ""}">⬜ לא סומנו</button>
        </div>
      </div>
      <div id="dict-list"></div>
      <button class="close-fab" aria-label="סגור וחזור">✕</button>`;
    const goHome = () => { view = { kind: "home" }; render(); };
    root.querySelector("#dict-back").addEventListener("click", goHome);
    root.querySelector(".close-fab").addEventListener("click", goHome);
    root.querySelector("#dict-search").addEventListener("input", (e) => { dictSearch = e.target.value; wireDictList(); });
    root.querySelectorAll("#dict-seg button").forEach((b) =>
      b.addEventListener("click", () => {
        dictFilter = b.dataset.f;
        root.querySelectorAll("#dict-seg button").forEach((x) => x.classList.toggle("active", x === b));
        wireDictList();
      })
    );
    wireDictList();
  }

  // ========== COURSES (finance / ai) ==========
  function courseCfg() {
    if (section === "ai") return {
      arr: aiLessons, doneKey: "aiDone", levels: true,
      title: "🤖 לעבוד עם AI — מאפס לרמת המובילים",
      hint: "מסלול מסודר ב-3 רמות: מאפס למתקדם, רמה בינלאומית, ולהמשך החיים. התקדם לפי הסדר.",
    };
    return {
      arr: lessons, doneKey: "doneLessons", levels: true,
      title: "💰 ידע פיננסי מהיסוד",
      hint: "100 שיעורים ב-5 רמות — מיסודות הכסף ועד מסים, נדל\"ן והשקעות. מתקדם כשאתה מסמן ✅ סיימתי.",
    };
  }

  // אם השיעור המומלץ נשאר "תקוע" (לא סומן) STALE_DAYS ימים רצוף — מתקדם צעד אחד קדימה
  // בלבד (לא קפיצה קלנדרית לפי כמה ימים עברו מההתחלה — רק "בטחון" נגד תקיעות).
  const STALE_DAYS = 3;
  function autoAdvanceStale(cfg) {
    const d = raw();
    const arr = cfg.arr;
    if (!arr.length) return;
    d.featuredSince = d.featuredSince || {};
    d.autoAdvancedHint = d.autoAdvancedHint || {};
    const done = d[cfg.doneKey] || [];
    const featuredIdx = arr.findIndex((l) => !done.includes(l.id));
    if (featuredIdx < 0) return;
    const featured = arr[featuredIdx];
    const rec = d.featuredSince[cfg.doneKey];
    const today = U.todayISO();
    if (!rec || rec.id !== featured.id) {
      d.featuredSince[cfg.doneKey] = { id: featured.id, date: today };
      save(d);
      return;
    }
    if (daysSince(rec.date, today) >= STALE_DAYS) {
      d[cfg.doneKey] = [...done, featured.id];
      d.autoAdvancedHint[cfg.doneKey] = featured.title;
      delete d.featuredSince[cfg.doneKey];
      save(d);
    }
  }

  function courseHomeHTML(cfg) {
    autoAdvanceStale(cfg);
    const d = raw();
    const done = d[cfg.doneKey] || [];
    const arr = cfg.arr;
    if (!arr.length) return `<section class="card" style="padding:16px"><p class="status">התוכן בטעינה… נסה לרענן בעוד רגע.</p></section>`;
    const autoHint = d.autoAdvancedHint && d.autoAdvancedHint[cfg.doneKey];
    if (autoHint) { const dd = raw(); delete dd.autoAdvancedHint[cfg.doneKey]; save(dd); }
    let featuredIdx = arr.findIndex((l) => !done.includes(l.id));
    const allDone = featuredIdx < 0;
    if (allDone) featuredIdx = 0;
    const featured = arr[featuredIdx];
    const pct = Math.round((done.length / arr.length) * 100);

    const order = [], groups = {};
    arr.forEach((l, i) => {
      const lv = l.level || "שיעורים";
      if (!groups[lv]) { groups[lv] = []; order.push(lv); }
      groups[lv].push({ l, i });
    });
    const curLevel = featured.level || "שיעורים";
    const levels = order.map((lv, li) => {
      const items = groups[lv];
      const n = items.filter((x) => done.includes(x.l.id)).length;
      const complete = n === items.length, current = lv === curLevel && !allDone;
      return `<details class="lvl"${current ? " open" : ""}>
        <summary><span class="num lvl-n${complete ? " ok" : current ? " cur" : ""}">${complete ? I("check", 18) : li + 1}</span>
          <span class="grow"><span style="font-weight:600">${U.esc(lv)}</span><span class="bar" style="height:4px"><i class="${complete ? "ok" : ""}" style="width:${Math.round((n / items.length) * 100)}%"></i></span></span>
          <span class="lbl">${n}/${items.length}</span></summary>
        ${items.map(({ l, i }) => `<button class="lesson-row${i === featuredIdx && !allDone ? " cur" : ""}" data-lesson="${l.id}">
          <span class="lr-ico" aria-hidden="true">${done.includes(l.id) ? I("check", 18) : i + 1}</span>
          <span class="grow"><span style="font-weight:500">${U.esc(l.title)}</span>${l.tip ? `<span class="lbl">${U.esc(l.tip)}</span>` : ""}</span>
          <span class="chev">${I("chev")}</span></button>`).join("")}
      </details>`;
    }).join("");

    return `
      ${autoHint ? `<p class="lbl" style="margin:0 4px">סימנו אוטומטית את "<b>${U.esc(autoHint)}</b>" כהושלם אחרי ${STALE_DAYS} ימים בלי סימון — אפשר לחזור אליו מהרשימה.</p>` : ""}
      <section class="hero" style="padding:20px;display:flex;flex-direction:column;gap:14px">
        <span class="lbl">${allDone ? "סיימת את כל המסלול" : done.length ? "המשך מאיפה שעצרת" : "התחל כאן"} · ${U.esc(curLevel)}</span>
        <h2 class="t3" style="font-size:20px">שיעור ${featuredIdx + 1}: ${U.esc(featured.title)}</h2>
        ${featured.tip ? `<span class="lbl">${U.esc(featured.tip)}</span>` : ""}
        <div style="display:flex;align-items:center;gap:10px"><div class="bar" style="flex-grow:1;margin:0"><i style="width:${pct}%"></i></div><span class="lbl">${done.length}/${arr.length}</span></div>
        <button class="btn btn-p" data-lesson="${featured.id}">${done.length ? "המשך שיעור" : "התחל שיעור"}</button>
      </section>
      <h2 class="sec-title">${U.esc(cfg.title.replace(/^\S+\s/, ""))}</h2>
      <section class="card" style="padding:4px 0">${levels}</section>`;
  }

  function wireCourseHome() {
    root.querySelectorAll("[data-lesson]").forEach((b) =>
      b.addEventListener("click", () => { view = { kind: "lesson", id: b.dataset.lesson }; render(); window.scrollTo(0, 0); })
    );
  }

  function renderLesson(id) {
    const cfg = courseCfg();
    const arr = cfg.arr;
    const l = arr.find((x) => x.id === id);
    if (!l) { view = { kind: "home" }; return renderHome(); }
    const done = raw()[cfg.doneKey] || [];
    const isDone = done.includes(id);
    const idx = arr.findIndex((x) => x.id === id);
    const next = arr[idx + 1];
    const body = window.marked ? window.marked.parse(l.md) : `<pre>${U.esc(l.md)}</pre>`;
    root.innerHTML = `
      <div class="subhead"><button class="ibtn ghost" id="ls-back" aria-label="חזרה לשיעורים">${I("back")}</button>
        <div style="flex:1;display:flex;flex-direction:column;min-width:0"><span class="lbl" style="font-size:12px">שיעור ${idx + 1} מתוך ${arr.length}${l.level ? " · " + U.esc(l.level) : ""}</span>
        <h1 class="t3">${U.esc(l.title)}</h1></div></div>
      <div class="card-block lesson-body">${body}</div>
      <div class="card-block">
        <button id="ls-nblm" class="btn btn-s full">פתח ב-NotebookLM (שמע, סיכום, מפת חשיבה)</button>
        <p class="section-hint" id="ls-nblm-hint" style="margin-top:8px"></p>
      </div>
      <div class="card-block reminder-card">
        <div class="rem-title">תזכורת לחזור על השיעור</div>
        <p class="section-hint">חזרה מרווחת עוזרת לזכור — קבע תזכורת ביומן:</p>
        <div class="rem-btns">
          <button class="rem-opt" data-days="1">מחר</button>
          <button class="rem-opt" data-days="3">בעוד 3 ימים</button>
          <button class="rem-opt" data-days="7">בעוד שבוע</button>
        </div>
        <p class="section-hint" id="rem-hint"></p>
      </div>
      <button id="ls-done" class="btn ${isDone ? "btn-s" : "btn-p"} full">${isDone ? "הושלם · סמן כלא נלמד" : "סיימתי את השיעור"}</button>
      ${next ? `<button id="ls-next" class="btn btn-t full">לשיעור הבא: ${U.esc(next.title)} ›</button>` : ""}
      <button class="close-fab" aria-label="סגור וחזור">✕</button>
    `;
    const goHome = () => { view = { kind: "home" }; render(); };
    root.querySelector("#ls-back").addEventListener("click", goHome);
    root.querySelector(".close-fab").addEventListener("click", goHome);
    root.querySelector("#ls-nblm").addEventListener("click", () => openInNotebookLM(l));
    root.querySelectorAll(".rem-opt").forEach((b) =>
      b.addEventListener("click", () => makeLessonReminder(l, +b.dataset.days))
    );
    root.querySelector("#ls-done").addEventListener("click", () => {
      const d = raw(); d[cfg.doneKey] = d[cfg.doneKey] || [];
      const i = d[cfg.doneKey].indexOf(id);
      if (i >= 0) d[cfg.doneKey].splice(i, 1); else d[cfg.doneKey].push(id);
      save(d);
      if (i < 0 && next) { view = { kind: "lesson", id: next.id }; window.scrollTo(0, 0); }
      render();
    });
    const nx = root.querySelector("#ls-next");
    if (nx) nx.addEventListener("click", () => { view = { kind: "lesson", id: next.id }; window.scrollTo(0, 0); render(); });
  }

  // תזכורת חד-פעמית לשיעור בודד (חזרה מרווחת) — קובץ ICS להוספה ליומן
  function makeLessonReminder(l, days) {
    const now = new Date();
    const dt = new Date(now.getTime() + days * 86400000);
    const p2 = (x) => String(x).padStart(2, "0");
    const dstr = `${dt.getFullYear()}${p2(dt.getMonth() + 1)}${p2(dt.getDate())}T180000`;
    const stamp = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`;
    const ico = section === "ai" ? "🤖" : "💰";
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//halbonintz//HE", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT", `UID:halbonintz-${U.uid()}@local`, `DTSTAMP:${stamp}`, `DTSTART:${dstr}`,
      `SUMMARY:${ico} חזרה על שיעור: ${l.title}`,
      "DESCRIPTION:זמן לחזור על השיעור באפליקציית חלבונינץ 🌿",
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT0M", "DESCRIPTION:תזכורת", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    U.download("lesson-reminder.ics", ics, "text/calendar");
    const hint = root.querySelector("#rem-hint");
    if (hint) hint.innerHTML = `הקובץ ירד — פתח אותו ב-iOS ולחץ «הוסף» לתזכורת בעוד ${days === 1 ? "יום" : days + " ימים"}. ✅`;
  }

  // מעתיק את השיעור ללוח ופותח את NotebookLM בכרטיסייה חדשה — אין API רשמי
  // שמעביר תוכן אוטומטית, אז השלב האחרון (הדבקה) נשאר ידני.
  async function openInNotebookLM(l) {
    const hint = root.querySelector("#ls-nblm-hint");
    let copied = false;
    try {
      await navigator.clipboard.writeText(`${l.title}\n\n${l.md}`);
      copied = true;
    } catch {}
    window.open("https://notebooklm.google.com/", "_blank", "noopener");
    if (hint) {
      hint.innerHTML = copied
        ? `הטקסט הועתק ללוח ✅ ב-NotebookLM: <b>+ Add source → Paste text</b> → הדבק (Cmd/Ctrl+V) → Insert. אז תוכל לבחור <b>Audio Overview</b> (שמע), סיכום או מפת חשיבה.`
        : `לא הצלחנו להעתיק אוטומטית — פתח את NotebookLM והדבק את השיעור ידנית (חזור לכאן, סמן והעתק את הטקסט).`;
    }
  }

  // התקדמות המנה היומית — לכרטיס "10 המילים של היום" במסך הבית
  async function todayProgress() {
    await ensure();
    const list = curBatchWords();
    const marks = raw().marks || {};
    const done = list.filter((w) => marks[String(w.id)]).length;
    const next = list.find((w) => !marks[String(w.id)]);
    return { done, total: list.length || 10, next: next ? next.en : "" };
  }

  // פתיחה מבחוץ (כרטיסי הלימוד בבית): מקטע מסוים, ואופציונלית שיעור מסוים
  function openSection(sec, lessonId) {
    section = ["en", "finance", "ai"].includes(sec) ? sec : "en";
    view = lessonId ? { kind: "lesson", id: lessonId } : { kind: "home" };
    if (root) render();
  }
  // השיעור הבא בכל מסלול — לכרטיסים במסך הבית
  async function courseNext(sec) {
    await ensure();
    const arr = sec === "ai" ? aiLessons : lessons;
    const doneKey = sec === "ai" ? "aiDone" : "doneLessons";
    if (!arr.length) return null;
    const done = raw()[doneKey] || [];
    let i = arr.findIndex((l) => !done.includes(l.id));
    const finished = i < 0;
    if (finished) i = arr.length - 1;
    return { id: arr[i].id, title: arr[i].title, level: arr[i].level || "", n: i + 1, done: done.length, total: arr.length, finished };
  }

  return { mount, show, todayProgress, openSection, courseNext, home: () => { view = { kind: "home" }; if (root) render(); }, isHome: () => view.kind === "home" };
})();
