import { useEffect, useRef } from 'react';

/** Measure the rendered email so the surrounding preview has one scroll area. */
export function FullEmailPreview({ html, title }: { html: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), [html]);

  function loaded() {
    cleanup.current?.();
    const element = frame.current;
    const document = element?.contentDocument;
    if (!element || !document?.body) return;
    function measure() {
      if (!element || !document?.body) return;
      element.style.height = '1px';
      element.style.height = `${Math.max(320, document.documentElement.scrollHeight, document.body.scrollHeight) + 1}px`;
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener('resize', measure);
    cleanup.current = () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }

  return <iframe ref={frame} title={title} sandbox="allow-same-origin" srcDoc={html}
    onLoad={loaded} className="block w-full border-0 bg-white" style={{ height: 320 }} />;
}
