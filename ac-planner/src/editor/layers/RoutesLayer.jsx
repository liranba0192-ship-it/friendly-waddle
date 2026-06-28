import { Layer, Line } from 'react-konva';
import { routeColor } from '../../constants/routeTypes.js';

// שכבת המסלולים — קו לכל מסלול. hitStrokeWidth רחב כדי שקל יהיה להקיש על קו דק.
// עובי הקו מחולק ב-scale כדי להישאר קבוע ויזואלית בכל זום.
export default function RoutesLayer({ routes, scale, selectedRouteId, onSelectRoute }) {
  const w = 3 / scale;
  return (
    <Layer>
      {routes.map((route) => {
        if (!route.points || route.points.length === 0) return null;
        const flat = route.points.flatMap((p) => [p.x, p.y]);
        const selected = route.id === selectedRouteId;
        return (
          <Line
            key={route.id}
            points={flat}
            stroke={routeColor(route.type)}
            strokeWidth={selected ? w * 1.8 : w}
            hitStrokeWidth={24 / scale}
            lineCap="round"
            lineJoin="round"
            shadowColor={selected ? '#000' : undefined}
            shadowBlur={selected ? 6 / scale : 0}
            shadowOpacity={selected ? 0.4 : 0}
            onClick={(e) => {
              e.cancelBubble = true;
              onSelectRoute(route.id);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              onSelectRoute(route.id);
            }}
          />
        );
      })}
    </Layer>
  );
}
