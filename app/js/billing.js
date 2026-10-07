"use strict";
window.App = window.App || {};

/* מנוי: בודק אם למשתמש יש גישה, ומציג מסך נעילה כשהמנוי פג או חסום.
   ההגדרות ב-js/config.js. כש-billing.enforce=false אף אחד לא ננעל, רק מציגים את המצב. */
App.billing = (function () {
  const S = App.store, U = App.util, I = App.icon;
  const DAY = 864e5;
  const cfg = () => (window.APP_CONFIG && window.APP_CONFIG.billing) || {};

  const cached = () => S.get("sync.sub", null);
  const fmt = (iso) => { const d = new Date(iso); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear(); };

  // {ok, reason, sub}. reason: trial | expired | blocked
  async function check() {
    const r = await App.sync.subscription();
    if (r.ok && r.row) S.set("sync.sub", r.row);
    const sub = r.ok ? r.row : cached();
    if (!cfg().enforce || !sub) return { ok: true, sub, fresh: r.ok };
    const until = new Date(sub.paid_until).getTime();
    const grace = r.ok ? 0 : (cfg().offlineGraceDays || 7) * DAY;
    if (sub.status === "blocked") return { ok: false, reason: "blocked", sub };
    if (until + grace < Date.now()) return { ok: false, reason: sub.status === "trial" ? "trial" : "expired", sub };
    return { ok: true, sub, fresh: r.ok };
  }

  // ימים שנשארו (שלם, יכול להיות שלילי); null אם אין נתון
  function daysLeft(sub) {
    sub = sub || cached();
    return sub ? Math.ceil((new Date(sub.paid_until).getTime() - Date.now()) / DAY) : null;
  }

  // מסך תשלום. המשתמש כבר מנותק, ולכן אין "בדיקה מחדש" אלא התחברות מחדש אחרי תשלום ואישור.
  function paywall(el, acc) {
    const c = cfg(), email = acc.email || "";
    const blocked = acc.reason === "blocked";
    const title = blocked ? "החשבון הושהה" : acc.reason === "trial" ? "הניסיון הסתיים" : "המנוי הסתיים";
    const sub = blocked ? "פנה אל המנהל כדי להחזיר את הגישה." : `כדי להמשיך להשתמש באפליקציה צריך לשלם ${c.priceNis || 50} ש״ח לשנה.`;
    const wa = c.whatsapp
      ? `https://wa.me/${encodeURIComponent(c.whatsapp)}?text=${encodeURIComponent((blocked ? "היי, החשבון שלי בחלבונינץ הושהה. החשבון: " : "היי, שילמתי על המנוי לחלבונינץ. החשבון: ") + email)}`
      : "";
    el.innerHTML = `
      <div class="pay-box" role="alert">
        <h2 class="t2">${title}</h2>
        <p class="auth-hint">${sub}</p>
        ${blocked ? "" : `<p class="auth-hint">בהערת התשלום כתוב את החשבון שלך:<br><b class="pay-ref">${U.esc(email)}</b></p>
          ${c.bitUrl ? `<a class="btn btn-p full" href="${U.esc(c.bitUrl)}" target="_blank" rel="noopener">${I("bolt", 18)} תשלום בביט</a>` : ""}`}
        ${wa ? `<a class="btn ${blocked || c.bitUrl ? "btn-s" : "btn-p"} full" href="${wa}" target="_blank" rel="noopener">${I("chat", 18)} ${blocked ? "פנייה בוואטסאפ" : "כבר שילמתי — עדכון בוואטסאפ"}</a>` : ""}
        ${!c.bitUrl && !wa ? `<p class="auth-hint">פנה אל המנהל לתשלום.</p>` : ""}
        <p class="auth-hint">אחרי שהתשלום אושר, התחבר מחדש. הנתונים שלך שמורים.</p>
        <button id="pw-relogin" class="btn btn-s full" type="button">התחברות מחדש</button>
      </div>`;
    el.querySelector("#pw-relogin").addEventListener("click", () => location.reload());
  }

  // התראה על הרשמה חדשה לבעל העסק (FormSubmit, בלי שרת). נשלחת פעם אחת, ומנסים שוב בפתיחה הבאה אם נכשלה.
  const NOTIFY_KEY = "sync.notify";
  function queueSignupNotice(email, name) { if (email) S.set(NOTIFY_KEY, { email, name: name || "" }); }
  async function flushSignupNotice() {
    const q = S.get(NOTIFY_KEY, null), to = cfg().notifyEmail;
    if (!q || !to) return;
    const email = typeof q === "string" ? q : q.email, name = typeof q === "string" ? "" : q.name || "";
    S.set(NOTIFY_KEY, null); // לפני השליחה — כדי שלא יישלח פעמיים
    try {
      const adminUrl = new URL("admin.html", location.href).href;
      const r = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: "הרשמה חדשה לחלבונינץ — צריך לאשר",
          _captcha: "false",
          _template: "table",
          שם: name || "(לא הוזן)",
          חשבון: email,
          הצטרף: new Date().toLocaleString("he-IL"),
          ניסיון: `${cfg().trialDays || 7} ימים`,
          "לאשר או לחסום": adminUrl,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch { S.set(NOTIFY_KEY, { email, name }); }
  }

  // שם מלא: לפחות שתי מילים
  const validName = (n) => { const w = String(n || "").trim().split(/\s+/).filter((x) => x.length >= 2); return w.length >= 2 && String(n).trim().length <= 60; };

  // משתמש שעוד אין לו שם מלא (למשל חשבון ישן) נדרש להזין אותו לפני הכניסה
  function needsName(acc) {
    const sub = acc && acc.sub;
    return !!(acc && acc.fresh && sub && Object.prototype.hasOwnProperty.call(sub, "full_name") && !String(sub.full_name || "").trim());
  }
  function askName(el, onDone) {
    el.innerHTML = `
      <form class="auth-form" id="nm-form" novalidate>
        <h2 class="t2" style="text-align:center">איך קוראים לך?</h2>
        <p class="auth-hint">נא להזין שם מלא (שם פרטי ושם משפחה), כדי שאדע מי אתה.</p>
        <label class="fl"><span class="lbl">שם מלא</span>
          <span class="search-field"><input id="nm-name" autocomplete="name" maxlength="60" placeholder="למשל: ישראל ישראלי"></span></label>
        <button type="submit" class="btn btn-p full">המשך</button>
        <p class="auth-msg" id="nm-msg" role="alert"></p>
      </form>`;
    const msg = (t) => { el.querySelector("#nm-msg").textContent = t; };
    el.querySelector("#nm-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = el.querySelector("#nm-name").value.trim();
      if (!validName(name)) return msg("נא להזין שם מלא (שם פרטי ושם משפחה)");
      msg("שומר…");
      try {
        await App.sync.setFullName(name);
        const sub = cached(); if (sub) S.set("sync.sub", { ...sub, full_name: name });
        onDone();
      } catch { msg("השמירה נכשלה. בדוק חיבור ונסה שוב."); }
    });
    setTimeout(() => el.querySelector("#nm-name").focus(), 50);
  }

  return { check, paywall, validName, needsName, askName, daysLeft, fmt, cached, cfg, queueSignupNotice, flushSignupNotice };
})();
