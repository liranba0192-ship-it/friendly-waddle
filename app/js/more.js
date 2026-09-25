"use strict";
window.App = window.App || {};

App.more = (function () {
  const U = App.util, S = App.store;
  let root;

  function reminderTime() { return S.get("reminder.time", "07:30"); }
  function saveReminderTime(v) { S.set("reminder.time", v); }
  function weighTime() { return S.get("reminder.weighTime", "07:00"); }
  function weighDay() { return S.get("reminder.weighDay", 0); }
  function foodTime() { return S.get("reminder.foodTime", "19:30"); }

  const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  function buildICS({ summary, desc, time, freq, byday }) {
    const [hh, mm] = time.split(":");
    const now = new Date(); const p2 = (x) => String(x).padStart(2, "0");
    const dt = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}T${p2(hh)}${p2(mm)}00`;
    const stamp = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`;
    const rrule = freq === "WEEKLY" ? `RRULE:FREQ=WEEKLY;BYDAY=${byday}` : "RRULE:FREQ=DAILY";
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//halbonintz//HE", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT", `UID:halbonintz-${U.uid()}@local`, `DTSTAMP:${stamp}`, `DTSTART:${dt}`,
      rrule, `SUMMARY:${summary}`, `DESCRIPTION:${desc}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT0M", "DESCRIPTION:תזכורת", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
  }

  function mount(el) { root = el; render(); }
  function show() { render(); }

  function render() {
    const I = App.icon;
    const theme = localStorage.getItem("mb.theme") || "dark";
    const last = S.get("backup.last", null);
    const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    const row = (id, icon, title, sub, timeId, time, extra) => `
      <div class="set-row">
        <div class="itile">${I(icon)}</div>
        <span class="grow"><span style="font-weight:600">${title}</span><span class="lbl">${sub}</span></span>
        ${extra || ""}
        <input type="time" id="${timeId}" value="${time}" aria-label="שעת ${title}" class="time-in">
        <button class="ibtn" id="${id}" aria-label="הוסף תזכורת ${title} ליומן">${I("plus", 20)}</button>
      </div>`;
    root.innerHTML = `
      <div class="stack">
        <h2 class="sec-title">תזכורות</h2>
        <section class="card list-group">
          ${row("rm-make", "book", "לימוד", "כל יום", "rm-time", reminderTime())}
          ${row("wm-make", "scale", "שקילה", "פעם בשבוע", "wm-time", weighTime(),
            `<select id="wm-day" aria-label="יום השקילה" class="day-in">${days.map((d, i) => `<option value="${i}" ${i === weighDay() ? "selected" : ""}>${d}</option>`).join("")}</select>`)}
          ${row("fm-make", "fork", "יומן אוכל", "כל יום", "fm-time", foodTime())}
        </section>
        <p class="lbl" id="rm-hint" style="margin:0 4px">לחיצה על + מורידה קובץ תזכורת. פותחים אותו באייפון והוא נכנס ללוח השנה כתזכורת חוזרת — עובד גם כשהאפליקציה סגורה.</p>
        <span id="wm-hint" hidden></span><span id="fm-hint" hidden></span>

        <h2 class="sec-title">גיבוי ושחזור</h2>
        <section class="card" style="padding:16px;display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="itile" style="color:var(--green)">${I("check")}</div>
            <div style="display:flex;flex-direction:column"><span style="font-weight:600">${last ? "גיבוי אחרון · " + U.prettyDate(last.slice(0, 10)) : "עוד לא נוצר גיבוי"}</span>
              <span class="lbl">${App.sync && App.sync.email && App.sync.email() ? "הנתונים מסונכרנים לחשבון שלך. הגיבוי הוא עותק נוסף בקובץ." : "קובץ עם כל הנתונים שלך"}</span></div>
          </div>
          <div class="two-col" style="gap:8px">
            <button class="btn btn-s" id="bk-export">${I("down", 20)}גבה עכשיו</button>
            <label class="btn btn-s" for="bk-file" style="cursor:pointer">${I("up", 20)}שחזר</label>
          </div>
          <input type="file" id="bk-file" accept="application/json,.json" hidden>
        </section>

        <h2 class="sec-title">תצוגה</h2>
        <section class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px">
          <span style="font-weight:600">ערכת צבעים</span>
          <div class="seg" id="theme-seg" role="group" aria-label="ערכת צבעים">
            <button data-theme="dark" class="${theme === "dark" ? "on" : ""}" aria-pressed="${theme === "dark"}">כהה</button>
            <button data-theme="light" class="${theme === "light" ? "on" : ""}" aria-pressed="${theme === "light"}">בהיר</button>
            <button data-theme="auto" class="${theme === "auto" ? "on" : ""}" aria-pressed="${theme === "auto"}">לפי המכשיר</button>
          </div>
        </section>
        <span class="lbl" style="text-align:center;padding-top:8px">חלבונינץ · תדריך יומי, אימונים, תזונה, שקילה ולימוד</span>
      </div>`;

    root.querySelector("#rm-make").addEventListener("click", makeReminder);
    root.querySelector("#wm-make").addEventListener("click", makeWeighReminder);
    root.querySelector("#fm-make").addEventListener("click", makeFoodReminder);
    root.querySelectorAll("#theme-seg button").forEach((b) =>
      b.addEventListener("click", () => { App.setTheme(b.dataset.theme); render(); }));
    root.querySelector("#bk-export").addEventListener("click", () => {
      const data = S.exportAll();
      U.download(`halbonintz-backup-${U.todayISO()}.json`, JSON.stringify(data, null, 2), "application/json");
      S.set("backup.last", new Date().toISOString());
      render();
    });
    root.querySelector("#bk-file").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        if (!confirm("לשחזר מהגיבוי? הנתונים הנוכחיים יוחלפו בנתונים מהקובץ.")) return;
        S.importAll(obj);
        alert("השחזור הושלם. האפליקציה תיטען מחדש.");
        location.reload();
      } catch (err) { alert("הקובץ לא תקין: " + (err.message || err)); }
    });
  }

  function makeReminder() {
    const time = root.querySelector("#rm-time").value || "07:30";
    saveReminderTime(time);
    const ics = buildICS({
      summary: "🌅 לימוד הבוקר — חלבונינץ",
      desc: "זמן לקרוא את תדריך הידע היומי ולעדכן את המעקב.",
      time, freq: "DAILY",
    });
    U.download("learning-daily.ics", ics, "text/calendar");
    root.querySelector("#rm-hint").textContent = `הקובץ ירד — פתח אותו ולחץ «הוסף הכל» כדי לקבל תזכורת לימוד כל יום ב-${time}.`;
  }

  function makeFoodReminder() {
    const time = root.querySelector("#fm-time").value || "19:30";
    S.set("reminder.foodTime", time);
    const ics = buildICS({
      summary: "🍽️ היי, מה אכלת היום?",
      desc: "רגע קטן לתעד ביומן התזונה — בלי לחץ, רק כדי לשמור על התמונה 🌿",
      time, freq: "DAILY",
    });
    U.download("food-log-daily.ics", ics, "text/calendar");
    root.querySelector("#rm-hint").textContent = `הקובץ ירד — פתח אותו ולחץ «הוסף הכל» כדי לקבל תזכורת יומן אוכל כל יום ב-${time}.`;
  }

  function makeWeighReminder() {
    const time = root.querySelector("#wm-time").value || "07:00";
    const day = parseInt(root.querySelector("#wm-day").value, 10) || 0;
    S.set("reminder.weighTime", time); S.set("reminder.weighDay", day);
    const ics = buildICS({
      summary: "⚖️ שקילה שבועית — חלבונינץ",
      desc: "זמן להישקל ולעדכן את המשקל באפליקציה.",
      time, freq: "WEEKLY", byday: BYDAY[day],
    });
    U.download("weigh-weekly.ics", ics, "text/calendar");
    const dayName = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][day];
    root.querySelector("#rm-hint").textContent = `הקובץ ירד — פתח אותו ולחץ «הוסף הכל» כדי לקבל תזכורת שקילה כל יום ${dayName} ב-${time}.`;
  }

  return { mount, show };
})();
