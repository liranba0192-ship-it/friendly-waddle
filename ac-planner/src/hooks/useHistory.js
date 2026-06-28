import { useState, useCallback, useRef } from 'react';

// Undo/Redo מבוסס snapshots. ה-state כאן הוא "המסמך" (routes + pixels_per_meter).
// commit=false מעדכן את ההווה בלי לדחוף להיסטוריה (לשימוש תוך כדי גרירה);
// בסוף המחווה קוראים ל-commit() כדי לקבע צעד undo אחד לכל מחווה.
const LIMIT = 50;

export function useHistory(initial) {
  const [state, setState] = useState({ past: [], present: initial, future: [] });
  // שומר עותק של ה"הווה לפני המחווה" כדי שגרירה תיצור צעד undo אחד.
  const gestureBase = useRef(null);

  const set = useCallback((updater, { commit = true } = {}) => {
    setState((s) => {
      const next = typeof updater === 'function' ? updater(s.present) : updater;
      if (next === s.present) return s;
      if (commit) {
        const past = [...s.past, s.present].slice(-LIMIT);
        return { past, present: next, future: [] };
      }
      // עדכון "חי" בלי לקבע היסטוריה — נשמור את הבסיס למחווה אם עוד לא נשמר
      if (gestureBase.current === null) gestureBase.current = s.present;
      return { ...s, present: next };
    });
  }, []);

  // מקבע את השינוי שנעשה ב-commit:false כצעד undo אחד.
  const commit = useCallback(() => {
    setState((s) => {
      if (gestureBase.current === null) return s;
      const base = gestureBase.current;
      gestureBase.current = null;
      if (base === s.present) return s;
      const past = [...s.past, base].slice(-LIMIT);
      return { past, present: s.present, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        present: previous,
        future: [s.present, ...s.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        past: [...s.past, s.present],
        present: next,
        future: s.future.slice(1),
      };
    });
  }, []);

  // איפוס מלא (בטעינת פרויקט אחר) — בלי היסטוריה.
  const reset = useCallback((value) => {
    gestureBase.current = null;
    setState({ past: [], present: value, future: [] });
  }, []);

  return {
    state: state.present,
    set,
    commit,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
