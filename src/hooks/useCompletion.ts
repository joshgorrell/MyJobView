import { useCallback, useEffect, useRef, useState } from 'react';

/** Keep a confirmed result visible briefly without allowing a second submission. */
export function useCompletion(onComplete: () => void, duration = 1100) {
  const [completed, setCompleted] = useState(false);
  const callback = useRef(onComplete);
  const delivered = useRef(false);
  callback.current = onComplete;
  const finish = useCallback(() => {
    if (delivered.current) return;
    delivered.current = true;
    callback.current();
  }, []);
  useEffect(() => {
    if (!completed) return;
    const timer = window.setTimeout(finish, duration);
    return () => window.clearTimeout(timer);
  }, [completed, duration, finish]);
  return { completed, complete: () => setCompleted(true), finish };
}
