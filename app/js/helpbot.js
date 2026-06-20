"use strict";
window.App = window.App || {};

/* בוט עזרה מובנה — עונה על שאלות לגבי השימוש באפליקציה (ללא שרת/AI, עובד אופליין). */
App.helpbot = (function () {
  let overlay, msgsEl, inputEl, opened = false;

  // בסיס ידע: לכל ערך מילות-מפתח, כותרת ותשובה.
  const KB = [
    { k: ["אוכל", "מאכל", "להוסיף אוכל", "יומן", "תזונה", "לאכול", "קלוריות להוסיף"], t: "הוספת מאכל",
      a: "בטאב <b>תזונה 🥗</b>: חפש מאכל בתיבת החיפוש (או לחץ 📷 לסריקת ברקוד), בחר אותו, קבע כמות (גרם/יחידה) ולחץ «הוסף ליומן». אפשר גם להוסיף מאכל משלך בכפתור «הוסף מאכל משלי»." },
    { k: ["ברקוד", "סריקה", "סורק", "מצלמה", "מוצר"], t: "סריקת ברקוד",
      a: "בטאב <b>תזונה</b> לחץ <b>📷 סרוק</b>, כוון את הברקוד של המוצר למסגרת — האפליקציה מושכת אוטומטית את הערכים מ-Open Food Facts. בפעם הראשונה אשר הרשאת מצלמה ב-Safari." },
    { k: ["יעד", "יעדים", "מחשבון", "כמה קלוריות", "לרדת", "לעלות", "קצב", "tdee"], t: "יעדי קלוריות",
      a: "המחשבון נמצא בטאב <b>שקילה ⚖️</b>: הזן גובה/גיל/מין/פעילות וכמה ק\"ג לרדת/לעלות בשבוע, לחץ «חשב יעד» ואז «החל». היעדים (קלוריות+חלבון+פחמימות+שומן) יופיעו בטאב תזונה." },
    { k: ["מים", "שתייה", "לשתות", "water"], t: "מעקב מים",
      a: "בטאב <b>תזונה</b> יש כרטיס 💧 מים — לחץ +250 / −250 כדי לעדכן כמה שתית מתוך היעד היומי." },
    { k: ["אימון", "סט", "סטים", "לתעד", "משקל", "חזרות", "תרגיל"], t: "תיעוד אימון",
      a: "בטאב <b>אימון 💪</b> בחר תרגיל (מחולק לפי קבוצת שריר), הזן משקל×חזרות לכל סט ולחץ «שמור אימון». תראה גם את <b>האימון הקודם</b> שלך כדי לדעת מה לשבור." },
    { k: ["חלוקה", "פוש", "פול", "push", "pull", "legs", "ספליט", "split", "ברו"], t: "חלוקות אימון",
      a: "בטאב אימון יש צ'יפים לבחירת חלוקה ליום: הכל / דחיפה (Push) / משיכה (Pull) / רגליים / ידיים / פלג עליון / תחתון / גוף מלא / ברו ספליט. הבחירה מסננת את קבוצות השריר המתאימות." },
    { k: ["מנוחה", "יום מנוחה", "הליכה", "התאוששות", "rest"], t: "ימי מנוחה",
      a: "בטאב אימון לחץ «🛌 סמן כיום מנוחה». ביום מנוחה תקבל המלצה ל-30 דק' הליכה קלה, ותוכל לסמן שביצעת." },
    { k: ["מטרה", "חיטוב", "מסה", "ניטרלי", "עצימות", "כמה חזרות"], t: "מטרת אימון (עצימות)",
      a: "בראש טאב אימון בחר מטרה: 🔥 חיטוב (12–15 חזרות, מנוחה קצרה), 💪 מסה (8–12, מנוחה ארוכה), ⚖️ ניטרלי. זה קובע את יעד החזרות והצעת ההתקדמות." },
    { k: ["שקילה", "משקל", "גרף", "bmi", "תובנות", "מגמה"], t: "שקילה ומעקב",
      a: "בטאב <b>שקילה ⚖️</b> הזן משקל ולחץ «שמור» (אפשר כמה ביום). תראה גרף התקדמות, ממוצע שבועי, מגמה, BMI, נותרו ליעד וצפי הגעה ליעד." },
    { k: ["בוקר", "תדריך", "ידע", "לימוד", "שגרה", "routine", "כל בוקר"], t: "תדריך הבוקר",
      a: "טאב <b>בוקר 🌅</b> מציג תדריך ידע יומי. כדי שייווצר חדש כל בוקר אוטומטית צריך <b>שגרה (Routine)</b> פעילה ב-claude.ai/code/routines, מחוברת ל-repo friendly-waddle." },
    { k: ["גיבוי", "שחזור", "לשמור", "נתונים", "אבד", "backup"], t: "גיבוי ושחזור",
      a: "הנתונים נשמרים במכשיר בלבד. בהגדרות ⚙️ (גלגל למעלה) → «ייצוא גיבוי» שומר קובץ, ו«שחזור מקובץ» מחזיר אותו. מומלץ לגבות מדי פעם." },
    { k: ["ערכה", "צבע", "כהה", "בהיר", "theme", "עיצוב"], t: "ערכת נושא",
      a: "בהגדרות ⚙️ אפשר לבחור מצב בהיר / כהה / אוטומטי." },
    { k: ["עדכון", "מתעדכן", "גרסה", "לרענן", "לא רואה"], t: "עדכונים",
      a: "האפליקציה מתעדכנת אוטומטית. אם לא רואים שינוי — סגור ופתח אותה מחדש פעם-פעמיים (היא מנקה מטמון ישן)." },
    { k: ["מי אתה", "בוט", "עזרה", "מה זה", "חלבונינץ"], t: "על האפליקציה",
      a: "אני בוט העזרה של <b>חלבונינץ</b> 🥑💪 — אפליקציית כושר ותזונה. שאל אותי איך לעשות משהו, או בחר נושא מהכפתורים." },
  ];

  const QUICK = ["הוספת מאכל", "סריקת ברקוד", "יעדי קלוריות", "תיעוד אימון", "ימי מנוחה", "תדריך הבוקר", "גיבוי"];

  function build() {
    if (overlay) return; // הגנה מפני אתחול כפול
    overlay = document.createElement("div");
    overlay.className = "help-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="help-panel">
        <div class="help-head">
          <button id="help-close" class="scan-close">✕ סגור</button>
          <span class="help-title">💬 עוזר חלבונינץ</span>
          <span style="width:60px"></span>
        </div>
        <div id="help-msgs" class="help-msgs"></div>
        <div class="help-input-row">
          <input id="help-input" type="text" placeholder="שאל אותי משהו…" autocomplete="off" />
          <button id="help-send" class="btn-primary">שלח</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const fab = document.createElement("button");
    fab.id = "help-fab"; fab.className = "help-fab"; fab.textContent = "💬";
    fab.setAttribute("aria-label", "עזרה");
    document.body.appendChild(fab);

    msgsEl = overlay.querySelector("#help-msgs");
    inputEl = overlay.querySelector("#help-input");
    fab.addEventListener("click", open);
    overlay.querySelector("#help-close").addEventListener("click", close);
    overlay.querySelector("#help-send").addEventListener("click", send);
    inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  }

  function open() {
    overlay.hidden = false;
    if (!opened) {
      opened = true;
      addBot("היי! 👋 אני עוזר <b>חלבונינץ</b>. במה אפשר לעזור? אפשר לכתוב שאלה או לבחור נושא:");
      addChips();
    }
    setTimeout(() => inputEl.focus(), 100);
  }
  function close() { overlay.hidden = true; }

  function addMsg(html, who) {
    const d = document.createElement("div");
    d.className = "help-msg " + who;
    d.innerHTML = html;
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  const addBot = (h) => addMsg(h, "bot");
  const addUser = (h) => addMsg(App.util.esc(h), "user");

  function addChips() {
    const wrap = document.createElement("div");
    wrap.className = "help-chips";
    wrap.innerHTML = QUICK.map((q) => `<button class="help-chip">${q}</button>`).join("");
    wrap.querySelectorAll(".help-chip").forEach((b) =>
      b.addEventListener("click", () => { ask(b.textContent); })
    );
    msgsEl.appendChild(wrap);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function answerFor(text) {
    const q = text.toLowerCase();
    let best = null, bestScore = 0;
    for (const e of KB) {
      let score = 0;
      for (const kw of e.k) if (q.includes(kw.toLowerCase())) score += kw.length > 3 ? 2 : 1;
      if (e.t && q.includes(e.t.toLowerCase())) score += 3;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return bestScore > 0 ? best : null;
  }

  function ask(text) {
    addUser(text);
    const e = answerFor(text);
    setTimeout(() => {
      if (e) addBot(`<b>${e.t}</b><br>${e.a}`);
      else {
        addBot("לא בטוח שהבנתי 🤔 נסה לבחור אחד מהנושאים:");
        addChips();
      }
    }, 180);
  }

  function send() {
    const v = inputEl.value.trim();
    if (!v) return;
    inputEl.value = "";
    ask(v);
  }

  document.addEventListener("DOMContentLoaded", build);
  return { open };
})();
