# קריאת בוקר באנגלית — תרגול לבגרות 📖🇬🇧

> זהו ה-prompt שטריגר מתוזמן (Scheduled Trigger) של Claude Code מריץ כל בוקר.
> המטרה: **קטע קריאה אחד באנגלית, כ-7 דקות**, ברמת בגרות (Band III Core), לתרגול הבנת הנקרא ואוצר מילים.
> חבר אליו טריגר יומי (ראה `SETUP.md`).

## המשימה
הפק **קטע קריאה אחד באנגלית** באורך של **~650–750 מילים** (זמן קריאה ~7 דקות), ברמת **בגרות (Band III)** — לא קל מדי ולא אקדמי מדי. הקטע צריך להיות מעניין, עכשווי, ומובן לתלמיד תיכון.

## 🔄 נושא חדש בכל בוקר (חובה — קרא קודם!)
1. קרא את `readings/index.json` ועבור על **הקריאות מ-14 הימים האחרונים**.
2. בחר **נושא חדש** שלא הופיע לאחרונה. גוון בין תחומים: טכנולוגיה, סביבה, בריאות, ספורט, היסטוריה, חברה, מדע, תרבות, כלכלה, חיי יומיום של בני נוער.
3. אפשר (לא חובה) לבסס על משהו עכשווי — WebSearch עם השנה הנוכחית לרעיון טרי.

## אוצר מילים — חובה: בדיוק המילים שהמשתמש לומד היום (לא מילים אקראיות!)

טאב הלימוד באפליקציה מציג כל יום "מנה" קבועה של 10 מילים מתוך `app/data/vocab.json`, לפי נוסחה **דטרמיניסטית** שתלויה רק בתאריך של היום — כדי שהקטע הזה יתאים בדיוק למה שהמשתמש רואה בטאב, **חובה** להריץ סקריפט Node (לא לחשב "ביד"!) שמשחזר את אותה נוסחה בדיוק, כולל שלב הערבוב:

1. הרץ את הסקריפט הבא (עדכן רק את `TODAY_ISO` לתאריך של היום, לפי `YYYY-MM-DD`), ושמור פלט ל-`words10.json` או הדפס אותו:
```js
// save as get-batch.mjs then: node get-batch.mjs
import { readFileSync } from "fs";
const TODAY_ISO = "YYYY-MM-DD"; // ⚠️ עדכן לתאריך של היום לפני ההרצה

const SHUFFLE_SEED = 42; // קבוע — זהה בדיוק לזה שב-app/js/learn.js, אסור לשנות
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffledOrder(list) {
  const arr = list.slice();
  const rnd = mulberry32(SHUFFLE_SEED);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function daysSince(epochIso, todayIso) {
  const [ey, em, ed] = epochIso.split("-").map(Number);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(ey, em - 1, ed)) / 86400000);
}

const VOCAB_EPOCH = "2026-07-16"; // קבוע — זהה בדיוק לזה שב-app/js/learn.js
const raw = JSON.parse(readFileSync("app/data/vocab.json", "utf8"));
const words = shuffledOrder(raw.words);
const totalBatches = Math.max(1, Math.ceil(words.length / 10));
const days = Math.max(0, daysSince(VOCAB_EPOCH, TODAY_ISO));
const batchIndex = days % totalBatches;
const todaysWords = words.slice(batchIndex * 10, batchIndex * 10 + 10);
console.log(JSON.stringify(todaysWords, null, 2));
```
2. **מנת המילים של היום** = פלט הסקריפט (בדיוק 10 המילים, בסדר שהוא מחזיר).

> ⚠️ שני קבועים חייבים להישאר **זהים בדיוק** לאלה שב-`app/js/learn.js`: `SHUFFLE_SEED = 42` ו-`VOCAB_EPOCH = "2026-07-16"`. אם מישהו משנה אותם בקוד האפליקציה — יש לעדכן גם כאן, אחרת השגרה תשלב מילים שלא תואמות למה שהאפליקציה מציגה.

**כתוב את הקטע כך שכל 10 המילים האלה (שדה `en`) ישולבו בו בטבעיות**, מודגשות עם **bold**. אם מילה מסוימת ממש לא מתאימה להקשר הנושא שבחרת — אפשר לשנות נטייה דקדוקית קלה (רבים/יחיד, זמן) אבל לא לדלג עליה; אם קשה מאוד לשלב את כל ה-10 בטבעיות, אפשר להוסיף עוד 1-2 משפטים קצרים בסוף הקטע רק כדי לכלול את שנשאר.

בסוף הקטע צרף **מילון (Glossary)** עם **בדיוק אותן 10 מילים** (לא פחות, לא יותר) ותרגום מהשדה `he` שלהן ב-vocab.json.

## כללי איכות
1. אנגלית תקנית, ברורה, ברמת תלמיד תיכון. משפטים לא ארוכים מדי.
2. מבנה: כותרת ראשית, 3–4 כותרות משנה קצרות, פסקאות קצרות.
3. **אל תמציא עובדות/מספרים.** אם משלבים נתון — שיהיה נכון או כללי ("studies suggest").
4. טון חיובי ומעורר מחשבה; מתאים לכל הגילאים.
5. הימנע מנושאים פוליטיים שנויים במחלוקת, אלימות או תוכן רגיש.

## פורמט הפלט (Markdown)
```
# <כותרת באנגלית>
*Reading time: ~7 minutes · Level: Bagrut (Band III)*

<פסקת פתיחה>

## <כותרת משנה>
<פסקה עם מילים מודגשות ב-**bold**>

## <כותרת משנה>
...

---

## 📖 Glossary
- **word** — תרגום לעברית
- ... (בדיוק 10 מילים — מנת היום מ-vocab.json)

## ❓ Comprehension Questions
1. <שאלת הבנה באנגלית>
2. ...
3. ...
4. ...
```

## 💾 שמירה לאפליקציה (חובה — בסוף ההרצה)
1. שמור את הקטע כקובץ Markdown בנתיב `readings/<YYYY-MM-DD>.md` (לפי **התאריך של היום**).
2. עדכן את `readings/index.json`: הוסף **בראש** מערך `readings` רשומה חדשה:
   `{ "date": "<YYYY-MM-DD>", "day": "<אות היום בעברית>", "title": "<הכותרת באנגלית>", "file": "<YYYY-MM-DD>.md" }`
   - שמור את כל הרשומות הקיימות. אם כבר קיימת רשומה לאותו תאריך — החלף אותה (אל תכפיל).
   - ודא שה-JSON תקין.
3. בצע **commit ו-push** של שני הקבצים. הודעת commit: `Add daily reading <YYYY-MM-DD>`.
4. ⚠️ **חובה — הסביבה שלך עובדת על branch נפרד, לא על `main`.** מיד אחרי ה-push, צור Pull Request אל `main` באמצעות `mcp__github__create_pull_request` ומזג אותו מיד עם `mcp__github__merge_pull_request` (`merge_method: "squash"`), **באותה הרצה**. אם יש merge conflicts: `git fetch origin main && git merge -X ours origin/main --no-edit && git push`, ואז מזג שוב. ודא שהתגובה מכילה `"merged": true` לפני שאתה מסיים — בלי זה הקריאה לא תגיע לאפליקציה.

> כך כל בוקר נוספת קריאה חדשה, והאפליקציה (טאב לימוד → אנגלית) מציגה אותה ככרטיס "קריאת הבוקר".
