// קנה מידה: המרה בין פיקסלים (image-space) למטרים אמיתיים.
import { distance, polylineLengthPx } from './geometry.js';

// מחשב פיקסלים-למטר משתי נקודות כיול והמרחק האמיתי ביניהן (במטרים).
// מחזיר null אם הקלט לא תקין (אותה נקודה / מטרים <= 0).
export function computePixelsPerMeter(a, b, meters) {
  const m = Number(meters);
  if (!a || !b || !Number.isFinite(m) || m <= 0) return null;
  const px = distance(a, b);
  if (px <= 0) return null;
  return px / m;
}

// המרת אורך בפיקסלים למטרים. ללא כיול (null) — מחזיר null.
export function pxToMeters(px, pixelsPerMeter) {
  if (!pixelsPerMeter || pixelsPerMeter <= 0) return null;
  return px / pixelsPerMeter;
}

// אורך מסלול במטרים (או null אם אין כיול).
export function routeLengthMeters(points, pixelsPerMeter) {
  return pxToMeters(polylineLengthPx(points), pixelsPerMeter);
}

// פורמט תצוגה למטרים בעברית, למשל "4.30 מ׳". מקבל null → "—".
export function formatMeters(meters) {
  if (meters == null || !Number.isFinite(meters)) return '—';
  return `${meters.toFixed(2)} מ׳`;
}
