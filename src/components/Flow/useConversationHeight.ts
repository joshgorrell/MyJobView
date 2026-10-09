import { useLayoutEffect, useRef, useState } from 'react';

// Account for the workspace chrome and everything above the inbox, including
// wrapped filters. A small minimum keeps embedded/short windows scrollable.
export function useConversationHeight(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(320);
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!ready || !panel) return;
    const ancestors: HTMLElement[] = [];
    for (let parent = panel.parentElement; parent; parent = parent.parentElement) ancestors.push(parent);
    const scrollParent = ancestors.find(parent => /auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.id !== 'root' && parent !== document.body && parent !== document.documentElement);
    const measure = () => {
      const viewport = window.visualViewport;
      const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      const boundary = scrollParent ? Math.min(bottom, scrollParent.getBoundingClientRect().bottom) : bottom;
      setHeight(Math.max(140, Math.floor(boundary - panel.getBoundingClientRect().top - 24)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    ancestors.forEach(parent => observer.observe(parent));
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [ready]);
  return { ref, height };
}
