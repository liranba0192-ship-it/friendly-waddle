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
    const em = App.sync && App.sync.email();
    root.innerHTML = `
      <div class="card-block">
        <h3>🌅 תזכורת לימוד בוקר (יומי)</h3>
        <p class="section-hint">בחר שעה והורד קובץ תזכורת. פתח אותו ב-iOS → ייווסף ללוח השנה כתזכורת חוזרת כל בוקר (אמין גם כשהאפליקציה סגורה).</p>
        <div class="add-row inline">
          <input id="rm-time" type="time" value="${reminderTime()}" />
          <button id="rm-make" class="btn-primary">צור תזכורת</button>
        </div>
        <p class="section-hint" id="rm-hint"></p>
      </div>

      <div class="card-block">
        <h3>⚖️ תזכורת שקילה (שבועי)</h3>
        <p class="section-hint">בחר יום ושעה לשקילה שבועית קבועה — מומלץ אותו יום ושעה בכל שבוע (למשל ראשון בבוקר).</p>
        <div class="grid2">
          <label class="field">יום
            <select id="wm-day">
              ${["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"].map((d,i)=>`<option value="${i}" ${i===weighDay()?"selected":""}>יום ${d}</option>`).join("")}
            </select>
          </label>
          <label class="field">שעה
            <input id="wm-time" type="time" value="${weighTime()}" />
          </label>
        </div>
        <button id="wm-make" class="btn-primary full">צור תזכורת שקילה</button>
        <p class="section-hint" id="wm-hint"></p>
      </div>

      <div class="card-block">
        <h3>🍽️ תזכורת יומן אוכל (יומי)</h3>
        <p class="section-hint">תזכורת קלילה פעם ביום לתעד מה אכלת — לא יותר מזה, בלי הצפה.</p>
        <div class="add-row inline">
          <input id="fm-time" type="time" value="${foodTime()}" />
          <button id="fm-make" class="btn-primary">צור תזכורת</button>
        </div>
        <p class="section-hint" id="fm-hint"></p>
      </div>

      <div class="card-block">
        <h3>🎨 מראה</h3>
        <p class="section-hint">העיצוב מתאים את עצמו אוטומטית למצב בהיר/כהה של האייפון. אפשר לכפות מצב:</p>
        <div class="seg" id="theme-seg">
          <button data-theme="auto">אוטומטי</button>
          <button data-theme="dark">כהה</button>
          <button data-theme="light">בהיר</button>
        </div>
      </div>

      ${em ? `<div class="card-block">
        <h3>👤 חשבון</h3>
        <p class="section-hint">מחובר כ: <b>${U.esc(em)}</b></p>
        <button id="sy-logout" class="btn-secondary full">🚪 התנתק</button>
      </div>` : ""}

      <div class="card-block">
        <h3>ℹ️ אודות</h3>
        <p class="section-hint">חלבונינץ — תדריך יומי, מעקב אימונים, יומן תזונה, שקילה ולימוד.</p>
        <p class="section-hint">גרסה <b>17</b> · טאב לימוד: אנגלית · 100 שיעורי פיננסים · 100 שיעורי AI · 🧠 ידע כללי יומי — הכל עם תזכורות חזרה · קריאת בוקר · טיימר מנוחה · התחברות · בוט עזרה 🌿</p>
      </div>
    `;

    root.querySelector("#rm-make").addEventListener("click", makeReminder);
    root.querySelector("#wm-make").addEventListener("click", makeWeighReminder);
    root.querySelector("#fm-make").addEventListener("click", makeFoodReminder);

    const seg = root.querySelector("#theme-seg");
    const cur = localStorage.getItem("mb.theme") || "light";
    seg.querySelectorAll("button").forEach((b) => {
      if (b.dataset.theme === cur) b.classList.add("active");
      b.addEventListener("click", () => { App.setTheme(b.dataset.theme); render(); });
    });

    const logoutBtn = root.querySelector("#sy-logout");
    if (logoutBtn) logoutBtn.addEventListener("click", async () => {
      if (App.sync) await App.sync.signOut().catch(() => {});
      location.reload();
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
    root.querySelector("#rm-hint").innerHTML =
      `הקובץ ירד. ב-iOS פתח אותו ולחץ «הוסף הכל» כדי לקבל תזכורת כל בוקר ב-${time}. ✅`;
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
    root.querySelector("#fm-hint").innerHTML =
      `הקובץ ירד. ב-iOS פתח אותו ולחץ «הוסף הכל» — תזכורת קלילה כל יום ב-${time}. ✅`;
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
    root.querySelector("#wm-hint").innerHTML =
      `הקובץ ירד. ב-iOS פתח אותו ולחץ «הוסף הכל» — תזכורת כל יום ${dayName} ב-${time}. ✅`;
  }

  return { mount, show };
})();
