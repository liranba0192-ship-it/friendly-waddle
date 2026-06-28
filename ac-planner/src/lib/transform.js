// המרות בין מרחב התמונה (image-space, נשמר) למרחב המסך (screen-space, מרונדר).
// viewport = { scale, x, y }:  screen = image * scale + offset
// הערה: בפועל אנו מיישמים את הטרנספורם על ה-Stage של Konva, ולכן ברוב המקרים
// נשתמש ב-stage.getRelativePointer(). הפונקציות כאן משמשות לחישובי זום-לכיוון-מצביע
// וכל מקום שצריך המרה ידנית מפורשת.

export function imageToScreen(pt, vp) {
  return { x: pt.x * vp.scale + vp.x, y: pt.y * vp.scale + vp.y };
}

export function screenToImage(pt, vp) {
  return { x: (pt.x - vp.x) / vp.scale, y: (pt.y - vp.y) / vp.scale };
}

// מחשב viewport חדש כך שזום מתבצע לכיוון נקודת מסך נתונה (pointer):
// הנקודה ב-image-space שמתחת ל-pointer נשארת מתחת ל-pointer אחרי הזום.
export function zoomAtPoint(vp, pointerScreen, newScale, clamp = { min: 0.1, max: 12 }) {
  const scale = Math.max(clamp.min, Math.min(clamp.max, newScale));
  // נקודת התמונה שמתחת למצביע לפני הזום
  const imgPt = screenToImage(pointerScreen, vp);
  // אחרי שינוי ה-scale, נחשב offset שמחזיר את imgPt בדיוק מתחת למצביע
  return {
    scale,
    x: pointerScreen.x - imgPt.x * scale,
    y: pointerScreen.y - imgPt.y * scale,
  };
}

// viewport התחלתי שמרכז ומתאים תמונה (width×height) לתוך מיכל (cw×ch) עם שוליים.
export function fitImage(imgW, imgH, cw, ch, padding = 24) {
  if (!imgW || !imgH || !cw || !ch) return { scale: 1, x: 0, y: 0 };
  const scale = Math.min((cw - padding * 2) / imgW, (ch - padding * 2) / imgH);
  const s = scale > 0 ? scale : 1;
  return {
    scale: s,
    x: (cw - imgW * s) / 2,
    y: (ch - imgH * s) / 2,
  };
}
