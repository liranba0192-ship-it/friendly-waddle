// מסד נתונים מקומי (IndexedDB) דרך Dexie — משמש כ-cache אופליין-פירסט.
import Dexie from 'dexie';

export const db = new Dexie('ac-planner');

db.version(1).stores({
  // projects: שורה לכל פרויקט. הנקודות (routes) נשמרות כ-JSON בתוך השורה.
  // אינדקסים על client_name ו-updated_at למיון/חיפוש.
  projects: 'id, user_id, client_name, updated_at',
  // images: ה-blob של תמונת התוכנית, בטבלה נפרדת כדי שרשימת הפרויקטים תישאר קלה.
  images: 'projectId',
  // meta: דגלי סנכרון פנימיים (אילו פרויקטים ממתינים ל-push וכו').
  meta: 'key',
});

export default db;
