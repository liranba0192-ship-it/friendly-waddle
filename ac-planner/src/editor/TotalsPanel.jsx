import { ROUTE_TYPES } from '../constants/routeTypes.js';
import { polylineLengthPx } from '../lib/geometry.js';
import { pxToMeters, formatMeters } from '../lib/scale.js';

// סיכום אורכים חי לכל סוג מסלול.
export default function TotalsPanel({ routes, pixelsPerMeter }) {
  const totals = {};
  for (const t of ROUTE_TYPES) totals[t.id] = 0;
  for (const route of routes) {
    totals[route.type] = (totals[route.type] || 0) + polylineLengthPx(route.points);
  }

  return (
    <div className="card totals">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>סיכום אורכים</div>
      {ROUTE_TYPES.map((t) => {
        const meters = pxToMeters(totals[t.id], pixelsPerMeter);
        return (
          <div className="line" key={t.id}>
            <span className="name">
              <span className="dot" style={{ background: t.color }} />
              {t.label}
            </span>
            <span className="val">{formatMeters(meters)}</span>
          </div>
        );
      })}
      {!pixelsPerMeter && (
        <div className="hint" style={{ marginTop: 8 }}>
          כדי לראות אורכים במטרים — בצע כיול קנה מידה.
        </div>
      )}
    </div>
  );
}
