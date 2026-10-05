"use strict";
/* הגדרות מנוי ופרטי עסק. מלא את הערכים הריקים לפני שמפעילים תשלום.
   billing.enforce=false — אף אחד לא ננעל (ברירת המחדל). משנים ל-true כשהכל מוכן. */
window.APP_CONFIG = {
  billing: {
    enforce: false,
    priceNis: 50,
    trialDays: 14,          // נקבע גם ב-supabase/subscriptions.sql
    offlineGraceDays: 7,    // כמה ימים אחרי הפקיעה עובדים בלי אינטרנט
    bitUrl: "",             // קישור תשלום בביט
    payboxUrl: "",          // קישור תשלום בפייבוקס
    whatsapp: "972545445895",           // מספר בפורמט בינלאומי בלי +, למשל 972501234567
  },
  business: {
    name: "לירן בן ארצי",
    id: "",                 // מספר עוסק / ת"ז
    phone: "054-544-5895",
    email: "halbonintz@gmail.com",
    city: "",
  },
};
