"use strict";
window.App = window.App || {};

/* טאב לימוד: אוצר מילים לאנגלית (10 מילים ביום, סימון הבנתי/לא הבנתי + תרגול)
   ומסלול ידע פיננסי מהיסוד (שיעורים). הכל אופליין מתוך data/vocab.json + data/finance.json */
App.learn = (function () {
  const U = App.util, S = App.store;
  let root;
  let words = [], lessons = [], readings = [], aiLessons = [], loaded = false;
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
  function isReadingDone(file) { return (raw().readDoneFiles || []).includes(file); }
  function toggleReadingDone(file) {
    const d = raw(); d.readDoneFiles = d.readDoneFiles || [];
    const i = d.readDoneFiles.indexOf(file);
    if (i >= 0) d.readDoneFiles.splice(i, 1); else d.readDoneFiles.push(file);
    save(d);
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
    // קריאת הבוקר (נוצרת ע"י routine יומי) — טעינה נפרדת כדי שכשל לא יפיל את השאר
    try {
      const r = await fetch(`../readings/index.json?ts=${Date.now()}`, { cache: "no-cache" });
      if (r.ok) readings = (await r.json()).readings || [];
    } catch { readings = []; }
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

  function todaysReading() {
    if (!readings.length) return null;
    const sorted = readings.slice().sort((a, b) => b.date.localeCompare(a.date));
    return sorted.find((r) => r.date === U.todayISO()) || sorted[0];
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
    if (section === "en" && view.kind === "reading") return renderReading(view.file);
    if ((section === "finance" || section === "ai") && view.kind === "lesson") return renderLesson(view.id);
    renderHome();
  }

  function sectionTabs() {
    return `<div class="seg learn-seg" id="learn-seg">
      <button data-sec="en" class="${section === "en" ? "active" : ""}">🔤 אנגלית</button>
      <button data-sec="finance" class="${section === "finance" ? "active" : ""}">💰 פיננסים</button>
      <button data-sec="ai" class="${section === "ai" ? "active" : ""}">🤖 AI</button>
    </div>`;
  }

  function renderHome() {
    root.innerHTML = sectionTabs() + (section === "en" ? enHomeHTML() : courseHomeHTML(courseCfg()));
    root.querySelectorAll("#learn-seg button").forEach((b) =>
      b.addEventListener("click", () => { section = b.dataset.sec; view = { kind: "home" }; render(); })
    );
    if (section === "en") wireEnHome(); else wireCourseHome();
  }

  // ========== ENGLISH ==========
  function enHomeHTML() {
    const d = raw();
    const batch = todaysBatchIndex();
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
        <div class="fin-today-tag">📖 קריאת הבוקר · ~7 דק'</div>
        <div class="fin-today-row">
          <span class="fin-today-ico">📰</span>
          <div>
            <div class="fin-today-title">${U.esc(rd.title || "Daily Reading")} ${isReadingDone(rd.file) ? '<span class="lesson-done">✓</span>' : ""}</div>
            <div class="fin-today-tip">${rd.date === today ? "חדש להיום" : U.prettyDate(rd.date)} · קריאה באנגלית לתרגול</div>
          </div>
        </div>
        <div class="fin-today-cta">קרא עכשיו ←</div>
      </button>` : "";

    const wq = weekQuizState();
    const wqDoneThisWeek = weekQuizDoneThisWeek();
    const wqCount = learnedWordsSoFar().length;
    const quizCard = (isQuizDay() && wqCount >= 4) ? `
      <button class="card-block fin-today quiz-card" data-weekquiz>
        <div class="fin-today-tag">🧠 בוחן השבוע · ${wqCount} מילים</div>
        <div class="fin-today-row">
          <span class="fin-today-ico">📝</span>
          <div>
            <div class="fin-today-title">${wqDoneThisWeek ? `כבר עשית השבוע — ${wq.score}/${wq.total} ✅` : "בוא נבדוק מה זכרת מכל השבוע"}</div>
            <div class="fin-today-tip">בוחן קצרצר (עד 12 שאלות) מכל המילים שלמדת, עם עדיפות למילים שסימנת ❌</div>
          </div>
        </div>
        <div class="fin-today-cta">${wqDoneThisWeek ? "עשה שוב ←" : "התחל בוחן ←"}</div>
      </button>` : "";

    const dictCard = `
      <button class="card-block fin-today dict-entry-card" data-dict>
        <div class="fin-today-tag">📔 המילון שלי</div>
        <div class="fin-today-row">
          <span class="fin-today-ico">📔</span>
          <div>
            <div class="fin-today-title">${learnedWordsSoFar().length} מילים שלמדת עד כה</div>
            <div class="fin-today-tip">חפש, סנן וחזור על כל מילה שכבר ראית</div>
          </div>
        </div>
        <div class="fin-today-cta">פתח את המילון ←</div>
      </button>`;

    return `
      ${readingCard}
      ${quizCard}
      ${dictCard}
      <div class="card-block learn-intro">
        <h3>🔤 המנה היומית — 10 מילים ${doneToday && markedCount === list.length ? '<span class="lesson-done">✓ סיימת</span>' : ""}</h3>
        <p class="section-hint">סמן ✅ אם הבנת, או ❌ אם לא — ואז יופיע התרגום + תרגול. מנה ${batch + 1} מתוך ${totalBatches}.</p>
        <div class="learn-progress"><div class="lp-bar" style="width:${Math.round(((batch) / totalBatches) * 100)}%"></div></div>
        <div class="learn-stats">
          <span>📚 נלמדו: <b>${Object.values(marks).length}</b></span>
          <span>🔁 לחזרה: <b>${pool.length}</b></span>
        </div>
      </div>
      <div class="vocab-list">${cards}</div>
      ${!doneToday ? `<button id="en-finish-batch" class="btn-primary full">✅ סיימתי את כל המנה של היום</button>` : ""}
      ${pool.length ? `<button id="en-practice" class="btn-primary full">🎯 תרגול (${pool.length})</button>` : ""}
      ${doneToday && markedCount === list.length
        ? `<p class="section-hint center">מעולה! סיימת את המנה של היום 🎉 מחר יחכו לך 10 מילים חדשות אוטומטית — אותן מילים שיופיעו גם בקריאת הבוקר.</p>`
        : `<p class="section-hint center">⏭️ מחר תקבל אוטומטית 10 מילים חדשות — בלי חזרה על היום. אותן 10 מילים ישולבו גם בקריאת הבוקר.</p>`}
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
    const fin = root.querySelector("#en-finish-batch");
    if (fin) fin.addEventListener("click", () => {
      const d = raw(); d.marks = d.marks || {};
      curBatchWords().forEach((w) => { if (!d.marks[String(w.id)]) d.marks[String(w.id)] = "got"; });
      d.lastBatchDate = U.todayISO();
      save(d);
      renderHome();
    });
    const pr = root.querySelector("#en-practice");
    if (pr) pr.addEventListener("click", () => { view = { kind: "practice-menu" }; render(); });
    const rd = root.querySelector("[data-reading]");
    if (rd) rd.addEventListener("click", () => { view = { kind: "reading", file: rd.dataset.reading }; render(); });
    const wq = root.querySelector("[data-weekquiz]");
    if (wq) wq.addEventListener("click", () => { weekQuizSession = null; view = { kind: "weekquiz" }; render(); });
    const dict = root.querySelector("[data-dict]");
    if (dict) dict.addEventListener("click", () => { dictFilter = "all"; dictSearch = ""; view = { kind: "dictionary" }; render(); });
  }

  // ----- קריאת הבוקר (Markdown מתוך readings/) -----
  async function renderReading(file) {
    const done = isReadingDone(file);
    root.innerHTML = `
      <button id="rd-back" class="btn-secondary">‹ חזרה</button>
      <div class="card-block lesson-body reading-article" id="rd-article"><p class="status">טוען…</p></div>
      <button id="rd-done" class="btn-${done ? "secondary" : "primary"} full">${done ? "✓ הושלם — סמן כלא נקרא" : "✅ סיימתי לקרוא"}</button>
      <button class="close-fab" aria-label="סגור וחזור">✕</button>`;
    const goHome = () => { view = { kind: "home" }; render(); };
    root.querySelector("#rd-back").addEventListener("click", goHome);
    root.querySelector(".close-fab").addEventListener("click", goHome);
    root.querySelector("#rd-done").addEventListener("click", () => { toggleReadingDone(file); renderReading(file); });
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
    if (!arr.length) return `<div class="card-block"><p class="status">התוכן בטעינה… נסה לרענן בעוד רגע.</p></div>`;
    const autoHint = d.autoAdvancedHint && d.autoAdvancedHint[cfg.doneKey];
    if (autoHint) {
      const dd = raw(); delete dd.autoAdvancedHint[cfg.doneKey]; save(dd);
    }
    let featuredIdx = arr.findIndex((l) => !done.includes(l.id));
    if (featuredIdx < 0) featuredIdx = 0;
    const featured = arr[featuredIdx];
    const pct = arr.length ? Math.round((done.length / arr.length) * 100) : 0;

    const cardFor = (l, i) => {
      const isDone = done.includes(l.id);
      const isFeatured = i === featuredIdx;
      const tag = "המשך";
      return `
        <button class="list-card lesson-card${isFeatured ? " lesson-today" : ""}" data-lesson="${l.id}">
          <div class="lesson-ico">${l.icon}</div>
          <div class="lc-main">
            <div class="lc-title">${i + 1}. ${U.esc(l.title)} ${isDone ? '<span class="lesson-done">✓</span>' : ""}${isFeatured ? ` <span class="lesson-todaytag">${tag}</span>` : ""}</div>
            <div class="lc-sub">${U.esc(l.tip || "")}</div>
          </div>
          <span class="lc-chevron">‹</span>
        </button>`;
    };

    let listHTML;
    if (cfg.levels) {
      const order = [], groups = {};
      arr.forEach((l, i) => {
        const lv = l.level || "שיעורים";
        if (!groups[lv]) { groups[lv] = []; order.push(lv); }
        groups[lv].push(cardFor(l, i));
      });
      listHTML = order.map((lv) =>
        `<p class="learn-level-h">${U.esc(lv)}</p><div class="list-cards">${groups[lv].join("")}</div>`
      ).join("");
    } else {
      listHTML = `<div class="list-cards">${arr.map((l, i) => cardFor(l, i)).join("")}</div>`;
    }

    const featTag = done.length ? "▶️ המשך מכאן" : "▶️ התחל כאן";
    const featuredCard = featured ? `
      <button class="card-block fin-today" data-lesson="${featured.id}">
        <div class="fin-today-tag">${featTag}</div>
        <div class="fin-today-row">
          <span class="fin-today-ico">${featured.icon}</span>
          <div>
            <div class="fin-today-title">${U.esc(featured.title)}</div>
            <div class="fin-today-tip">${U.esc(featured.tip || "")}</div>
          </div>
        </div>
        <div class="fin-today-cta">פתח שיעור ←</div>
      </button>` : "";

    return `
      ${autoHint ? `<p class="section-hint center">⏭️ סימנו אוטומטית "<b>${U.esc(autoHint)}</b>" כהושלם כי עברו ${STALE_DAYS} ימים בלי סימון — אפשר לחזור אליו בכל זמן מרשימת השיעורים למטה.</p>` : ""}
      <div class="card-block learn-intro">
        <h3>${cfg.title}</h3>
        <p class="section-hint">${cfg.hint}</p>
        <div class="learn-progress"><div class="lp-bar" style="width:${pct}%"></div></div>
        <div class="learn-stats"><span>✅ הושלמו: <b>${done.length}/${arr.length}</b></span></div>
      </div>
      ${featuredCard}
      <p class="section-hint" style="margin:14px 0 6px">כל השיעורים:</p>
      ${listHTML}`;
  }

  function wireCourseHome() {
    root.querySelectorAll("[data-lesson]").forEach((b) =>
      b.addEventListener("click", () => { view = { kind: "lesson", id: b.dataset.lesson }; render(); })
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
      <button id="ls-back" class="btn-secondary">‹ חזרה לשיעורים</button>
      <h2 class="view-h2">${l.icon} ${U.esc(l.title)}</h2>
      <div class="card-block lesson-body">${body}</div>
      <div class="card-block">
        <button id="ls-nblm" class="btn-secondary full">📓 פתח ב-NotebookLM (שמע/סיכום/מפת חשיבה)</button>
        <p class="section-hint" id="ls-nblm-hint" style="margin-top:8px"></p>
      </div>
      <div class="card-block reminder-card">
        <div class="rem-title">🔔 תזכורת לחזור על השיעור</div>
        <p class="section-hint">חזרה מרווחת עוזרת לזכור — קבע תזכורת ביומן:</p>
        <div class="rem-btns">
          <button class="rem-opt" data-days="1">מחר</button>
          <button class="rem-opt" data-days="3">בעוד 3 ימים</button>
          <button class="rem-opt" data-days="7">בעוד שבוע</button>
        </div>
        <p class="section-hint" id="rem-hint"></p>
      </div>
      <button id="ls-done" class="btn-${isDone ? "secondary" : "primary"} full">${isDone ? "✓ הושלם — סמן כלא נלמד" : "✅ סיימתי את השיעור"}</button>
      ${next ? `<button id="ls-next" class="btn-secondary full">לשיעור הבא: ${U.esc(next.title)} ←</button>` : ""}
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

  return { mount, show, isHome: () => view.kind === "home" };
})();
