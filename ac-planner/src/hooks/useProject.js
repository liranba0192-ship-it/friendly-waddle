import { useState, useEffect } from 'react';
import { getProject, getImageBlob } from '../db/projectRepo.js';

// טוען פרויקט יחיד + ה-objectURL של תמונת הרקע (מ-Dexie, ואם צריך מהענן).
// משחרר את ה-objectURL בעת unmount כדי למנוע דליפות זיכרון.
export function useProject(projectId) {
  const [project, setProject] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let url = null;
    setLoading(true);
    (async () => {
      const p = await getProject(projectId);
      if (!active) return;
      setProject(p);
      if (p) {
        const blob = await getImageBlob(p);
        if (!active) return;
        if (blob) {
          url = URL.createObjectURL(blob);
          setImageUrl(url);
        } else {
          setImageUrl(null);
        }
      }
      setLoading(false);
    })();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [projectId]);

  return { project, imageUrl, setImageUrl, loading, setProject };
}
