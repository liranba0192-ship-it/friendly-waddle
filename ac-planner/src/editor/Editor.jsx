import { useState, useEffect, useCallback, useRef } from 'react';
import { useProject } from '../hooks/useProject.js';
import { useHistory } from '../hooks/useHistory.js';
import { useViewport } from '../hooks/useViewport.js';
import { useAutoSave } from '../hooks/useAutoSave.js';
import { saveImage } from '../db/projectRepo.js';
import { newId } from '../lib/id.js';
import { computePixelsPerMeter } from '../lib/scale.js';
import PlanCanvas from './PlanCanvas.jsx';
import Toolbar from './Toolbar.jsx';
import TotalsPanel from './TotalsPanel.jsx';
import CalibrationWizard from './CalibrationWizard.jsx';

const EMPTY_DOC = { routes: [], pixels_per_meter: null };

export default function Editor({ projectId, onBack }) {
  const { project, imageUrl, setImageUrl, loading } = useProject(projectId);

  // מצב המסמך (routes + קנה מידה) עם undo/redo
  const { state: doc, set, commit, undo, redo, reset, canUndo, canRedo } = useHistory(EMPTY_DOC);

  // מצב תצוגה/כלים (לא נכנס להיסטוריה)
  const { viewport, setViewport, mode, setMode, toggleMode } = useViewport();
  const [activeType, setActiveType] = useState('gas');
  const [draftRouteId, setDraftRouteId] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState(null);
  const [calibration, setCalibration] = useState({ state: 'idle', a: null, b: null });
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);

  // טעינת המסמך מהפרויקט (פעם אחת לכל פרויקט)
  useEffect(() => {
    if (project) {
      reset({ routes: project.routes || [], pixels_per_meter: project.pixels_per_meter ?? null });
    }
  }, [project?.id, reset]);

  // שמירה אוטומטית
  useAutoSave(projectId, doc, useCallback(() => {
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, []));

  const isCalibrating = calibration.state !== 'idle' && calibration.state !== 'done';
  const selectedRoute = doc.routes.find((r) => r.id === selectedRouteId) || null;

  // ---- ציור ----
  const finishLine = useCallback(() => {
    if (!draftRouteId) return;
    set((d) => {
      const r = d.routes.find((x) => x.id === draftRouteId);
      if (r && r.points.length < 2) {
        return { ...d, routes: d.routes.filter((x) => x.id !== draftRouteId) };
      }
      return d;
    });
    setDraftRouteId(null);
  }, [draftRouteId, set]);

  const handleCanvasTap = useCallback(
    (pt) => {
      if (isCalibrating) {
        setCalibration((c) => {
          if (c.state === 'pickA') return { state: 'pickB', a: pt, b: null };
          if (c.state === 'pickB') return { state: 'enterDistance', a: c.a, b: pt };
          return c;
        });
        return;
      }
      setSelectedPointIndex(null);
      if (draftRouteId) {
        set((d) => ({
          ...d,
          routes: d.routes.map((r) =>
            r.id === draftRouteId ? { ...r, points: [...r.points, pt] } : r
          ),
        }));
      } else {
        const id = newId();
        set((d) => ({ ...d, routes: [...d.routes, { id, type: activeType, points: [pt] }] }));
        setDraftRouteId(id);
        setSelectedRouteId(id);
      }
    },
    [isCalibrating, draftRouteId, activeType, set]
  );

  const handleSelectType = useCallback(
    (typeId) => {
      finishLine();
      setActiveType(typeId);
      setSelectedPointIndex(null);
    },
    [finishLine]
  );

  const handleSelectRoute = useCallback(
    (id) => {
      finishLine();
      setSelectedRouteId(id);
      setSelectedPointIndex(null);
      const r = doc.routes.find((x) => x.id === id);
      if (r) setActiveType(r.type);
    },
    [finishLine, doc.routes]
  );

  // ---- עריכת קודקודים ----
  const handleMoveVertex = useCallback(
    (index, pt) => {
      set(
        (d) => ({
          ...d,
          routes: d.routes.map((r) =>
            r.id === selectedRouteId
              ? { ...r, points: r.points.map((p, i) => (i === index ? pt : p)) }
              : r
          ),
        }),
        { commit: false }
      );
    },
    [selectedRouteId, set]
  );

  const handleInsertPoint = useCallback(
    (insertIndex, pt) => {
      set((d) => ({
        ...d,
        routes: d.routes.map((r) => {
          if (r.id !== selectedRouteId) return r;
          const points = [...r.points];
          points.splice(insertIndex, 0, pt);
          return { ...r, points };
        }),
      }));
    },
    [selectedRouteId, set]
  );

  const handleDeletePoint = useCallback(() => {
    if (selectedPointIndex == null || !selectedRoute) return;
    if (selectedRoute.points.length <= 2) return;
    set((d) => ({
      ...d,
      routes: d.routes.map((r) =>
        r.id === selectedRouteId
          ? { ...r, points: r.points.filter((_, i) => i !== selectedPointIndex) }
          : r
      ),
    }));
    setSelectedPointIndex(null);
  }, [selectedPointIndex, selectedRoute, selectedRouteId, set]);

  const handleDeleteRoute = useCallback(() => {
    if (!selectedRouteId) return;
    set((d) => ({ ...d, routes: d.routes.filter((r) => r.id !== selectedRouteId) }));
    if (draftRouteId === selectedRouteId) setDraftRouteId(null);
    setSelectedRouteId(null);
    setSelectedPointIndex(null);
  }, [selectedRouteId, draftRouteId, set]);

  // ---- כיול ----
  const startCalibrate = useCallback(() => {
    finishLine();
    setSelectedRouteId(null);
    setSelectedPointIndex(null);
    setMode('draw');
    setCalibration({ state: 'pickA', a: null, b: null });
  }, [finishLine, setMode]);

  const confirmDistance = useCallback(
    (meters) => {
      const ppm = computePixelsPerMeter(calibration.a, calibration.b, meters);
      if (ppm) set((d) => ({ ...d, pixels_per_meter: ppm }));
      setCalibration({ state: 'idle', a: null, b: null });
    },
    [calibration, set]
  );

  const cancelCalibrate = useCallback(() => {
    setCalibration({ state: 'idle', a: null, b: null });
  }, []);

  // ---- העלאת תמונה ----
  const handleFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file || !project) return;
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      await saveImage(project, file);
      e.target.value = '';
    },
    [project, setImageUrl]
  );

  if (loading) {
    return <div className="editor center">טוען פרויקט…</div>;
  }

  return (
    <div className="editor">
      <div className="editor-top">
        <button className="ghost" onClick={onBack}>→ חזרה</button>
        <span className="title">{project?.client_name}</span>
        <div className="spacer" />
        <span className="save-indicator">{saved ? '✓ נשמר' : ''}</span>
        <button onClick={() => fileInputRef.current?.click()}>
          {imageUrl ? 'החלף תוכנית' : '📷 העלה תוכנית'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>

      <PlanCanvas
        imageUrl={imageUrl}
        routes={doc.routes}
        viewport={viewport}
        setViewport={setViewport}
        mode={mode}
        selectedRoute={selectedRoute}
        selectedRouteId={selectedRouteId}
        selectedPointIndex={selectedPointIndex}
        calibration={calibration}
        onCanvasTap={handleCanvasTap}
        onSelectRoute={handleSelectRoute}
        onSelectPoint={setSelectedPointIndex}
        onMoveVertex={handleMoveVertex}
        onCommitVertex={commit}
        onInsertPoint={handleInsertPoint}
      />

      {!imageUrl && (
        <div className="banner warn">
          התחל בהעלאת צילום של התוכנית (כפתור “העלה תוכנית” למעלה).
        </div>
      )}

      <TotalsPanel routes={doc.routes} pixelsPerMeter={doc.pixels_per_meter} />

      {isCalibrating && (
        <CalibrationWizard
          state={calibration.state}
          onCancel={cancelCalibrate}
          onConfirmDistance={confirmDistance}
        />
      )}

      <Toolbar
        activeType={activeType}
        onSelectType={handleSelectType}
        mode={mode}
        onToggleMode={toggleMode}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        hasSelectedRoute={!!selectedRouteId}
        hasSelectedPoint={selectedPointIndex != null}
        canDeletePoint={selectedRoute ? selectedRoute.points.length > 2 : false}
        isDrawingDraft={!!draftRouteId}
        onFinishLine={finishLine}
        onDeleteRoute={handleDeleteRoute}
        onDeletePoint={handleDeletePoint}
        onCalibrate={startCalibrate}
        hasScale={!!doc.pixels_per_meter}
      />
    </div>
  );
}
