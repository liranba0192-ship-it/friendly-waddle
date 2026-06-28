import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';

// רשימת פרויקטים חיה (מתעדכנת אוטומטית) של המשתמש, עם חיפוש לפי שם לקוח/כתובת.
export function useProjects(userId, query = '') {
  return useLiveQuery(async () => {
    if (!userId) return [];
    let rows = await db.projects.where('user_id').equals(userId).toArray();
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          (p.client_name || '').toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q)
      );
    }
    return rows.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }, [userId, query]);
}
