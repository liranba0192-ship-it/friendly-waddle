"use strict";
/* הגדרות מנוי ופרטי עסק. מלא את הערכים הריקים לפני שמפעילים תשלום.
   billing.enforce=true — משתמש שהניסיון או המנוי שלו נגמרו מנותק ורואה מסך תשלום.
   אפשר לכבות זמנית עם false. משתמשים קיימים מסומנים "active" ב-SQL ולכן לא מושפעים. */
window.APP_CONFIG = {
  billing: {
    enforce: true,
    priceNis: 50,
    trialDays: 7,           // נקבע גם ב-supabase/trial7.sql
    offlineGraceDays: 7,    // כמה ימים אחרי הפקיעה עובדים בלי אינטרנט
    bitUrl: "https://www.bitpay.co.il/app/me/74B95769-7537-49D2-9A15-27630BEC7448", // קישור תשלום בביט
    payboxUrl: "",          // קישור תשלום בפייבוקס
    notifyEmail: "halbonintz@gmail.com", // לשם נשלחת התראה על כל הרשמה חדשה (FormSubmit)
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
