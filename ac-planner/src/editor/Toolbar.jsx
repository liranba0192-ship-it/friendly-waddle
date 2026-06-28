import { ROUTE_TYPES } from '../constants/routeTypes.js';

// סרגל הכלים התחתון. מינימום אפשרויות, כפתורים גדולים.
export default function Toolbar({
  activeType,
  onSelectType,
  mode,
  onToggleMode,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  hasSelectedRoute,
  hasSelectedPoint,
  canDeletePoint,
  isDrawingDraft,
  onFinishLine,
  onDeleteRoute,
  onDeletePoint,
  onCalibrate,
  hasScale,
}) {
  return (
    <div className="toolbar">
      {/* בורר סוג מסלול */}
      {ROUTE_TYPES.map((t) => {
        const active = t.id === activeType;
        return (
          <button
            key={t.id}
            className={`type-btn${active ? ' active' : ''}`}
            style={active ? { background: t.color, borderColor: t.color } : { borderColor: t.color }}
            onClick={() => onSelectType(t.id)}
          >
            <span className="dot" style={{ background: active ? '#fff' : t.color }} />
            {t.label}
          </button>
        );
      })}

      <div className="spacer" />

      {isDrawingDraft && (
        <button className="primary" onClick={onFinishLine}>סיום קו</button>
      )}

      {/* מצב ציור/הזזה */}
      <button onClick={onToggleMode}>{mode === 'draw' ? '✋ הזזה' : '✏️ ציור'}</button>

      {/* undo/redo */}
      <button className="icon" onClick={onUndo} disabled={!canUndo} title="בטל">↶</button>
      <button className="icon" onClick={onRedo} disabled={!canRedo} title="בצע שוב">↷</button>

      {/* מחיקה */}
      {hasSelectedPoint ? (
        <button className="danger" onClick={onDeletePoint} disabled={!canDeletePoint}>מחק נקודה</button>
      ) : (
        <button className="danger" onClick={onDeleteRoute} disabled={!hasSelectedRoute}>מחק קו</button>
      )}

      {/* כיול */}
      <button className={hasScale ? '' : 'primary'} onClick={onCalibrate}>
        📏 {hasScale ? 'כייל מחדש' : 'כיול קנה מידה'}
      </button>
    </div>
  );
}
