# הפעלת מנויים — צעדים חד-פעמיים

1. **Supabase → SQL Editor → New query**: הדבק את `subscriptions.sql` ולחץ Run.
   - לפני כן שנה בסעיף 4 את התאריך `2027-01-01` — עד מתי החברים הקיימים נשארים עם גישה חינם.
2. **הוסף את עצמך כמנהל** (אחרי שנרשמת באפליקציה). באותו SQL Editor:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'המייל-שלך';
   ```
   (אם נרשמת עם טלפון, המייל הוא `0501234567@halbonintz.app`.)
3. פתח `…/app/admin.html` והתחבר — תראה את כל החברים.
4. **קישורי תשלום:** מלא `bitUrl` / `payboxUrl` ב-`app/js/config.js`. (הוואטסאפ והפרטים כבר מלאים.)
5. **כשמוכנים להתחיל לגבות:**
   - ב-`app/js/config.js` שנה `enforce: true`.
   - ב-`subscriptions.sql` הסר את ההערות מסעיף 6 והרץ שוב (אכיפה בענן).

עד שתעשה את שלב 5 אף אחד לא ננעל.
