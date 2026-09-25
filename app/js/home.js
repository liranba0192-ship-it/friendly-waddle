"use strict";
window.App = window.App || {};

// טאב בית — "דשבורד היום": קלוריות ומאקרו, מים, משקל, האימון של היום, התדריך של היום, 10 המילים.
// התדריך (App.briefing) מותקן כאן כתת-מסך.
App.home = (function () {
  const U = App.util, S = App.store, I = App.icon;
  const HE_MONTHS = ["בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני", "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"];
  let root, mainEl, subEl, brfEl, briefingMounted = false, inSub = false;
  let latestBriefing = null, briefingLoaded = false, words = null;

  function mount(el) {
    root = el;
    root.innerHTML = `
      <div id="home-main"></div>
      <div id="home-sub" hidden>
        <div class="subhead">
          <button class="ibtn ghost" id="home-back" aria-label="חזרה לבית">${I("back")}</button>
          <span class="t3">תדריכי בוקר</span>
        </div>
        <div id="home-brf"></div>
      </div>`;
    mainEl = root.querySelector("#home-main");
    subEl = root.querySelector("#home-sub");
    brfEl = root.querySelector("#home-brf");
    root.querySelector("#home-back").addEventListener("click", home);
    render();
    loadAsync();
  }
  function show() { if (!inSub) { render(); loadAsync(); } }

  async function loadAsync() {
    try {
      const res = await fetch(`../briefings/index.json?ts=${Date.now()}`, { cache: "no-cache" });
      const data = await res.json();
      latestBriefing = (data.briefings || []).slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    } catch { latestBriefing = null; }
    briefingLoaded = true;
    try { if (App.workout && App.workout.ready) await App.workout.ready(); } catch {}
    try { words = App.learn && App.learn.todayProgress ? await App.learn.todayProgress() : null; } catch { words = null; }
    if (!inSub) render();
  }

  // ---------- תת-מסך: תדריכים ----------
  function open(sub, opts) {
    if (sub !== "briefing") return;
    inSub = true;
    mainEl.hidden = true;
    subEl.hidden = false;
    if (!briefingMounted) { App.briefing.mount(brfEl); briefingMounted = true; }
    else App.briefing.show();
    if (opts && opts.item) App.briefing.openItem(opts.item);
    else App.briefing.showList();
    App.updateChrome();
  }
  function home() {
    inSub = false;
    subEl.hidden = true;
    mainEl.hidden = false;
    render();
    App.updateChrome();
    window.scrollTo(0, 0);
  }
  function isHome() { return !inSub; }

  // ---------- נתונים ----------
  function greeting() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "בוקר טוב";
    if (h >= 12 && h < 17) return "צהריים טובים";
    if (h >= 17 && h < 22) return "ערב טוב";
    return "לילה טוב";
  }
  function dateLabel() {
    const d = new Date();
    return `${U.dayName(U.todayISO())} · ${d.getDate()} ${HE_MONTHS[d.getMonth()]}`;
  }
  function foodToday() {
    const today = U.todayISO();
    const list = S.get("food.entries", []).filter((e) => e.date === today);
    return list.reduce((a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  }
  function weightInfo() {
    const logs = S.get("weight.logs", []).slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
    if (!logs.length) return null;
    const last = logs[logs.length - 1];
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const p2 = (x) => String(x).padStart(2, "0");
    const wIso = `${weekAgo.getFullYear()}-${p2(weekAgo.getMonth() + 1)}-${p2(weekAgo.getDate())}`;
    const before = logs.filter((l) => l.date <= wIso).pop() || logs[0];
    const diff = before === last ? 0 : U.round(last.kg - before.kg, 1);
    return { kg: last.kg, date: last.date, diff };
  }

  function ring(consumed, target, size) {
    const r = size / 2 - 10, C = 2 * Math.PI * r;
    const len = target ? Math.min(1, consumed / target) * C : 0;
    return `<div class="ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="12"/>
        <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${len.toFixed(1)} ${(C - len + 0.01).toFixed(1)}"/>
      </svg>
      <div class="ring-mid"><span class="num" style="font-size:30px">${Math.round(consumed).toLocaleString("he-IL")}</span>
        <span class="lbl" style="font-size:12px">מתוך ${Number(target).toLocaleString("he-IL")}</span></div>
    </div>`;
  }
  function macro(name, val, target, cls) {
    const pct = target ? Math.min(100, Math.round((val / target) * 100)) : 0;
    return `<div class="macro-row">
      <div><span>${name}</span><span class="lbl">${Math.round(val)}/${target} ג׳</span></div>
      <div class="bar"><i class="${cls}" style="width:${pct}%"></i></div>
    </div>`;
  }

  // ---------- רינדור ----------
  function render() {
    if (!mainEl) return;
    const today = U.todayISO();
    const tg = App.nutrition.targets();
    const t = foodToday();
    const left = Math.round(tg.kcal - t.kcal);
    const water = S.get("food.water", {})[today] || 0;
    const waterGoal = S.get("food.waterGoal", 2500);
    const w = weightInfo();
    const wk = App.workout && App.workout.todaySummary ? App.workout.todaySummary() : null;
    const readSet = S.get("briefing.read", []);

    const weightCard = w
      ? `<span class="numline"><span class="num" style="font-size:28px">${w.kg}</span><span class="lbl">ק״ג</span></span>
         ${w.diff ? `<span class="${w.diff < 0 ? "trend-down" : "trend-up"}" style="display:flex;align-items:center;gap:4px;font-size:13px;font-weight:600">${I(w.diff < 0 ? "down" : "up", 16)}${Math.abs(w.diff)} בשבוע</span>` : `<span class="lbl">ללא שינוי השבוע</span>`}
         <span class="lbl" style="margin-top:auto">${w.date === today ? "נשקלת היום" : "שקילה אחרונה " + U.prettyDate(w.date)}</span>`
      : `<span class="lbl">עוד לא נשקלת</span><span class="btn-t" style="padding:0;min-height:0;justify-content:flex-start">הזן שקילה ›</span>`;

    let wkCard;
    if (!wk) wkCard = "";
    else if (wk.rest) {
      wkCard = `<section class="card stack-card" aria-label="האימון של היום">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="display:flex;flex-direction:column;gap:4px"><span class="lbl">האימון של היום</span><h2 class="t2">יום מנוחה</h2><span class="lbl">מומלץ: 30 דק׳ הליכה קלה</span></div>
          <div class="itile lg">${I("rest")}</div>
        </div>
        <button class="btn btn-s" data-go="workout">פתח אימון</button>
      </section>`;
    } else {
      wkCard = `<section class="card stack-card" aria-label="האימון של היום">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
            <span class="lbl">האימון של היום</span>
            <h2 class="t2">${U.esc(wk.splitLabel)}</h2>
            <span class="lbl">${wk.doneCount ? `תועדו היום ${wk.doneCount} תרגילים · ${wk.doneSets} סטים` : `${wk.exerciseCount} תרגילים זמינים`}</span>
          </div>
          <div class="itile lg">${I("dumbbell")}</div>
        </div>
        <button class="btn btn-s" data-go="workout">${I("play", 20, "accent")}${wk.doneCount ? "המשך אימון" : "התחל אימון"}</button>
      </section>`;
    }

    let brfCard = "";
    if (latestBriefing) {
      const isToday = latestBriefing.date === today;
      const tags = (latestBriefing.title || "").split("·").map((x) => x.trim()).filter(Boolean);
      brfCard = `<button class="card row-card" data-brief>
        <div class="itile lg warm">${I("bolt")}</div>
        <div class="grow">
          <span class="lbl">${isToday ? "התדריך של היום" : "התדריך האחרון · " + U.prettyDate(latestBriefing.date)} · 4 דק׳${readSet.includes(latestBriefing.date) ? " · נקרא" : ""}</span>
          <h2 class="t3">${U.esc(tags[0] || latestBriefing.title || "תדריך בוקר")}</h2>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${tags.slice(1, 3).map((x) => `<span class="tag">${U.esc(x)}</span>`).join("")}</div>
        </div>
        <span style="color:var(--muted)">${I("chev")}</span>
      </button>`;
    } else if (briefingLoaded) {
      brfCard = `<button class="card row-card" data-brief><div class="itile lg warm">${I("bolt")}</div><div class="grow"><span class="lbl">תדריכי בוקר</span><h2 class="t3">הארכיון</h2></div><span style="color:var(--muted)">${I("chev")}</span></button>`;
    }

    const wordsCard = words ? `
      <button class="card stack-card" data-go="me" data-sub="learn" style="text-align:start;color:var(--text);font:inherit;cursor:pointer;width:100%">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="itile">${I("lang")}</div>
            <div style="display:flex;flex-direction:column"><h2 class="t3">10 המילים של היום</h2>
              <span class="lbl">${words.done >= words.total ? "סיימת את המנה של היום" : "הבא בתור: " + U.esc(words.next || "")}</span></div>
          </div>
          <span class="num" style="font-size:20px">${words.done}<span style="color:var(--muted);font-size:15px">/${words.total}</span></span>
        </div>
        <div class="words-dots" aria-hidden="true" style="width:100%">${Array.from({ length: words.total }, (_, i) => `<i class="${i < words.done ? "on" : ""}"></i>`).join("")}</div>
      </button>` : "";

    mainEl.innerHTML = `
      <header class="home-head">
        <div><span class="lbl">${dateLabel()}</span><h1 class="t1">${greeting()}</h1></div>
        <button class="ibtn" data-go="me" data-sub="settings" aria-label="תזכורות והגדרות">${I("bell")}</button>
      </header>
      <div class="home-grid">
        <section class="hero kcal-hero" aria-label="קלוריות היום">
          <div class="kcal-row">
            ${ring(t.kcal, tg.kcal, 136)}
            <div class="macro-list">
              <div style="display:flex;align-items:baseline;gap:6px">
                <span class="num" style="font-size:34px;color:var(--accent-text)">${Math.abs(left).toLocaleString("he-IL")}</span>
                <span class="lbl">${left >= 0 ? "קק״ל נותרו" : "קק״ל מעל היעד"}</span>
              </div>
              ${macro("חלבון", t.protein, tg.protein, "")}
              ${macro("פחמימות", t.carbs, tg.carbs, "carb")}
              ${macro("שומן", t.fat, tg.fat, "fat")}
            </div>
          </div>
          <button class="btn btn-p" data-go="food">${I("plus")}הוסף ארוחה</button>
        </section>

        <div class="two-col">
          <section class="card mini-card" aria-label="מים">
            <span class="lbl">${I("drop", 18, "water-ico")}מים</span>
            <span class="numline"><span class="num" style="font-size:28px">${(water / 1000).toFixed(2)}</span><span class="lbl">/ ${(waterGoal / 1000).toLocaleString("he-IL")} ל׳</span></span>
            <div class="bar"><i class="water" style="width:${Math.min(100, Math.round((water / waterGoal) * 100))}%"></i></div>
            <button class="btn btn-s" id="home-water" style="min-height:44px;font-size:15px" aria-label="הוסף 250 מ״ל מים">+250 מ״ל</button>
          </section>
          <button class="card mini-card" data-go="food" data-sub="weight">
            <span class="lbl">${I("scale", 18, "accent")}משקל</span>
            <div>${weightCard}</div>
          </button>
        </div>

        ${wkCard}
        ${brfCard}
        ${wordsCard}
      </div>`;

    mainEl.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => App.nav.go(b.dataset.go, b.dataset.sub))
    );
    const brf = mainEl.querySelector("[data-brief]");
    if (brf) brf.addEventListener("click", () => open("briefing", latestBriefing ? { item: latestBriefing } : null));
    mainEl.querySelector("#home-water").addEventListener("click", () => {
      const all = S.get("food.water", {});
      all[today] = (all[today] || 0) + 250;
      S.set("food.water", all);
      render();
    });
  }

  return { mount, show, open, home, isHome };
})();
