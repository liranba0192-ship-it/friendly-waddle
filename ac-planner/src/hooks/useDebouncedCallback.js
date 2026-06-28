import { useRef, useEffect, useCallback } from 'react';

// מחזיר פונקציה עם debounce + יכולת flush מיידי. שימושי לשמירה אוטומטית.
export function useDebouncedCallback(fn, delay = 600) {
  const timer = useRef(null);
  const lastArgs = useRef(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      if (lastArgs.current) {
        fnRef.current(...lastArgs.current);
        lastArgs.current = null;
      }
    }
  }, []);

  const debounced = useCallback(
    (...args) => {
      lastArgs.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        lastArgs.current = null;
        fnRef.current(...args);
      }, delay);
    },
    [delay]
  );

  useEffect(() => () => flush(), [flush]);

  return [debounced, flush];
}
