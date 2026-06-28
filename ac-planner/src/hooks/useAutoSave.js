import { useEffect, useRef } from 'react';
import { updateProject } from '../db/projectRepo.js';
import { useDebouncedCallback } from './useDebouncedCallback.js';

// שמירה אוטומטית של מצב המסמך (routes + pixels_per_meter) ל-Dexie + ענן.
// debounce ~600ms; flush ב-visibilitychange/beforeunload כדי שלא לאבד שינוי אחרון.
// onSaved נקרא אחרי שמירה (לאינדיקטור "נשמר").
export function useAutoSave(projectId, doc, onSaved) {
  const [save, flush] = useDebouncedCallback(async (id, payload) => {
    await updateProject(id, payload);
    onSaved?.();
  }, 600);

  // לא שומרים בטעינה הראשונה (אין שינוי אמיתי) — מדלגים על ה-mount.
  const first = useRef(true);

  useEffect(() => {
    if (!projectId || !doc) return;
    if (first.current) {
      first.current = false;
      return;
    }
    save(projectId, { routes: doc.routes, pixels_per_meter: doc.pixels_per_meter });
  }, [projectId, doc, save]);

  // flush בעת הסתרה/סגירה של הטאב
  useEffect(() => {
    const onHide = () => flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onHide);
      flush();
    };
  }, [flush]);

  return flush;
}
