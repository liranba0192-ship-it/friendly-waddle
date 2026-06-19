"use strict";
window.App = window.App || {};

App.more = (function () {
  const U = App.util, S = App.store;
  let root;

  function reminderTime() { return S.get("reminder.time", "07:30"); }
  function saveReminderTime(v) { S.set("reminder.time", v); }

  function mount(el) { root = el; render(); }
  function show() { render(); }

  function render() {
    root.innerHTML = `
      <div class="card-block">
        <h3>🔔 תזכורת יומית</h3>
        <p class="section-hint">בחר שעה והורד קובץ תזכורת. פתח אותו ב-iOS → ייווסף ללוח השנה כתזכורת חוזרת כל יום (אמין גם כשהאפליקציה סגורה).</p>
        <div class="add-row inline">
          <input id="rm-time" type="time" value="${reminderTime()}" />
          <button id="rm-make" class="btn-primary">צור תזכורת</button>
        </div>
        <p class="section-hint" id="rm-hint"></p>
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
        <p class="section-hint">הרחבת ידע בוקר — תדריך יומי, מעקב אימונים, יומן אוכל ושקילה. כל הנתונים פרטיים ונשמרים במכשיר שלך.</p>
        <p class="section-hint">גרסה <b>6</b> · לוגו חדש · דף מאכל עם טבעת מאקרו · הדגמות תרגיל 🌿</p>
      </div>
    `;

    root.querySelector("#rm-make").addEventListener("click", makeReminder);
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
    const [hh, mm] = time.split(":");
    const now = new Date();
    const p2 = (x) => String(x).padStart(2, "0");
    const dt = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}T${p2(hh)}${p2(mm)}00`;
    const stamp = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`;
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//morning-briefing//HE", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:morning-briefing-${U.uid()}@local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dt}`,
      "RRULE:FREQ=DAILY",
      "SUMMARY:🌅 תדריך בוקר + אימון/אוכל/שקילה",
      "DESCRIPTION:זמן לקרוא את התדריך היומי ולעדכן את המעקב.",
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT0M", "DESCRIPTION:תזכורת יומית", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    U.download("daily-reminder.ics", ics, "text/calendar");
    root.querySelector("#rm-hint").innerHTML =
      `הקובץ ירד. ב-iOS פתח אותו (Safari → «הורדות» או קובץ) ולחץ «הוסף הכל» כדי לקבל תזכורת חוזרת ב-${time} כל יום. ✅`;
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
