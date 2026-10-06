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
    if (!cfg().enforce || !sub) return { ok: true, sub };
    const until = new Date(sub.paid_until).getTime();
    const grace = r.ok ? 0 : (cfg().offlineGraceDays || 7) * DAY;
    if (sub.status === "blocked") return { ok: false, reason: "blocked", sub };
    if (until + grace < Date.now()) return { ok: false, reason: sub.status === "trial" ? "trial" : "expired", sub };
    return { ok: true, sub };
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
          ${c.bitUrl ? `<a class="btn btn-p full" href="${U.esc(c.bitUrl)}" target="_blank" rel="noopener">${I("bolt", 18)} תשלום בביט</a>` : ""}
          ${c.payboxUrl ? `<a class="btn btn-s full" href="${U.esc(c.payboxUrl)}" target="_blank" rel="noopener">תשלום בפייבוקס</a>` : ""}`}
        ${wa ? `<a class="btn ${blocked || c.bitUrl || c.payboxUrl ? "btn-s" : "btn-p"} full" href="${wa}" target="_blank" rel="noopener">${I("chat", 18)} ${blocked ? "פנייה בוואטסאפ" : "כבר שילמתי — עדכון בוואטסאפ"}</a>` : ""}
        ${!c.bitUrl && !c.payboxUrl && !wa ? `<p class="auth-hint">פנה אל המנהל לתשלום.</p>` : ""}
        <p class="auth-hint">אחרי שהתשלום אושר, התחבר מחדש. הנתונים שלך שמורים.</p>
        <button id="pw-relogin" class="btn btn-s full" type="button">התחברות מחדש</button>
      </div>`;
    el.querySelector("#pw-relogin").addEventListener("click", () => location.reload());
  }

  // התראה על הרשמה חדשה לבעל העסק (FormSubmit, בלי שרת). נשלחת פעם אחת, ומנסים שוב בפתיחה הבאה אם נכשלה.
  const NOTIFY_KEY = "sync.notify";
  function queueSignupNotice(email) { if (email) S.set(NOTIFY_KEY, email); }
  async function flushSignupNotice() {
    const email = S.get(NOTIFY_KEY, null), to = cfg().notifyEmail;
    if (!email || !to) return;
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
          חשבון: email,
          הצטרף: new Date().toLocaleString("he-IL"),
          ניסיון: `${cfg().trialDays || 7} ימים`,
          "לאשר או לחסום": adminUrl,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch { S.set(NOTIFY_KEY, email); }
  }

  return { check, paywall, daysLeft, fmt, cached, cfg, queueSignupNotice, flushSignupNotice };
})();
