"use strict";
window.App = window.App || {};

App.more = (function () {
  const U = App.util, S = App.store;
  let root;

  function reminderTime() { return S.get("reminder.time", "07:30"); }
  function saveReminderTime(v) { S.set("reminder.time", v); }
  function weighTime() { return S.get("reminder.weighTime", "07:00"); }
  function weighDay() { return S.get("reminder.weighDay", 0); } // 0=ראשון

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
        <h3>💾 גיבוי ושחזור</h3>
        <p class="section-hint">המידע נשמר במכשיר בלבד. מומלץ לגבות מדי פעם לקובץ.</p>
        <button id="bk-export" class="btn-secondary full">⬇️ ייצוא גיבוי לקובץ</button>
        <label class="btn-secondary full file-label">⬆️ שחזור מקובץ
          <input id="bk-import" type="file" accept="application/json" hidden />
        </label>
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

      <div class="card-block">
        <h3>ℹ️ אודות</h3>
        <p class="section-hint">חלבונינץ — תדריך יומי, מעקב אימונים, יומן תזונה ושקילה. כל הנתונים פרטיים ונשמרים במכשיר שלך.</p>
        <p class="section-hint">גרסה <b>8</b> · בוט עזרה · תזכורות · גרף שקילה צבעוני · חלוקות אימון 🌿</p>
      </div>
    `;

    root.querySelector("#rm-make").addEventListener("click", makeReminder);
    root.querySelector("#wm-make").addEventListener("click", makeWeighReminder);
    root.querySelector("#bk-export").addEventListener("click", () =>
      U.download(`backup-${U.todayISO()}.json`, JSON.stringify(S.exportAll(), null, 2), "application/json")
    );
    root.querySelector("#bk-import").addEventListener("change", importBackup);

    const seg = root.querySelector("#theme-seg");
    const cur = localStorage.getItem("mb.theme") || "light";
    seg.querySelectorAll("button").forEach((b) => {
      if (b.dataset.theme === cur) b.classList.add("active");
      b.addEventListener("click", () => { App.setTheme(b.dataset.theme); render(); });
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

  function importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        S.importAll(JSON.parse(reader.result));
        alert("השחזור הושלם! ✅");
        render();
      } catch {
        alert("קובץ גיבוי לא תקין 😕");
      }
    };
    reader.readAsText(file);
  }

  return { mount, show };
})();
