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
    whatsapp: "",           // מספר בפורמט בינלאומי בלי +, למשל 972501234567
  },
  business: {
    name: "",               // שם העסק או שם מלא
    id: "",                 // מספר עוסק / ת"ז
    phone: "",
    email: "",
    city: "",
  },
};
