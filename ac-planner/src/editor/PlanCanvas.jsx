import { useRef, useEffect, useState, useCallback } from 'react';
import { Stage } from 'react-konva';
import BackgroundLayer from './layers/BackgroundLayer.jsx';
import RoutesLayer from './layers/RoutesLayer.jsx';
import HandlesLayer from './layers/HandlesLayer.jsx';
import CalibrationLayer from './layers/CalibrationLayer.jsx';
import { zoomAtPoint, fitImage } from '../lib/transform.js';

export default function PlanCanvas({
  imageUrl,
  routes,
  viewport,
  setViewport,
  mode, // 'draw' | 'pan'
  selectedRoute,
  selectedRouteId,
  selectedPointIndex,
  calibration, // {state, a, b}
  onImageLoad,
  onCanvasTap, // (imagePt) => void  — הקשה על אזור ריק במצב ציור/כיול
  onSelectRoute,
  onSelectPoint,
  onMoveVertex,
  onCommitVertex,
  onInsertPoint,
}) {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [imgDims, setImgDims] = useState(null);
  const fittedRef = useRef(false);
  const lastTapRef = useRef(0);
  const pinchRef = useRef(null);

  // מדידת גודל המיכל
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // איפוס התאמה כשמתחלפת תמונה
  useEffect(() => {
    fittedRef.current = false;
  }, [imageUrl]);

  // התאמת התמונה למסך פעם אחת כשהתמונה והמיכל מוכנים
  const handleImageLoad = useCallback(
    (dims) => {
      setImgDims(dims);
      onImageLoad?.(dims);
    },
    [onImageLoad]
  );

  useEffect(() => {
    if (!fittedRef.current && imgDims && size.width && size.height) {
      setViewport(fitImage(imgDims.width, imgDims.height, size.width, size.height));
      fittedRef.current = true;
    }
  }, [imgDims, size, setViewport]);

  const isCalibrating = calibration && calibration.state !== 'idle' && calibration.state !== 'done';
  const drawingActive = mode === 'draw' || isCalibrating;

  // הקשה על אזור ריק (לא על קו/ידית) → הוספת נקודה או נקודת כיול
  const handleStageClick = useCallback(
    (e) => {
      if (e.target !== e.target.getStage()) return; // נלחץ על shape — לא אזור ריק
      if (!drawingActive) return;
      // דדופ בין tap ל-click ש-Konva יורה שניהם במגע (יורים בהפרש של מילישניות
      // בודדות). חלון קצר כדי לא לחסום הקשות מהירות אמיתיות נקודה-נקודה.
      const t = performance.now();
      if (t - lastTapRef.current < 120) return;
      lastTapRef.current = t;
      const stage = stageRef.current;
      const p = stage.getRelativePointerPosition(); // קואורדינטות image-space
      onCanvasTap(p);
    },
    [drawingActive, onCanvasTap]
  );

  // זום בגלגלת (דסקטופ)
  const handleWheel = useCallback(
    (e) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition();
      const factor = e.evt.deltaY > 0 ? 0.9 : 1.1;
      setViewport(zoomAtPoint(viewport, pointer, viewport.scale * factor));
    },
    [viewport, setViewport]
  );

  // פינץ' זום (שתי אצבעות) — עובד בכל מצב
  const handleTouchMove = useCallback(
    (e) => {
      const touches = e.evt.touches;
      if (touches.length !== 2) return;
      e.evt.preventDefault();
      const stage = stageRef.current;
      const rect = stage.container().getBoundingClientRect();
      const p1 = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top };
      const p2 = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top };
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      if (pinchRef.current) {
        const factor = dist / pinchRef.current.dist;
        setViewport(zoomAtPoint(viewport, center, viewport.scale * factor));
      }
      pinchRef.current = { dist, center };
    },
    [viewport, setViewport]
  );

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
  }, []);

  // במצב הזזה ה-Stage נגרר; מעדכנים viewport מהמיקום בסוף הגרירה ותוך כדי
  const handleDragMove = useCallback(
    (e) => {
      const stage = e.target.getStage();
      if (e.target !== stage) return;
      setViewport({ ...viewport, x: stage.x(), y: stage.y() });
    },
    [viewport, setViewport]
  );

  const draggable = mode === 'pan' && !isCalibrating;

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        x={viewport.x}
        y={viewport.y}
        draggable={draggable}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDragMove={handleDragMove}
      >
        <BackgroundLayer imageUrl={imageUrl} onLoad={handleImageLoad} />
        <RoutesLayer
          routes={routes}
          scale={viewport.scale}
          selectedRouteId={selectedRouteId}
          onSelectRoute={onSelectRoute}
        />
        {selectedRoute && mode === 'draw' && !isCalibrating && (
          <HandlesLayer
            route={selectedRoute}
            scale={viewport.scale}
            selectedPointIndex={selectedPointIndex}
            onSelectPoint={onSelectPoint}
            onMoveVertex={onMoveVertex}
            onCommitVertex={onCommitVertex}
            onInsertPoint={onInsertPoint}
          />
        )}
        {isCalibrating && (
          <CalibrationLayer a={calibration.a} b={calibration.b} scale={viewport.scale} />
        )}
      </Stage>
    </div>
  );
}
