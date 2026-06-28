import { Layer, Circle, Group } from 'react-konva';
import { routeColor } from '../../constants/routeTypes.js';
import { midpoint } from '../../lib/geometry.js';

// ידיות עריכה למסלול הנבחר: גרירת קודקודים + סמני "+" באמצע קטעים להוספת נקודה.
// גדלים מחולקים ב-scale כדי להישאר קבועים ויזואלית בכל זום.
export default function HandlesLayer({
  route,
  scale,
  selectedPointIndex,
  onSelectPoint,
  onMoveVertex,
  onCommitVertex,
  onInsertPoint,
}) {
  if (!route || !route.points || route.points.length === 0) return null;
  const color = routeColor(route.type);
  const r = 9 / scale;
  const stroke = 2 / scale;

  return (
    <Layer>
      {/* סמני "+" באמצע כל קטע — להוספת נקודה */}
      {route.points.slice(0, -1).map((p, i) => {
        const m = midpoint(p, route.points[i + 1]);
        return (
          <Group key={`mid-${i}`}>
            <Circle
              x={m.x}
              y={m.y}
              radius={r * 0.7}
              fill="#fff"
              stroke={color}
              strokeWidth={stroke}
              opacity={0.85}
              onClick={(e) => {
                e.cancelBubble = true;
                onInsertPoint(i + 1, m);
              }}
              onTap={(e) => {
                e.cancelBubble = true;
                onInsertPoint(i + 1, m);
              }}
            />
          </Group>
        );
      })}

      {/* קודקודים — גרירה להזזה, הקשה לבחירה */}
      {route.points.map((p, i) => {
        const isSel = i === selectedPointIndex;
        return (
          <Circle
            key={`v-${i}`}
            x={p.x}
            y={p.y}
            radius={isSel ? r * 1.3 : r}
            fill={isSel ? color : '#fff'}
            stroke={color}
            strokeWidth={stroke}
            draggable
            onDragMove={(e) => onMoveVertex(i, { x: e.target.x(), y: e.target.y() })}
            onDragEnd={() => onCommitVertex()}
            onClick={(e) => {
              e.cancelBubble = true;
              onSelectPoint(i);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              onSelectPoint(i);
            }}
          />
        );
      })}
    </Layer>
  );
}
