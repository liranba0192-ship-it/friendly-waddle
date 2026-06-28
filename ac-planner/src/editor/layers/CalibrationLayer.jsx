import { Layer, Circle, Line, Group } from 'react-konva';

// שכבת כיול — מוצגת רק בזמן האשף: שתי הנקודות והקו המקווקו ביניהן.
export default function CalibrationLayer({ a, b, scale }) {
  const r = 8 / scale;
  const stroke = 2 / scale;
  const color = '#d1242f';
  return (
    <Layer listening={false}>
      {a && b && (
        <Line
          points={[a.x, a.y, b.x, b.y]}
          stroke={color}
          strokeWidth={stroke}
          dash={[10 / scale, 6 / scale]}
        />
      )}
      {[a, b].filter(Boolean).map((p, i) => (
        <Group key={i}>
          <Circle x={p.x} y={p.y} radius={r} fill="#fff" stroke={color} strokeWidth={stroke} />
        </Group>
      ))}
    </Layer>
  );
}
