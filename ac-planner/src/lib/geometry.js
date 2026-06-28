// פונקציות גיאומטריה טהורות — עובדות על נקודות {x, y} ב-image-space.
// אין כאן תלות ב-React/Konva. ניתן לבדיקת יחידה.

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// אורך פוליליין (סכום אורכי הקטעים) בפיקסלים.
export function polylineLengthPx(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += distance(points[i], points[i + 1]);
  }
  return total;
}

// המרחק מנקודה p לקטע ab (לצורך hit-testing / מחיקת הקו הקרוב).
export function distancePointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a); // a == b
  // היטל p על הקו, מוגבל ל-[0,1] כדי להישאר בתוך הקטע
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(p, proj);
}

// המרחק המינימלי מנקודה לפוליליין שלם.
export function distancePointToPolyline(p, points) {
  if (!points || points.length === 0) return Infinity;
  if (points.length === 1) return distance(p, points[0]);
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distancePointToSegment(p, points[i], points[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

// מוצא את המסלול הקרוב ביותר לנקודה (בתוך סף). מחזיר {route, dist} או null.
export function nearestRouteToPoint(routes, p, maxDist = Infinity) {
  let best = null;
  for (const route of routes) {
    const d = distancePointToPolyline(p, route.points);
    if (d <= maxDist && (best === null || d < best.dist)) {
      best = { route, dist: d };
    }
  }
  return best;
}

// אינדקס הקטע שהנקודה הכי קרובה אליו (להוספת נקודה באמצע קו).
// מחזיר את האינדקס i כך שהנקודה תיכנס בין points[i] ל-points[i+1].
export function nearestSegmentIndex(p, points) {
  let bestIdx = 0;
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distancePointToSegment(p, points[i], points[i + 1]);
    if (d < min) {
      min = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// נקודת אמצע בין שתי נקודות (לסמני "+" להוספת קודקוד).
export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
