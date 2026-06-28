// מזהה ייחודי. crypto.randomUUID זמין בכל הדפדפנים המודרניים וב-Node 19+.
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback פשוט (לא קריפטוגרפי) למקרה נדיר
  return 'id-' + Math.abs(Date.now() ^ (Math.random() * 1e9)).toString(36);
}
