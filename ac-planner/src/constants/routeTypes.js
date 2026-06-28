// שלושת סוגי המסלולים, כל אחד בצבע משלו.
export const ROUTE_TYPES = [
  { id: 'gas', label: 'צנרת גז', color: '#1f6feb' }, // 🟦 נחושת/גז — כחול
  { id: 'drain', label: 'ניקוז', color: '#2da44e' }, // 🟩 ניקוז — ירוק
  { id: 'elec', label: 'כבל חשמל', color: '#fb8500' }, // 🟧 חשמל — כתום
];

export const ROUTE_TYPE_BY_ID = Object.fromEntries(
  ROUTE_TYPES.map((t) => [t.id, t])
);

export function routeColor(typeId) {
  return ROUTE_TYPE_BY_ID[typeId]?.color || '#888';
}

export function routeLabel(typeId) {
  return ROUTE_TYPE_BY_ID[typeId]?.label || typeId;
}
