import { useState, useCallback } from 'react';
import { zoomAtPoint } from '../lib/transform.js';

// ניהול זום/הזזה ומצב כלי (ציור/הזזה). ה-viewport אינו חלק מהמסמך ולא נכנס להיסטוריה.
export function useViewport() {
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [mode, setMode] = useState('draw'); // 'draw' | 'pan'

  const zoomAt = useCallback((pointerScreen, factor) => {
    setViewport((vp) => zoomAtPoint(vp, pointerScreen, vp.scale * factor));
  }, []);

  const setViewportTo = useCallback((vp) => setViewport(vp), []);

  const toggleMode = useCallback(
    () => setMode((m) => (m === 'draw' ? 'pan' : 'draw')),
    []
  );

  return { viewport, setViewport: setViewportTo, zoomAt, mode, setMode, toggleMode };
}
