# 📱 אפליקציית "הרחבת ידע בוקר" (PWA)

אפליקציית web קלה (PWA) שמציגה את התדריכים היומיים מתוך `../briefings/`.
אפשר "להוסיף למסך הבית" באייפון והיא תתנהג כמו אפליקציה מקורית — אייקון,
מסך מלא, ועבודה אופליין.

## מבנה
| קובץ | תפקיד |
|------|-------|
| `index.html` | מבנה העמוד וה-meta של ה-PWA (כולל תמיכת iOS) |
| `styles.css` | עיצוב כהה, RTL, רספונסיבי |
| `app.js` | טעינת `briefings/index.json`, רשימה, ורינדור תדריך |
| `manifest.webmanifest` | הגדרות ה-PWA (שם, אייקונים, צבעים) |
| `sw.js` | Service Worker — מטמון לעבודה אופליין |
| `vendor/marked.min.js` | המרת Markdown ל-HTML (מקומי, ללא CDN) |
| `icons/` | אייקוני האפליקציה (נוצרו ע"י `tools/gen-icons.mjs`) |

## הרצה מקומית (לבדיקה)
מהשורש של ה-repo:
```bash
python3 -m http.server 8000
# ואז דפדפו אל: http://localhost:8000/app/
```
חשוב להריץ מהשורש (לא מתוך `app/`), כי האפליקציה קוראת את `../briefings/`.

## פריסה
ראו `../SETUP.md` → "חלק ג' — אפליקציית האייפון" (GitHub Pages + הוספה למסך הבית).

## חידוש אייקונים
```bash
node app/tools/gen-icons.mjs
```
